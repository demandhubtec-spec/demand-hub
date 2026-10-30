/**
 * Prospecção ativa · mensagem avulsa para um lead, enviada pelo portal depois que o Kelvin revisou o texto
 * (só perfil "dono"). Serve para o follow-up feito à mão e para mandar a análise ao e-mail que a recepção passou.
 *
 *   POST { place_id, canal: "email", para: ["a@x.com"], assunto, texto }  → e-mail do Gmail da Ana, com assinatura
 *   POST { place_id, canal: "whatsapp", texto, para_whatsapp? }           → WhatsApp da Ana, balão por balão
 *        (para_whatsapp: outro número da mesma empresa, ex.: o administrativo que a recepção indicou)
 *   → { ok, enviados }
 */
import { db, addMessage, upsertLeadByPhone } from "@/src/lib/db.ts";
import { sendText } from "@/src/lib/evolution.ts";
import { comRodape, gmailRemetente, gmailSend } from "@/src/lib/outreach-email.ts";

export const runtime = "nodejs";
export const maxDuration = 120;

const ORIGENS = ["https://portal.demandhub.com.br", "https://demand-hub-tau.vercel.app", "http://localhost:5173"];
function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Separa os balões do WhatsApp (linha em branco), no máximo 4. */
function baloesAvulso(texto: string): string[] {
  return texto.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean).slice(0, 4);
}

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { place_id?: string; canal?: string; para?: string[]; assunto?: string; texto?: string; para_whatsapp?: string };
  const texto = (body.texto ?? "").trim();
  if (!body.place_id || !texto || !["email", "whatsapp"].includes(body.canal ?? "")) return json({ error: "informe place_id, canal e texto" }, 400);
  if (/[—–]/.test(texto)) return json({ error: "o texto tem travessão; troque por vírgula ou ponto" }, 400);

  const { data: lead } = await db().from("outreach_leads").select("place_id,empresa,whatsapp,email").eq("place_id", body.place_id).maybeSingle();
  if (!lead) return json({ error: "lead não encontrado" }, 404);
  const log = (channel: string, event: string, detail: Record<string, unknown>) =>
    db().from("outreach_log").insert({ channel, event, detail, place_id: lead.place_id });

  try {
    if (body.canal === "email") {
      const para = [...new Set((body.para ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean))];
      if (!para.length || !para.every((x) => EMAIL.test(x))) return json({ error: "e-mail inválido" }, 400);
      const assunto = (body.assunto ?? "").trim();
      if (!assunto) return json({ error: "informe o assunto" }, 400);
      const enviado = await gmailSend(para.join(", "), assunto, comRodape(texto), await gmailRemetente());
      if (!lead.email) await db().from("outreach_leads").update({ email: para[0] }).eq("place_id", lead.place_id);
      await log("email", "sent", { to: para.join(", "), subject: assunto, avulso: true, thread: enviado.threadId, msg: `${para.join(", ")} · ${assunto} (avulso)` });
      return json({ ok: true, enviados: para.length });
    }

    const outro = (body.para_whatsapp ?? "").replace(/\D/g, "");
    if (outro && !/^55\d{10,11}$/.test(outro)) return json({ error: "número inválido: use 55 + DDD + número" }, 400);
    if (!outro && !lead.whatsapp) return json({ error: "lead sem WhatsApp" }, 400);
    const phone = outro || String(lead.whatsapp).replace(/\D/g, "");
    const sdr = await upsertLeadByPhone(phone, `${phone}@s.whatsapp.net`);
    const baloes = baloesAvulso(texto);
    // Marca antes de enviar: o webhook reconhece o envio como disparo da prospecção e não pausa a IA
    await db().from("outreach_leads").update({ ultimo_toque_em: new Date().toISOString() }).eq("place_id", lead.place_id);
    for (let i = 0; i < baloes.length; i++) {
      // 504: o servidor do WhatsApp demorou, mas a mensagem sai mesmo assim; não reenviar
      const id = await sendText(phone, baloes[i]).catch((e: Error) => {
        if (/ 504/.test(e.message)) return null;
        throw e;
      });
      // Registrado como mensagem da Ana: o webhook reconhece e não pausa a IA como se fosse resposta manual
      // (se o registro falhar, a mensagem já saiu: segue para o próximo balão em vez de parar no meio)
      await addMessage({ lead_id: sdr.id, direction: "out", author: "ia", kind: "followup", content: baloes[i], evolution_message_id: id }).catch(() => null);
      if (i < baloes.length - 1) await sleep(2500 + Math.floor(Math.random() * 2500));
    }
    await log("whatsapp", "avulso", { to: phone, msg: `${lead.empresa}: mensagem avulsa (${baloes.length} balões)` });
    return json({ ok: true, enviados: baloes.length });
  } catch (e) {
    await log(body.canal ?? "?", "error", { avulso: true, msg: String((e as Error).message ?? e).slice(0, 300) });
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
}
