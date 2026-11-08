/**
 * Conversa do Kelvin com um agente do Time Comercial IA (texto ou áudio já transcrito).
 * O agente primeiro mostra o que entendeu e o contexto que está vendo agora (números reais da operação),
 * e só então traz a melhor solução e as hipóteses para avançar. Segue o manual dele e o playbook (editáveis no portal).
 */
import { db } from "./db.ts";
import { callLLM, type ChatMessage } from "./llm.ts";
import { carregarPlaybook, manuaisAtuais, playbookAtual } from "./playbook.ts";

export const AGENTES = ["ana", "leo", "rita", "bia", "duda", "rui", "caio", "gabi", "marina", "davi"] as const;
export type Agente = (typeof AGENTES)[number];

export interface RespostaAgente {
  entendi: string;
  contexto: string;
  solucao: string;
  hipoteses: string[];
  proximo_passo: string;
  pergunta?: string | null;
}

const conta = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

/** Retrato curto da operação agora, para o agente responder com base no que está acontecendo. */
export async function contextoDaOperacao(): Promise<string> {
  const ol = () => db().from("outreach_leads").select("place_id", { count: "exact", head: true });
  const [leo, rita, duda, msgs, disparar, abordados, responderam, reunioes, canal, conversas] = await Promise.all([
    conta(ol().eq("wa_status", "pendente").eq("leo_status", "pendente")),
    conta(ol().eq("rita_status", "pendente")),
    conta(ol().eq("duda_status", "pendente")),
    conta(ol().eq("wa_status", "pendente").eq("msg_status", "rascunho")),
    conta(ol().eq("wa_status", "pendente").eq("msg_status", "aprovada")),
    conta(ol().gt("toque_atual", 0)),
    conta(ol().eq("status_comercial", "respondeu")),
    conta(ol().in("status_comercial", ["reuniao", "reuniao_realizada"])),
    conta(db().from("ana_canal").select("id", { count: "exact", head: true }).in("status", ["pendente", "aguardando_ok"])),
    conta(db().from("sdr_leads").select("id", { count: "exact", head: true }).gte("last_inbound_at", new Date(Date.now() - 7 * 864e5).toISOString())),
  ]);
  const { data: nichos } = await db().from("outreach_leads").select("nicho").gt("toque_atual", 0).limit(400);
  const porNicho = new Map<string, number>();
  for (const n of (nichos ?? []) as { nicho: string | null }[]) if (n.nicho) porNicho.set(n.nicho, (porNicho.get(n.nicho) ?? 0) + 1);
  const topo = [...porNicho].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, q]) => `${n} (${q})`).join(", ");
  return [
    `Lista do Léo esperando aprovação: ${leo}`,
    `Diagnósticos da Rita esperando aprovação: ${rita}`,
    `Relatórios e sites da Duda esperando aprovação: ${duda}`,
    `Mensagens da Bia e do Rui esperando aprovação: ${msgs}`,
    `Aprovados prontos para disparar: ${disparar}`,
    `Empresas já abordadas: ${abordados} (nichos: ${topo || "nenhum ainda"})`,
    `Responderam e estão em conversa: ${responderam}`,
    `Reuniões agendadas ou feitas: ${reunioes}`,
    `Contatos que falaram com a gente nos últimos 7 dias: ${conversas}`,
    `Pedidos no canal Você e a Ana sem resposta: ${canal}`,
  ].join("\n");
}

/** Resposta em texto corrido para guardar e mostrar (sem markdown, sem travessão). */
export function respostaEmTexto(r: RespostaAgente): string {
  const hip = r.hipoteses.filter(Boolean).map((h, i) => `${i + 1}. ${h}`).join("\n");
  return [
    `Entendi assim: ${r.entendi}`,
    `O que estou vendo agora: ${r.contexto}`,
    `Melhor solução: ${r.solucao}`,
    hip ? `Hipóteses para avançar:\n${hip}` : "",
    r.proximo_passo ? `Próximo passo: ${r.proximo_passo}` : "",
    r.pergunta ? `Preciso de você: ${r.pergunta}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\s[—–]\s/g, ", ");
}

const limpa = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s[—–]\s/g, ", ") : "");

export function lerResposta(bruto: string): RespostaAgente | null {
  try {
    const j = JSON.parse(bruto) as Record<string, unknown>;
    const r: RespostaAgente = {
      entendi: limpa(j.entendi),
      contexto: limpa(j.contexto),
      solucao: limpa(j.solucao),
      hipoteses: Array.isArray(j.hipoteses) ? j.hipoteses.map(limpa).filter(Boolean).slice(0, 4) : [],
      proximo_passo: limpa(j.proximo_passo),
      pergunta: limpa(j.pergunta) || null,
    };
    return r.entendi && r.solucao ? r : null;
  } catch {
    return null;
  }
}

/** O agente lê o pedido, o histórico e a operação, e responde no formato analisar → solução → hipóteses. */
export async function responderAgente(agente: Agente, pedido: string): Promise<{ texto: string; estrutura: RespostaAgente }> {
  await carregarPlaybook();
  const [{ data: m }, { data: ultimas }, operacao] = await Promise.all([
    db().from("agentes_manuais").select("nome,cargo").eq("id", agente).maybeSingle(),
    db().from("time_conversas").select("autor,conteudo").eq("agente", agente).order("created_at", { ascending: false }).limit(10),
    contextoDaOperacao().catch(() => "não consegui ler os números agora"),
  ]);
  const nome = (m as { nome?: string } | null)?.nome ?? agente;
  const cargo = (m as { cargo?: string } | null)?.cargo ?? "agente do time comercial";
  const historico = ((ultimas ?? []) as { autor: string; conteudo: string }[])
    .reverse()
    .map((x) => `${x.autor === "kelvin" ? "Kelvin" : nome}: ${x.conteudo.slice(0, 600)}`)
    .join("\n");

  const system = `Você é ${nome}, ${cargo} no Time Comercial IA da DemandIA. O Kelvin, dono da DemandIA e seu gestor, está falando com você (às vezes por áudio transcrito, que pode vir com erros: DemandIA às vezes aparece como Temendy ou Demand IA).

Como responder, nesta ordem:
1. Primeiro analise o que ele falou: diga em uma ou duas frases o que você entendeu, incluindo o objetivo por trás do pedido.
2. Ligue ao contexto: use os números da operação abaixo, o seu manual e o playbook. Cite números quando ajudar.
3. Só depois traga a melhor solução, concreta e dentro do que você faz no time.
4. Traga de 2 a 4 hipóteses para avançar (o que testar, o que mudar, o que medir), cada uma curta e acionável.
5. Diga o próximo passo. Se faltar uma informação essencial, faça UMA pergunta.

Regras: português do Brasil, tom humano e direto, sem travessão, sem markdown, sem inventar dados. Se o pedido for de outro agente, diga quem resolve. Para mudar o seu jeito de trabalhar de forma permanente, lembre que o Kelvin pode editar o seu manual no portal.

Responda só em JSON: {"entendi": "...", "contexto": "...", "solucao": "...", "hipoteses": ["...", "..."], "proximo_passo": "...", "pergunta": "... ou vazio"}

Operação agora:
${operacao}
${playbookAtual() ? `\nPlaybook comercial (o Kelvin edita no portal):\n${playbookAtual()}\n` : ""}${manuaisAtuais(agente) ? `\n${manuaisAtuais(agente)}\n` : ""}
${historico ? `Conversa até aqui:\n${historico}` : "Primeira conversa com ele."}`;

  const msgs: ChatMessage[] = [{ role: "user", content: pedido }];
  const r = await callLLM({ system, messages: msgs, json: true, maxTokens: 1800 });
  const estrutura = lerResposta(r.message.content ?? "") ?? {
    entendi: pedido.slice(0, 200),
    contexto: "",
    solucao: limpa(r.message.content) || "Não consegui organizar a resposta agora. Me manda de novo?",
    hipoteses: [],
    proximo_passo: "",
  };
  return { texto: respostaEmTexto(estrutura), estrutura };
}
