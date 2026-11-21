/**
 * Contexto do card no funil (21/11/2026, Kelvin): a IA lê a conversa de cada lead e escreve a temperatura
 * (quente, morno, frio), o resumo do que foi conversado, a última resposta, por que parou e o objetivo da
 * próxima ligação. O portal usa a temperatura para pôr o card na etapa certa (quente → Demonstrou interesse,
 * morno → Conversa iniciada) e mostra o contexto no card, para o Kelvin e a ligação da IA não ficarem perdidos.
 *
 * Roda no relógio: só os leads com mensagem nova desde o último contexto, poucos por rodada.
 */
import { db } from "./db.ts";
import { callLLM } from "./llm.ts";
import { nomeDaSdr } from "./sdrs.ts";

export interface ContextoCard {
  temperatura: "quente" | "morno" | "frio";
  resumo: string;
  ultima_resposta: string | null;
  ultima_resposta_em: string | null;
  motivo_parou: string | null;
  objetivo_ligacao: string;
  /** Uma pessoa da empresa (não robô) respondeu? Sem isso o card não sai de "Mensagem ou ligação". */
  conversou: boolean;
  sdr: string;
  atualizado_em: string;
}

const POR_RODADA = 25;

const SISTEMA = `Você analisa conversas de prospecção da DemandIA (marketing, vendas e tecnologia sob medida para empresas) pelo WhatsApp.
A SDR (Gabi ou Marina) procurou a empresa. Classifique o lead e escreva o contexto para a próxima LIGAÇÃO.

Temperatura:
- "quente": uma PESSOA (não robô) mostrou interesse de verdade: topou conversar ou marcar, pediu horário, pediu o diagnóstico e reagiu bem a ele, disse "vou ver com o dono e te chamo", "interessante", perguntou preço ou como funciona querendo saber mais, ou combinou retorno.
- "morno": uma pessoa respondeu e conversou um pouco (cumprimentou, perguntou do que se trata, pediu para mandar), mas a conversa parou sem sinal claro de interesse.
- "frio": nunca respondeu, só respondeu robô/atendimento automático/menu, respondeu algo sem relação, ou recusou ("já temos agência", "não temos interesse").
Mensagens de robô (menus, "bem-vindo", "nosso horário de atendimento", "assim que possível retornaremos", cardápio, promoções) NÃO contam como resposta.
Um "pode sim" ou "pode mandar" sozinho para receber o diagnóstico, sem nenhuma reação depois, é morno, não quente.

"conversou": true só se uma PESSOA da empresa respondeu de verdade (não conta robô, menu, resposta automática, promoção, figurinha ou reação).
Responda SÓ um JSON:
{"conversou":true|false,"temperatura":"quente|morno|frio","resumo":"1 a 2 frases: o que aconteceu na conversa","ultima_resposta":"a última mensagem de gente da empresa, curta, ou null","motivo_parou":"por que a conversa parou, em poucas palavras, ou null","objetivo_ligacao":"1 frase: o que a ligação deve conseguir, com o gancho certo (ex.: falar com o Adriano, o dono, e marcar 20 a 30 minutinhos com o Kelvin; retomar o diagnóstico que ela pediu)"}
Escreva em português do Brasil, simples, sem travessão.`;

function fmt(d: string) {
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export async function atualizarContextos(): Promise<{ atualizados: number; frios_sem_ia: number; erros: number }> {
  // Leads com conversa nova desde o último contexto (ou nunca analisados), mais recentes primeiro
  const { data: leads } = await db()
    .from("sdr_leads")
    .select("id, empresa, nome, agente, status, last_inbound_at, last_outbound_at, contexto")
    .is("lixeira_em", null)
    .not("last_outbound_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1000);
  const pendentes = (leads ?? []).filter((l) => {
    const c = l.contexto as ContextoCard | null;
    if (!c?.atualizado_em) return true;
    const ultima = Math.max(Date.parse(l.last_inbound_at ?? "") || 0, Date.parse(l.last_outbound_at ?? "") || 0);
    return ultima > Date.parse(c.atualizado_em);
  });
  let atualizados = 0;
  let frios = 0;
  let erros = 0;
  const vez = pendentes.slice(0, POR_RODADA);
  const fila = [...vez];
  async function trabalhar() {
    for (let l = fila.shift(); l; l = fila.shift()) {
      try {
        const { data: msgs } = await db()
          .from("sdr_messages")
          .select("direction, content, created_at")
          .eq("lead_id", l.id)
          .order("created_at", { ascending: false })
          .limit(30);
        const hist = (msgs ?? []).reverse();
        const gente = hist.filter((m) => m.direction === "in" && !String(m.content ?? "").startsWith("[resposta automática]"));
        const agora = new Date().toISOString();
        const sdr = nomeDaSdr(l.agente);
        let ctx: ContextoCard;
        if (!gente.length) {
          // Nunca respondeu: não precisa de IA
          frios++;
          ctx = {
            temperatura: "frio",
            resumo: `A ${sdr} mandou ${hist.filter((m) => m.direction === "out").length} mensagem(ns) e a empresa nunca respondeu.`,
            ultima_resposta: null,
            ultima_resposta_em: null,
            motivo_parou: "Nunca respondeu",
            objetivo_ligacao: "Apresentar a DemandIA, descobrir quem é o dono ou responsável e oferecer o diagnóstico gratuito ou 20 a 30 minutinhos com o Kelvin.",
            conversou: false,
            sdr,
            atualizado_em: agora,
          };
        } else {
          const texto = hist
            .map((m) => `[${fmt(m.created_at)}] ${m.direction === "in" ? "EMPRESA" : sdr.toUpperCase()}: ${String(m.content ?? "").slice(0, 600)}`)
            .join("\n");
          const r = await callLLM({
            system: SISTEMA,
            messages: [{ role: "user", content: `Empresa: ${l.empresa ?? l.nome ?? "?"}\n\nConversa:\n${texto}` }],
            json: true,
            maxTokens: 1500,
          });
          const j = JSON.parse(r.message.content ?? "{}") as Partial<ContextoCard>;
          // Encerrado (desqualificado ou pediu para sair) nunca volta como quente ou morno sozinho
          const encerrado = l.status === "desqualificado" || l.status === "opt_out";
          const conversou = j.conversou === true;
          // Sem conversa de verdade (só robô) não existe quente nem morno
          const temp = !encerrado && conversou && (j.temperatura === "quente" || j.temperatura === "morno") ? j.temperatura : "frio";
          const ultimaGente = gente[gente.length - 1];
          ctx = {
            temperatura: temp,
            resumo: String(j.resumo ?? "").slice(0, 400),
            ultima_resposta: j.ultima_resposta ? String(j.ultima_resposta).slice(0, 300) : null,
            ultima_resposta_em: ultimaGente?.created_at ?? null,
            motivo_parou: j.motivo_parou ? String(j.motivo_parou).slice(0, 200) : null,
            objetivo_ligacao: String(j.objetivo_ligacao ?? "").slice(0, 300),
            conversou,
            sdr,
            atualizado_em: agora,
          };
        }
        await db()
          .from("sdr_leads")
          .update({ contexto: ctx, temperatura: ctx.temperatura, temperatura_motivo: ctx.resumo.slice(0, 200), temperatura_em: ctx.atualizado_em })
          .eq("id", l.id);
        atualizados++;
      } catch (e) {
        erros++;
        console.error("contexto do card:", l.id, e);
      }
    }
  }
  await Promise.all([trabalhar(), trabalhar(), trabalhar(), trabalhar(), trabalhar()]);
  return { atualizados, frios_sem_ia: frios, erros };
}
