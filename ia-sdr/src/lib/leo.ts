/**
 * Léo (LDR) · completa a ficha de cada empresa da lista antes da abordagem (pedido do Kelvin, 08/11/2026):
 *  - site de verdade: não basta a ficha do Google. Confere o próprio site, o recado do WhatsApp e o link da bio
 *    do Instagram antes de dizer que a empresa "não tem site";
 *  - CNPJ (rodapé do site, bio, busca no Google) e, pela Receita (BrasilAPI, gratuita): razão social, sócios,
 *    quem é o dono, telefone e e-mail cadastrados;
 *  - o que for público do dono: LinkedIn e Instagram (marcados como "a confirmar").
 *
 * Roda no cron de 10 em 10 minutos, em etapas, sem travar o resto:
 *   inicio → (passos gratuitos: site, WhatsApp, Receita)
 *   busca  → Google pelo Apify: CNPJ e Instagram da empresa
 *   perfil → Apify: bio e link do Instagram da empresa
 *   dono   → Google pelo Apify: LinkedIn e Instagram do dono
 *   ok
 * Só uma coleta do Apify por vez; o resultado é lido na rodada seguinte. Respeita o teto do mês.
 *
 * WhatsApp é obrigatório (pedido do Kelvin, 10/11/2026): sem um número que existe no WhatsApp a empresa não entra
 * na lista. O Léo procura nesta ordem: telefone do Google, site (link do WhatsApp e telefones), Receita e Instagram
 * (telefone comercial, bio e link da bio). Cada número é conferido no WhatsApp sem mandar mensagem.
 * Quem já conversou com a gente (mesmo número) também não entra: vira follow-up, não primeiro contato.
 */
import { db } from "./db.ts";
import { env } from "./env.ts";
import { baixar } from "./enriquecer.ts";
import { semSiteProprio } from "./extras.ts";
import {
  acharCnpjs,
  donoDoQsa,
  escolherCnpj,
  instagramNaBusca,
  lerBrasilApi,
  linksDoTexto,
  normalizarTelefone,
  perfilDaPessoa,
  telefonesDoTexto,
  type DadosCnpj,
  type ResultadoBusca,
} from "./leo-pistas.ts";

const APIFY = "https://api.apify.com/v2";
const ATOR_BUSCA = "apify~google-search-scraper";
const ATOR_INSTAGRAM = "apify~instagram-profile-scraper";
const CUSTO_BUSCA = 0.005; // estimativa por pesquisa, só para checar o teto antes de rodar
const CUSTO_PERFIL = 0.003;
const POR_RODADA_GRATUITA = 6;
const POR_COLETA = 8;

export type EtapaLeo = "inicio" | "busca" | "perfil" | "dono" | "ok";

export interface EstadoLeo {
  etapa: EtapaLeo;
  fontes?: Record<string, string>; // de onde veio cada dado (site, whatsapp, instagram, google, receita)
  candidatos_cnpj?: string[];
  notas?: string[];
  /** WhatsApp: ok (achou e conferiu), buscando (ainda vai olhar o Instagram), conferir (o WhatsApp não respondeu), nao_achou */
  whats?: "ok" | "buscando" | "conferir" | "nao_achou";
}

interface LeadLeo {
  place_id: string;
  empresa: string;
  cidade: string | null;
  wa_status?: string | null;
  whatsapp: string | null;
  telefone?: string | null;
  cnpj_telefone?: string | null;
  site: string | null;
  instagram: string | null;
  email: string | null;
  linkedin_empresa: string | null;
  cnpj: string | null;
  socios: DadosCnpj["socios"] | null;
  decisor: string | null;
  enriquecimento: EstadoLeo | null;
}

interface ColetaLeo {
  id: string;
  tipo: "busca" | "perfil" | "dono";
  leads: string[];
  consultas: Record<string, string[]>; // place_id → consultas (ou @ do Instagram)
  iniciada_em: string;
}

const CAMPOS = "place_id,empresa,cidade,wa_status,whatsapp,telefone,cnpj_telefone,site,instagram,email,linkedin_empresa,cnpj,socios,decisor,enriquecimento";
const apifyToken = () => process.env.APIFY_TOKEN || "";

async function apify<T>(caminho: string, init?: RequestInit): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`${APIFY}${caminho}${sep}token=${apifyToken()}`, { ...init, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`Apify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

const log = (msg: string, extra: Record<string, unknown> = {}) => db().from("outreach_log").insert({ channel: "auto", event: "leo", detail: { msg, ...extra } });

async function salvar(placeId: string, patch: Record<string, unknown>) {
  await db().from("outreach_leads").update(patch).eq("place_id", placeId);
}

/** Ainda vai ser abordado (primeiro contato)? Só esses entram na lista do Léo. */
const paraAbordar = (l: Pick<LeadLeo, "wa_status">) => !l.wa_status || ["pendente", "sem_whatsapp"].includes(l.wa_status);
const fim8 = (n: string) => n.replace(/\D/g, "").slice(-8);

/** Já falamos com esse WhatsApp (conversa no SDR ou outra empresa da lista já abordada com o mesmo número)? */
async function jaFalamosCom(numero: string, placeId: string): Promise<boolean> {
  const f = fim8(numero);
  const [{ count: conversa }, { count: abordado }] = await Promise.all([
    db().from("sdr_leads").select("id", { count: "exact", head: true }).ilike("phone", `%${f}`),
    db().from("outreach_leads").select("place_id", { count: "exact", head: true }).ilike("whatsapp", `%${f}`).neq("place_id", placeId).not("wa_sent_at", "is", null),
  ]);
  return (conversa ?? 0) > 0 || (abordado ?? 0) > 0;
}

/**
 * Ficha completa. Só vai para a aprovação do Kelvin (lista do Léo) quem tem WhatsApp conferido e ainda não falou com a gente.
 * Sem WhatsApp: sai da lista (wa_status sem_whatsapp). Já conversou: sai da lista, porque é follow-up.
 */
async function fichaPronta(lead: LeadLeo, estado: EstadoLeo, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const agora = { enriquecido_em: new Date().toISOString() };
  if (!paraAbordar(lead)) return agora;
  const wa = (patch.whatsapp as string | undefined) ?? (estado.whats === "ok" ? lead.whatsapp : null);
  if (!wa) {
    estado.whats = "nao_achou";
    return { ...agora, leo_status: null, wa_status: "sem_whatsapp", whatsapp: null };
  }
  if (await jaFalamosCom(wa, lead.place_id)) {
    (estado.notas ??= []).push("Já falamos com esse WhatsApp antes: não entra como primeiro contato.");
    return { ...agora, leo_status: null, wa_status: "ignorado", retorno_nota: "Léo: já falamos com esse WhatsApp antes. Tratar como follow-up, não como primeiro contato." };
  }
  return { ...agora, leo_status: "pendente", wa_status: "pendente" };
}

type Numero = { num: string; fonte: string };

/**
 * Confere no WhatsApp (sem mandar mensagem) quais números existem e devolve o primeiro, na ordem de preferência.
 * erro = o WhatsApp não respondeu agora (tenta de novo na próxima rodada).
 */
export async function primeiroComWhatsApp(nums: Numero[]): Promise<{ achado: Numero | null; erro: boolean }> {
  const vistos = new Set<string>();
  const lista = nums
    .map((n) => ({ ...n, num: normalizarTelefone(n.num) ?? "" }))
    .filter((n) => n.num && !vistos.has(n.num) && vistos.add(n.num))
    .slice(0, 8);
  if (!lista.length) return { achado: null, erro: false };
  try {
    const r = await fetch(`${env.evolutionUrl}/user/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.evolutionInstanceToken },
      body: JSON.stringify({ number: lista.map((n) => n.num) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return { achado: null, erro: true };
    const j = (await r.json()) as { data?: { Users?: { Query?: string; IsInWhatsapp?: boolean; JID?: string }[] } };
    const users = j.data?.Users ?? [];
    for (const [i, n] of lista.entries()) {
      const u = users.find((x) => (x.Query ?? "").replace(/\D/g, "") === n.num) ?? (users.length === lista.length ? users[i] : undefined);
      if (u?.IsInWhatsapp) return { achado: { num: (u.JID ?? n.num).split("@")[0].split(":")[0].replace(/\D/g, "") || n.num, fonte: n.fonte }, erro: false };
    }
    return { achado: null, erro: false };
  } catch {
    return { achado: null, erro: true };
  }
}

/** Aplica o WhatsApp achado (ou não) no patch e no estado. */
async function acharWhatsApp(nums: Numero[], estado: EstadoLeo, patch: Record<string, unknown>): Promise<void> {
  if (estado.whats === "ok") return;
  const { achado, erro } = await primeiroComWhatsApp(nums);
  if (achado) {
    patch.whatsapp = achado.num;
    estado.whats = "ok";
    estado.fontes = { ...(estado.fontes ?? {}), whatsapp: achado.fonte };
  } else if (erro) estado.whats = "conferir";
  else if (estado.whats !== "conferir") estado.whats = "buscando";
}

/** Receita Federal pela BrasilAPI (gratuita). */
export async function consultarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(12_000) });
    if (!r.ok) return null;
    return lerBrasilApi(await r.json());
  } catch {
    return null;
  }
}

/** Recado (status) do WhatsApp da empresa: às vezes tem o site, o Instagram ou o e-mail. */
async function recadoDoWhatsApp(numero: string | null): Promise<string | null> {
  if (!numero) return null;
  try {
    const r = await fetch(`${env.evolutionUrl}/user/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.evolutionInstanceToken },
      body: JSON.stringify({ number: [numero.replace(/\D/g, "")] }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { Users?: Record<string, { Status?: string; VerifiedName?: { Details?: { verifiedName?: string } } | null }> } };
    const u = Object.values(j.data?.Users ?? {})[0];
    return u?.Status?.trim() || null;
  } catch {
    return null;
  }
}

/** Aplica os dados da Receita no lead (sócios, dono, contatos cadastrados). */
function patchDaReceita(d: DadosCnpj, lead: LeadLeo): Record<string, unknown> {
  const dono = donoDoQsa(d.socios);
  return {
    cnpj: d.cnpj,
    razao_social: d.razao_social,
    socios: d.socios,
    cnpj_email: d.email,
    cnpj_telefone: d.telefone,
    cnpj_situacao: d.situacao,
    cnae: d.cnae,
    porte: d.porte,
    ...(dono && !lead.decisor ? { decisor: dono.nome, cargo_decisor: dono.qualificacao ?? "Sócio" } : {}),
  };
}

/** Passos gratuitos: site, recado do WhatsApp e CNPJ do rodapé. Decide a próxima etapa. */
async function passosGratuitos(lead: LeadLeo): Promise<void> {
  const estado: EstadoLeo = { etapa: "inicio", fontes: {}, notas: [] };
  const patch: Record<string, unknown> = {};
  let candidatos: string[] = [];
  let site = semSiteProprio(lead.site) ? null : lead.site;
  if (site) estado.fontes!.site = "google";
  // WhatsApp: primeiro o que veio do Google (celular ou fixo com WhatsApp Business), depois o site, a Receita e o Instagram
  const numeros: Numero[] = [lead.whatsapp, lead.telefone].filter(Boolean).map((num) => ({ num: num!, fonte: "google" }));

  // 1) Site: CNPJ no rodapé, Instagram, LinkedIn da empresa e e-mail
  if (site) {
    const base = (/^https?:/i.test(site) ? site : `https://${site}`).replace(/\/+$/, "");
    let texto = "";
    for (const url of [base, `${base}/contato`, `${base}/sobre`, `${base}/politica-de-privacidade`]) {
      const html = await baixar(url);
      if (html) texto += `\n${html}`;
      if (acharCnpjs(texto).length) break;
    }
    const l = linksDoTexto(texto);
    numeros.push(...telefonesDoTexto(texto).map((num) => ({ num, fonte: "site" })));
    candidatos = acharCnpjs(texto);
    if (!lead.instagram && l.instagrams[0]) patch.instagram = `https://www.instagram.com/${l.instagrams[0]}/`;
    const lkEmpresa = l.linkedins.find((x) => /\/company\//.test(x));
    if (!lead.linkedin_empresa && lkEmpresa) patch.linkedin_empresa = lkEmpresa;
    if (!lead.email && l.emails[0]) patch.email = l.emails[0];
    if (candidatos.length) estado.fontes!.cnpj = "site";
  }

  // 2) Recado do WhatsApp: site, Instagram ou e-mail que não estavam no Google
  const recado = await recadoDoWhatsApp(lead.whatsapp);
  if (recado) {
    patch.wa_recado = recado;
    const l = linksDoTexto(recado);
    if (!site && l.sites[0] && !semSiteProprio(l.sites[0])) {
      site = l.sites[0];
      patch.site = site;
      estado.fontes!.site = "whatsapp";
    }
    if (!lead.instagram && !patch.instagram && l.instagrams[0]) patch.instagram = `https://www.instagram.com/${l.instagrams[0]}/`;
    if (!lead.email && !patch.email && l.emails[0]) patch.email = l.emails[0];
    if (!candidatos.length) candidatos = acharCnpjs(recado);
  }

  // 3) Receita: confere o CNPJ achado e traz os sócios
  let receita: DadosCnpj | null = null;
  if (lead.cnpj) candidatos = [lead.cnpj.replace(/\D/g, ""), ...candidatos];
  const dados = (await Promise.all([...new Set(candidatos)].slice(0, 3).map(consultarCnpj))).filter(Boolean) as DadosCnpj[];
  receita = escolherCnpj(dados, lead.empresa, lead.cidade);
  if (receita) Object.assign(patch, patchDaReceita(receita, lead));
  const telReceita = receita?.telefone ?? lead.cnpj_telefone;
  if (telReceita) numeros.push({ num: telReceita, fonte: "receita" });
  if (paraAbordar(lead)) await acharWhatsApp(numeros, estado, patch);

  const temInstagram = !!(lead.instagram || patch.instagram);
  const temSocios = !!receita?.socios.length || !!lead.socios?.length;
  const semWa = paraAbordar(lead) && estado.whats !== "ok";
  estado.etapa =
    !receita || (!site && !temInstagram) || (semWa && !temInstagram) ? "busca" : (!site || semWa) && temInstagram ? "perfil" : temSocios ? "dono" : "ok";
  // Pesquisa paga só para quem ainda vai ser abordado; quem já está em conversa fica com o que os passos gratuitos acharam
  if (!paraAbordar(lead)) estado.etapa = "ok";
  patch.site_fonte = estado.fontes!.site ?? null;
  if (estado.etapa === "ok") Object.assign(patch, await fichaPronta(lead, estado, patch));
  patch.enriquecimento = estado;
  await salvar(lead.place_id, patch);
}

/** Consultas de cada etapa que precisa do Google ou do Instagram. */
export function consultasPara(tipo: ColetaLeo["tipo"], lead: LeadLeo): string[] {
  const nome = lead.empresa.replace(/["|]/g, " ").trim();
  const cidade = lead.cidade ?? "";
  if (tipo === "busca") {
    const q: string[] = [];
    if (!lead.cnpj) q.push(`"${nome}" ${cidade} CNPJ`);
    // Instagram quando falta site ou WhatsApp (é onde costuma estar o WhatsApp de quem não tem site)
    if (!lead.instagram && (semSiteProprio(lead.site) || lead.enriquecimento?.whats !== "ok")) q.push(`${nome} ${cidade} instagram`);
    return q;
  }
  if (tipo === "perfil") {
    const h = (lead.instagram ?? "").match(/instagram\.com\/([A-Za-z0-9._]+)/i)?.[1];
    return h ? [h] : [];
  }
  const dono = donoDoQsa(lead.socios ?? []);
  if (!dono) return [];
  // Uma pesquisa só: os resultados trazem LinkedIn e Instagram juntos
  return [`"${dono.nome}" ${cidade} linkedin instagram`];
}

/** Gasto do mês no Apify: total (coleta + Léo) e só do Léo, com os dois tetos. */
async function custoDoMes(): Promise<{ gasto: number; teto: number; gastoLeo: number; tetoLeo: number }> {
  const inicio = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const [{ data }, { data: cfg }, { data: leo }] = await Promise.all([
    db().rpc("outreach_orcamento"),
    db().from("outreach_config").select("leo_teto_usd").eq("id", 1).single(),
    db().from("outreach_coletas").select("custo_usd").or("observacoes.like.Léo:%,observacoes.like.Rita:%").gte("executada_em", new Date(inicio.getTime() + 3 * 3600e3).toISOString()),
  ]);
  const o = (data ?? {}) as { gasto_usd?: number; teto_usd?: number };
  return {
    gasto: Number(o.gasto_usd ?? 0),
    teto: Number(o.teto_usd ?? 4),
    gastoLeo: ((leo ?? []) as { custo_usd: number }[]).reduce((a, x) => a + Number(x.custo_usd ?? 0), 0),
    tetoLeo: Number((cfg as { leo_teto_usd?: number } | null)?.leo_teto_usd ?? 1.5),
  };
}

/** Começa a próxima coleta do Apify (uma por vez). */
async function iniciarColeta(): Promise<string | null> {
  if (!apifyToken()) return null;
  for (const tipo of ["busca", "perfil", "dono"] as const) {
    const { data } = await db()
      .from("outreach_leads")
      .select(CAMPOS)
      .eq("enriquecimento->>etapa", tipo)
      .in("wa_status", ["pendente", "sem_whatsapp"]) // pesquisa paga só para quem ainda vai ser abordado
      .order("created_at", { ascending: false })
      .limit(POR_COLETA);
    const leads = (data ?? []) as LeadLeo[];
    const consultas: Record<string, string[]> = {};
    for (const l of leads) {
      const q = consultasPara(tipo, l);
      if (q.length) consultas[l.place_id] = q;
      else await avancar(l, tipo, {}); // nada para buscar: segue
    }
    const total = Object.values(consultas).flat();
    if (!total.length) continue;

    const { gasto, teto, gastoLeo, tetoLeo } = await custoDoMes();
    const estimativa = total.length * (tipo === "perfil" ? CUSTO_PERFIL : CUSTO_BUSCA);
    if (gasto + estimativa > teto || gastoLeo + estimativa > tetoLeo) {
      await log(`Léo pausou as pesquisas pagas: teto do mês (Léo US$ ${gastoLeo.toFixed(2)} de ${tetoLeo}; Apify US$ ${gasto.toFixed(2)} de ${teto}). Os passos gratuitos continuam.`);
      // sem pesquisa paga: segue com o que tem, para a lista não travar
      for (const l of leads.filter((x) => consultas[x.place_id])) await avancar(l, tipo, {});
      return null;
    }
    const input =
      tipo === "perfil"
        ? { usernames: [...new Set(total)] }
        : { queries: [...new Set(total)].join("\n"), resultsPerPage: 10, maxPagesPerQuery: 1, countryCode: "br", languageCode: "pt-BR" };
    const run = await apify<{ data: { id: string } }>(`/acts/${tipo === "perfil" ? ATOR_INSTAGRAM : ATOR_BUSCA}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const coleta: ColetaLeo = { id: run.data.id, tipo, leads: Object.keys(consultas), consultas, iniciada_em: new Date().toISOString() };
    await db().from("outreach_config").update({ leo_coleta: coleta }).eq("id", 1);
    await log(`Léo pesquisando (${tipo}): ${coleta.leads.length} empresas, ${total.length} consultas`);
    return tipo;
  }
  return null;
}

/** Passa o lead para a próxima etapa com o que achou. */
async function avancar(lead: LeadLeo, de: ColetaLeo["tipo"], patch: Record<string, unknown>) {
  const atual = { ...(lead.enriquecimento ?? { etapa: de }), fontes: { ...(lead.enriquecimento?.fontes ?? {}) } };
  const site = (patch.site as string | undefined) ?? (semSiteProprio(lead.site) ? null : lead.site);
  const instagram = (patch.instagram as string | undefined) ?? lead.instagram;
  const socios = (patch.socios as DadosCnpj["socios"] | undefined) ?? lead.socios ?? [];
  const semWa = paraAbordar(lead) && atual.whats !== "ok";
  let proxima: EtapaLeo = "ok";
  if (de === "busca") proxima = (!site || semWa) && instagram ? "perfil" : socios.length ? "dono" : "ok";
  else if (de === "perfil") proxima = socios.length ? "dono" : "ok";
  atual.etapa = proxima;
  const fim = proxima === "ok" ? await fichaPronta(lead, atual, patch) : {};
  await salvar(lead.place_id, { ...patch, ...fim, enriquecimento: atual });
}

/** Lê a coleta que terminou e aplica nos leads. */
async function lerColeta(c: ColetaLeo): Promise<string> {
  const run = await apify<{ data: { status: string; defaultDatasetId: string; usageTotalUsd?: number } }>(`/actor-runs/${c.id}`);
  const st = run.data.status;
  const minutos = (Date.now() - new Date(c.iniciada_em).getTime()) / 60_000;
  if (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(st)) {
    if (minutos < 30) return `coleta ${c.tipo} em andamento`;
    await apify(`/actor-runs/${c.id}/abort`, { method: "POST" }).catch(() => null);
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const itens = st === "SUCCEEDED" ? await apify<any[]>(`/datasets/${run.data.defaultDatasetId}/items?clean=true&format=json`) : [];
  const custo = Number(run.data.usageTotalUsd ?? 0);
  if (custo > 0) await db().from("outreach_coletas").insert({ custo_usd: custo, lugares_coletados: 0, novos_adicionados: 0, observacoes: `Léo: ${c.tipo} (${c.leads.length} empresas)` });

  const { data } = await db().from("outreach_leads").select(CAMPOS).in("place_id", c.leads);
  const leads = (data ?? []) as LeadLeo[];
  let achados = 0;
  for (const lead of leads) {
    const patch: Record<string, unknown> = {};
    const fontes = { ...(lead.enriquecimento?.fontes ?? {}) };
    if (c.tipo === "perfil") {
      const h = (c.consultas[lead.place_id] ?? [])[0]?.toLowerCase();
      const p = itens.find((x) => String(x.username ?? "").toLowerCase() === h);
      if (p) {
        const links = [p.externalUrl, ...(Array.isArray(p.externalUrls) ? p.externalUrls.map((u: any) => u?.url) : [])].filter(Boolean) as string[];
        const bio = `${p.biography ?? ""} ${links.join(" ")}`;
        const l = linksDoTexto(bio);
        const siteBio = [...links, ...l.sites].find((u) => !semSiteProprio(u));
        if (siteBio && semSiteProprio(lead.site)) {
          patch.site = siteBio;
          patch.site_fonte = "instagram";
          fontes.site = "instagram";
          achados++;
        }
        const email = p.businessEmail || p.publicEmail || l.emails[0];
        if (email && !lead.email) patch.email = String(email).toLowerCase();
        // WhatsApp no Instagram: telefone comercial, bio e a página do link da bio (linktree, site)
        if (paraAbordar(lead) && lead.enriquecimento?.whats !== "ok") {
          const est: EstadoLeo = { ...(lead.enriquecimento ?? { etapa: "perfil" }) };
          const nums: Numero[] = [p.businessPhoneNumber, p.publicPhoneNumber, p.contactPhoneNumber]
            .filter(Boolean)
            .map((num: string) => ({ num: String(num), fonte: "instagram" }));
          nums.push(...telefonesDoTexto(bio).map((num) => ({ num, fonte: "instagram" })));
          if (!nums.length) for (const u of links.slice(0, 2)) nums.push(...telefonesDoTexto(await baixar(/^https?:/i.test(u) ? u : `https://${u}`)).map((num) => ({ num, fonte: "instagram" })));
          await acharWhatsApp(nums, est, patch);
          lead.enriquecimento = est;
          if (est.whats === "ok") achados++;
        }
        if (!lead.cnpj) {
          const d = (await Promise.all(acharCnpjs(bio).slice(0, 2).map(consultarCnpj))).filter(Boolean) as DadosCnpj[];
          const r = escolherCnpj(d, lead.empresa, lead.cidade);
          if (r) {
            Object.assign(patch, patchDaReceita(r, lead));
            fontes.cnpj = "instagram";
          }
        }
      }
    } else {
      const res: ResultadoBusca[] = itens
        .filter((x) => (c.consultas[lead.place_id] ?? []).includes(String(x.searchQuery?.term ?? "")))
        .flatMap((x) => (Array.isArray(x.organicResults) ? x.organicResults : []));
      if (c.tipo === "busca") {
        if (!lead.cnpj) {
          const cands = acharCnpjs(res.map((r) => `${r.title ?? ""} ${r.description ?? ""} ${r.url ?? ""}`).join("\n")).slice(0, 4);
          const d = (await Promise.all(cands.map(consultarCnpj))).filter(Boolean) as DadosCnpj[];
          const r = escolherCnpj(d, lead.empresa, lead.cidade);
          if (r) {
            Object.assign(patch, patchDaReceita(r, lead));
            fontes.cnpj = "google";
            achados++;
          }
        }
        if (!lead.instagram) {
          const ig = instagramNaBusca(res, lead.empresa);
          if (ig) {
            patch.instagram = ig;
            fontes.instagram = "google";
          }
        }
      } else {
        const dono = donoDoQsa(lead.socios ?? []);
        if (dono) {
          const lk = perfilDaPessoa(res, dono.nome, "linkedin");
          const ig = perfilDaPessoa(res, dono.nome, "instagram");
          if (lk) patch.linkedin_decisor = lk;
          if (ig) patch.dono_instagram = ig;
          if (lk || ig) achados++;
        }
      }
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    await avancar({ ...lead, enriquecimento: { ...(lead.enriquecimento ?? { etapa: c.tipo }), fontes: { ...(lead.enriquecimento?.fontes ?? {}), ...fontes } } }, c.tipo, patch);
  }
  await db().from("outreach_config").update({ leo_coleta: null }).eq("id", 1);
  await log(`Léo terminou (${c.tipo}): ${leads.length} empresas, ${achados} com dado novo${custo ? `, US$ ${custo.toFixed(3)}` : ""}`);
  return `coleta ${c.tipo} lida: ${achados} achados`;
}

/** Uma rodada do Léo (chamada pelo cron a cada 10 minutos). */
export async function runLeo(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const { data: cfg } = await db().from("outreach_config").select("leo_coleta").eq("id", 1).single();
  const coleta = (cfg as { leo_coleta: ColetaLeo | null } | null)?.leo_coleta ?? null;

  // 1) Coleta do Apify em andamento: lê se terminou
  if (coleta) out.coleta = await lerColeta(coleta).catch((e) => `erro ao ler coleta: ${String(e).slice(0, 160)}`);

  // 2) Sem coleta rodando: começa a próxima (ou, no teto do mês, segue sem pesquisa paga).
  // Vem antes dos passos gratuitos para nunca deixar de rodar quando o relógio aperta.
  const { data: cfg2 } = await db().from("outreach_config").select("leo_coleta").eq("id", 1).single();
  if (!(cfg2 as { leo_coleta: ColetaLeo | null } | null)?.leo_coleta) out.iniciada = await iniciarColeta().catch((e) => `erro: ${String(e).slice(0, 160)}`);

  // 3) Passos gratuitos para quem ainda não passou pelo Léo (quem vai ser abordado primeiro), com limite de tempo
  const inicio = Date.now();
  const { data } = await db()
    .from("outreach_leads")
    .select(CAMPOS)
    .or("enriquecimento.is.null,enriquecimento->>whats.eq.conferir")
    .in("wa_status", ["pendente", "sem_whatsapp", "enviado", "respondeu"])
    .order("created_at", { ascending: false })
    .limit(POR_RODADA_GRATUITA);
  let feitos = 0;
  for (const l of (data ?? []) as LeadLeo[]) {
    if (Date.now() - inicio > 120_000) break; // o resto fica para o próximo relógio
    await Promise.race([passosGratuitos(l), new Promise((_, nao) => setTimeout(() => nao(new Error("demorou mais de 45 s")), 45_000))]).catch((e) =>
      console.error("Léo: passos gratuitos falharam", l.place_id, e),
    );
    feitos++;
  }
  out.gratuitos = feitos;
  return out;
}
