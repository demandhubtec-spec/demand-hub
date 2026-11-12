/**
 * Prospecção ativa · mensagem avulsa para um lead, enviada pelo portal depois que o Kelvin revisou o texto
 * (só perfil "dono"). Serve para o follow-up feito à mão e para mandar a análise ao e-mail que a recepção passou.
 *
 *   POST { place_id, canal: "email", para: ["a@x.com"], assunto, texto }  → e-mail do Gmail da Ana, com assinatura
 *   POST { place_id, canal: "whatsapp", texto, para_whatsapp?, documento? } → WhatsApp da Ana, balão por balão
 *        ("[PDF]" sozinho num balão: manda ali o relatório em PDF do lead)
 *        (documento: { url, nome } de um PDF no bucket "materiais"; vai logo depois do 1º balão)
 *        (para_whatsapp: outro número da mesma empresa, ex.: o administrativo que a recepção indicou)
 *   → { ok, enviados }
 */
import { db, addMessage, upsertLeadByPhone } from "@/src/lib/db.ts";
import { sendDocument, sendText } from "@/src/lib/evolution.ts";
import { env } from "@/src/lib/env.ts";
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

/** Separa os balões do WhatsApp (linha em branco), no máximo 4 (o "[PDF]" não conta). */
function baloesAvulso(texto: string): string[] {
  const b = texto.replace(/\[PDF\]/g, "\n\n[PDF]\n\n").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const out: string[] = [];
  let texto4 = 0;
  for (const x of b) {
    if (x === "[PDF]") {
      if (!out.includes("[PDF]")) out.push(x);
    } else if (texto4 < 4) {
      out.push(x);
      texto4++;
    }
  }
  return out;
}

export async function POST(req: Request) {
  const h = cors(req);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db().auth.getUser(token);
  if (!u?.user) return json({ error: "unauthorized" }, 401);
  const { data: perfil } = await db().from("perfis").select("papel").eq("id", u.user.id).maybeSingle();
  if (perfil?.papel !== "dono") return json({ error: "forbidden" }, 403);

  const body = (await req.json().catch(() => ({}))) as { place_id?: string; canal?: string; para?: string[]; assunto?: string; texto?: string; para_whatsapp?: string; documento?: { url?: string; nome?: string } };
  const texto = (body.texto ?? "").trim();
  if (!body.place_id || !texto || !["email", "whatsapp"].includes(body.canal ?? "")) return json({ error: "informe place_id, canal e texto" }, 400);
  if (/[—–]/.test(texto)) return json({ error: "o texto tem travessão; troque por vírgula ou ponto" }, 400);

  const { data: lead } = await db().from("outreach_leads").select("place_id,empresa,whatsapp,email,marca").eq("place_id", body.place_id).maybeSingle();
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
    // "[PDF]" sozinho num balão: no lugar dele vai o relatório em PDF do lead (gerado pelo robô no GitHub)
    const pdfDoLead = (lead as { marca?: { pdf?: string | null } | null }).marca?.pdf ?? null;
    if (baloes.includes("[PDF]") && !pdfDoLead) return json({ error: "o PDF do relatório ainda não foi gerado; tire o [PDF] ou espere uns minutos" }, 400);
    const nomePdf = `Diagnostico ${String(lead.empresa).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, " ").trim().slice(0, 50)}.pdf`;
    // PDF anexo: só aceita arquivo do nosso bucket público "materiais"
    const doc = body.documento?.url ? { url: String(body.documento.url), nome: String(body.documento.nome || "analise.pdf") } : null;
    if (doc && !doc.url.startsWith(`${env.supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/materiais/`)) return json({ error: "o PDF precisa estar no bucket materiais" }, 400);
    if (doc && !/\.pdf$/i.test(doc.nome)) doc.nome = `${doc.nome}.pdf`;
    // Marca antes de enviar: o webhook reconhece o envio como disparo da prospecção e não pausa a IA
    await db().from("outreach_leads").update({ ultimo_toque_em: new Date().toISOString() }).eq("place_id", lead.place_id);
    for (let i = 0; i < baloes.length; i++) {
      // 504: o servidor do WhatsApp demorou, mas a mensagem sai mesmo assim; não reenviar
      // sendText já tenta de novo quando o servidor demora; se ainda falhar, o erro volta para a tela
      if (baloes[i] === "[PDF]") {
        const idPdf = await sendDocument(phone, pdfDoLead!, nomePdf);
        await addMessage({ lead_id: sdr.id, direction: "out", author: "ia", kind: "followup", content: `[PDF] ${nomePdf} ${pdfDoLead}`, evolution_message_id: idPdf }).catch(() => null);
        if (i < baloes.length - 1) await sleep(2500 + Math.floor(Math.random() * 2500));
        continue;
      }
      const id = await sendText(phone, baloes[i]);
      // Registrado como mensagem da Ana: o webhook reconhece e não pausa a IA como se fosse resposta manual
      // (se o registro falhar, a mensagem já saiu: segue para o próximo balão em vez de parar no meio)
      await addMessage({ lead_id: sdr.id, direction: "out", author: "ia", kind: "followup", content: baloes[i], evolution_message_id: id }).catch(() => null);
      // O PDF vai logo depois do 1º balão (o que diz "segue em anexo"); a pergunta fica por último
      if (i === 0 && doc) {
        await sleep(1500);
        const idDoc = await sendDocument(phone, doc.url, doc.nome);
        await addMessage({ lead_id: sdr.id, direction: "out", author: "ia", kind: "followup", content: `[PDF] ${doc.nome} ${doc.url}`, evolution_message_id: idDoc }).catch(() => null);
      }
      if (i < baloes.length - 1) await sleep(2500 + Math.floor(Math.random() * 2500));
    }
    await log("whatsapp", "avulso", { to: phone, msg: `${lead.empresa}: mensagem avulsa (${baloes.length} balões${doc ? " + PDF" : ""})`, ...(doc ? { pdf: doc.url } : {}) });
    return json({ ok: true, enviados: baloes.length });
  } catch (e) {
    await log(body.canal ?? "?", "error", { avulso: true, msg: String((e as Error).message ?? e).slice(0, 300) });
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
}
