/**
 * Prospecção ativa · quando a recepção passa um e-mail na conversa ("pode mandar para contato@..."),
 * a Ana salva o e-mail no cadastro e escreve o e-mail da análise. O rascunho fica na ficha do lead no
 * portal, para o Kelvin revisar e enviar (nada sai sozinho).
 */
import { db } from "./db.ts";
import { env } from "./env.ts";
import { callLLM } from "./llm.ts";
import { sendText } from "./evolution.ts";
import { humanizar } from "./estilo.ts";
import { SDR_CONFIG } from "../config/sdr.ts";
import { nomeCurto } from "./diagnostico-perfil.ts";
import type { Prospeccao } from "./prospeccao.ts";

const NAO_E_EMAIL = /\.(png|jpe?g|gif|webp)$|@(example|exemplo)\./i;

/** E-mails escritos numa mensagem (sem repetir, no máximo 3). */
export function emailsNoTexto(texto: string): string[] {
  return [...new Set((texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []).map((e) => e.toLowerCase().replace(/\.$/, "")))]
    .filter((e) => !NAO_E_EMAIL.test(e))
    .slice(0, 3);
}

export function promptRascunho(p: Prospeccao, para: string[], conversa: string): string {
  const C = SDR_CONFIG;
  return `Você é ${C.nomeAssistente}, da ${C.empresa.nome}. Na conversa de WhatsApp abaixo, alguém da ${nomeCurto(p.empresa ?? "")} pediu para você mandar a análise por e-mail (${para.join(", ")}).
Escreva esse e-mail.

Conversa (as últimas mensagens):
${conversa}

Diagnóstico do perfil no Google (fatos verificados; use SÓ estes números): ${JSON.stringify(p.diagnostico ?? {})}

Como escrever:
- Abra com "Olá, <nome de quem pediu>, tudo bem?" se o nome aparecer na conversa; senão "Olá, tudo bem?".
- 1 frase dizendo quem é você e que está mandando a análise como combinado no WhatsApp.
- O resumo: 1 ponto forte e 1 oportunidade, com os números do diagnóstico e o que isso causa na prática.
- O que o diagnóstico completo mostra (onde a empresa aparece nas buscas, onde perde para concorrentes, o que ajustar primeiro): gratuito, 30 minutos com um dos nossos especialistas em presença digital.
- Feche com UMA chamada para ação: indicar quem cuida do marketing e um horário, respondendo o e-mail ou no WhatsApp ${C.whatsapp.exibicao}.
- Entre 90 e 150 palavras, parágrafos curtos, sem travessão, sem emoji, sem assinatura (entra sozinha). Nunca cite nomes da equipe.
- ASSUNTO: 3 a 8 palavras, específico, com o nome curto da empresa.

Responda SOMENTE com JSON: {"assunto": "...", "texto": "..."}`;
}

/** Salva o e-mail no lead, escreve o rascunho e avisa o Kelvin. Nunca envia. */
export async function rascunhoDoEmailPassado(p: Prospeccao & { place_id: string; email?: string | null }, para: string[], conversa: string) {
  if (!p.email) await db().from("outreach_leads").update({ email: para[0] }).eq("place_id", p.place_id);
  const r = await callLLM({ system: promptRascunho(p, para, conversa), messages: [{ role: "user", content: "Escreva o e-mail." }], maxTokens: 2500, json: true });
  const raw = r.message.content ?? "";
  const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { assunto?: string; texto?: string };
  const assunto = humanizar(j.assunto ?? "").replace(/\n/g, " ") || `${nomeCurto(p.empresa ?? "")} no Google`;
  const texto = humanizar(j.texto ?? "");
  if (!texto) return;
  await db().from("outreach_log").insert({
    channel: "email",
    event: "email_rascunho",
    place_id: p.place_id,
    detail: { para, assunto, texto, msg: `Rascunho pronto para ${para.join(", ")} (revisar na ficha)` },
  });
  if (env.alertPhone) {
    await sendText(env.alertPhone, `✉️ ${nomeCurto(p.empresa ?? "")} passou o e-mail ${para.join(", ")} na conversa.\nO e-mail da análise está pronto para você revisar e enviar na ficha da empresa (Prospecção > Funil).`).catch(() => null);
  }
}
