/**
 * 25/11 (Kelvin): na ligação, quando a recepção ou o dono pede "manda por WhatsApp / por e-mail", a Gabi aceita.
 * Depois da ligação, o material sai sozinho pela fila (envios_agendados), em horário comercial:
 *  - WhatsApp: texto da Gabi com o portfólio do segmento (página da Demand) e, se já existir, o link do
 *    diagnóstico da empresa; pede o melhor dia e horário para o especialista mostrar ao dono.
 *  - E-mail: o mesmo conteúdo, do Gmail da Demand.
 * Não manda para quem recusou, pediu para não ligar ou já recebeu material nos últimos 3 dias.
 */
import { db, logEvent, updateLead, upsertLeadByPhone } from "./db.ts";
import { ehCelular, nomeCurto, telefoneComDdi } from "./recado-ligacao.ts";
import { linkRelatorio } from "./rita.ts";

const SITE = "https://demandhub.com.br";

/** Página de portfólio da Demand para o segmento (existe uma por segmento; "servicos" é a geral). */
export function portfolioDoSegmento(nicho: string | null | undefined, empresa?: string | null): string {
  const t = `${nicho ?? ""} ${empresa ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const seg =
    /odonto|dent|clinic|medic|saude|fisio|psico|nutri|endocrin|oftalm|derma|estetic|laborat|consultorio|dra?\b|dr\./.test(t) ? "clinicas"
    : /pizz|restaur|lanch|burger|hamburg|rotisser|confeit|padar|doce|bar\b|bistr|cafe|aliment|marmit|delivery/.test(t) ? "restaurante"
    : /pet|veterin|agro|racao/.test(t) ? "petshop"
    : /advoga|advocacia|juridic|direito/.test(t) ? "advocacia"
    : /imobili|imove|corretor/.test(t) ? "imobiliaria"
    : /buffet|evento|festa|foto|decora|cerimon/.test(t) ? "eventos"
    : /barbear|salao|cabel|beleza/.test(t) ? "barbearia"
    : "servicos";
  return `${SITE}/portfolio${seg}`;
}

export interface PedidoMaterial {
  canal: "whatsapp" | "email";
  fone: string; // número que a Gabi ligou (só dígitos)
  whatsapp: string | null; // outro número que a pessoa passou
  email: string | null;
  nome: string | null; // dono/responsável
  empresa: string | null;
  placeId: string | null;
}

export function textoDoMaterial(nome: string | null, empresa: string | null, portfolio: string, relatorio: string | null): string {
  const oi = nome ? `Oi, ${nome.split(" ")[0]}!` : "Oi!";
  const emp = empresa ? nomeCurto(empresa) : "vocês";
  return [
    `${oi} Aqui é a Gabi, da Demand 😊 Como combinamos na ligação, segue o material pra ${emp}.`,
    `Aqui dá pra ver como a gente ajuda em marketing, vendas e tecnologia: ${portfolio}`,
    relatorio ? `E aqui o diagnóstico que nosso especialista preparou pra ${emp}: ${relatorio}` : null,
    `Nosso especialista mostra tudo isso ao vivo numa conversa rápida de 20 minutinhos, sem custo. Qual o melhor dia e horário pra ${nome ? "você" : "conversar com o responsável"}?`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Põe o material na fila. Devolve o que fez (vai para a nota do card). */
export async function agendarMaterial(p: PedidoMaterial, agora = new Date()): Promise<string> {
  let nicho: string | null = null;
  let relatorio: string | null = null;
  let empresa = p.empresa;
  if (p.placeId) {
    const { data: o } = await db().from("outreach_leads").select("empresa,nicho,wa_status,status_comercial,relatorio_token,diagnosticos").eq("place_id", p.placeId).maybeSingle();
    const ol = o as { empresa?: string | null; nicho?: string | null; wa_status?: string | null; status_comercial?: string | null; relatorio_token?: string | null; diagnosticos?: unknown } | null;
    if (ol?.wa_status === "optout") return "Material não enviado: a empresa pediu para não ser chamada.";
    nicho = ol?.nicho ?? null;
    empresa = empresa ?? ol?.empresa ?? null;
    if (ol?.relatorio_token && ol.diagnosticos) relatorio = linkRelatorio(ol.relatorio_token);
  }
  const portfolio = portfolioDoSegmento(nicho, empresa);
  const texto = textoDoMaterial(p.nome, empresa, portfolio, relatorio);
  const em = new Date(agora.getTime() + 3 * 60e3).toISOString();

  // WhatsApp: o número que a pessoa passou, ou o que a Gabi ligou se for celular
  const alvo = p.whatsapp ?? (ehCelular(p.fone) ? p.fone : null);
  if (p.canal === "whatsapp" && alvo) {
    const phone = telefoneComDdi(alvo);
    const lead = await upsertLeadByPhone(phone, `${phone}@s.whatsapp.net`, p.nome ?? undefined, "gabi");
    if (["opt_out"].includes(String(lead.status))) return "Material não enviado: o contato pediu para não ser chamado.";
    const tres = new Date(agora.getTime() - 3 * 864e5).toISOString();
    const { data: ja } = await db().from("sdr_events").select("id").eq("lead_id", lead.id).eq("type", "material_ligacao").gte("created_at", tres).limit(1);
    if (ja?.length) return "Material já tinha sido enviado nos últimos 3 dias.";
    if (!lead.empresa && empresa) await updateLead(lead.id, { empresa });
    if (p.nome && !lead.nome) await updateLead(lead.id, { nome: p.nome });
    await db().from("envios_agendados").insert({ lead_id: lead.id, place_id: p.placeId, canal: "whatsapp", texto, com_pdf: false, enviar_em: em });
    await logEvent(lead.id, "material_ligacao", { canal: "whatsapp", portfolio, relatorio: !!relatorio });
    return `Material (portfólio${relatorio ? " + diagnóstico" : ""}) na fila do WhatsApp para ${phone}.`;
  }
  // E-mail: quando pediu por e-mail, ou quando não há WhatsApp
  if (p.email) {
    const assunto = `Demand | material${empresa ? ` para a ${nomeCurto(empresa)}` : ""}`;
    await db().from("envios_agendados").insert({ lead_id: null, place_id: p.placeId, canal: "email", para: p.email, assunto, texto: texto.replace(/\s*😊/g, "."), com_pdf: false, enviar_em: em });
    await logEvent(null, "material_ligacao", { canal: "email", para: p.email, portfolio, relatorio: !!relatorio });
    return `Material (portfólio${relatorio ? " + diagnóstico" : ""}) na fila do e-mail para ${p.email}.`;
  }
  return "Pediu material, mas não ficou um WhatsApp (celular) nem e-mail para mandar: conferir a ligação.";
}
