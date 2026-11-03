// Robô do Instagram DemandIA (ig-bot). Publicado no Supabase como a função "bright-respondig-boter".
// Gatilhos (03/11/2026): cada gatilho liga palavra-chave + post a uma resposta no comentário e a uma
// mensagem no Direct com botão. Os gatilhos ficam na tabela ig_gatilhos e são montados no portal
// (Marketing > Instagram Direct > Gatilhos). Sem a tabela, o robô volta ao comportamento antigo (DIAGNÓSTICO).
import { createClient } from "jsr:@supabase/supabase-js@2";
// ===== fluxo.ts =====
export const UTM = {
  utm_source: "instagram",
  utm_campaign: "03-[ENGAJAMENTO]-[PERFIL-IG]-[DIAGNOSTICO]",
  utm_term: "01-ADVANTAGE-ABERTO",
  utm_content: "01-CARROSSEL-DOR-DOMINGO"
};
export const LINK_SITE = "https://demandhub.com.br/diagnostico?utm_source=instagram&utm_medium=pago&utm_campaign=03-ENGAJAMENTO-PERFIL-IG-DIAGNOSTICO&utm_term=01-ADVANTAGE-ABERTO&utm_content=01-CARROSSEL-DOR-DOMINGO";
export const FAIXA_FORA_DO_PERFIL = "ate_30k"; // "Até R$ 30 mil"
export const TEXTOS = {
  respostasPublicas: [
    "Te mandei no direct 📩",
    "Acabei de te chamar no direct!",
    "Olha seu direct 👀"
  ],
  abertura: (nome)=>`Oi${nome ? `, ${nome}` : ""}! Aqui é da DemandIA 👋 Bora montar seu diagnóstico gratuito? É rapidinho. ` + "Pra começar: qual é o seu nome?",
  aberturaLink: (nome)=>`Oi${nome ? `, ${nome}` : ""}! Aqui é da DemandIA 👋 Seu diagnóstico gratuito começa por aqui. ` + "Leva uns 3 minutos e o resultado chega no seu WhatsApp em até 24h úteis.",
  botaoLink: "Fazer diagnóstico",
  retomada: (nome)=>`Oi${nome ? `, ${nome}` : ""}! Aqui é da DemandIA 👋 Bora terminar seu diagnóstico? `,
  aberturaSemBotoes: "\n\n(Pode responder digitando a opção.)",
  site: `Perfeito! É só preencher por aqui 👇\n${LINK_SITE}`,
  lembreteConvite: "Ainda quer o seu diagnóstico? É só tocar em Bora 👇",
  lembretePergunta: "Ficou faltando pouco para o seu diagnóstico 🙂 Vamos continuar?",
  escolhaUmaOpcao: "Toque numa das opções abaixo, por favor 👇",
  lgpd: "Seus dados são usados só para preparar e enviar o seu diagnóstico, e você pode pedir para removê-los quando quiser.",
  whatsappInvalido: "Hmm, esse número não parece certo. Manda com DDD, por favor (ex.: 19 98825-9883)",
  emailInvalido: "Esse e-mail parece ter algum erro. Pode mandar de novo?",
  desistirValidacao: `Não consegui validar por aqui. Termina rapidinho pelo site? 👇\n${LINK_SITE}`,
  encerramento: (nome, whatsapp, email)=>`Pronto, ${nome}! ✅ Seu diagnóstico chega em até 24h úteis no WhatsApp (${whatsapp}) e no e-mail (${email}). ` + "A Ana, do nosso time, vai te chamar no WhatsApp.",
  jaConcluiu: (nome)=>`Oi${nome ? `, ${nome}` : ""}! Seu pedido de diagnóstico já está com a gente ✅ A Ana vai te chamar no WhatsApp.`,
  parou: "Tudo bem, parei por aqui. Se quiser retomar, é só comentar DIAGNÓSTICO no post 🙂"
};
export const BOTAO_BORA = {
  titulo: "Bora!",
  payload: "BORA"
};
export const BOTAO_SITE = {
  titulo: "Prefiro pelo site",
  payload: "SITE"
};
export const BOTAO_LGPD = {
  titulo: "Ok, pode seguir",
  payload: "LGPD_OK"
};
export const BOTAO_CONTINUAR = {
  titulo: "Continuar",
  payload: "CONTINUAR"
};
const mesmo = (...vs)=>vs.map((v)=>({
      t: v,
      v
    }));
export const PERGUNTAS = [
  {
    estado: "p_nome",
    campo: "nome",
    etapaNum: 2,
    texto: "Qual é o seu nome?"
  },
  {
    estado: "p_whatsapp",
    campo: "whatsapp",
    etapaNum: 3,
    texto: (nome)=>`Prazer${nome ? `, ${nome}` : ""}! Qual é o seu WhatsApp com DDD? É por lá que o diagnóstico chega. ` + "(Seus dados são usados só para o diagnóstico, e você pode pedir para removê-los quando quiser.)"
  },
  {
    estado: "p_email",
    campo: "email",
    etapaNum: 4,
    texto: "E o seu melhor e-mail?"
  },
  {
    estado: "p_empresa",
    campo: "empresa",
    etapaNum: 5,
    texto: "Show! Agora o diagnóstico, é rapidinho 👇 Qual é o nome da empresa?"
  },
  {
    estado: "p_segmento",
    campo: "segmento",
    etapaNum: 6,
    texto: "Qual é o segmento da empresa?",
    opcoes: [
      {
        t: "Saúde/estética",
        v: "Clínica / saúde / estética"
      },
      {
        t: "Imobiliária/constr.",
        v: "Imobiliária / construção"
      },
      {
        t: "Alimentação",
        v: "Restaurante / alimentação"
      },
      {
        t: "Varejo/e-commerce",
        v: "Loja / varejo / e-commerce"
      },
      {
        t: "Serviços",
        v: "Prestação de serviços"
      },
      {
        t: "Educação/cursos",
        v: "Educação / cursos"
      },
      {
        t: "Indústria/distrib.",
        v: "Indústria / distribuição"
      },
      {
        t: "Tecnologia/SaaS",
        v: "Tecnologia / SaaS"
      },
      {
        t: "Agência/consultoria",
        v: "Agência / consultoria"
      },
      {
        t: "Outro",
        v: "Outro"
      }
    ]
  },
  {
    estado: "p_cargo",
    campo: "cargo",
    etapaNum: 7,
    texto: "Qual é o seu cargo?",
    opcoes: [
      {
        t: "Dono(a)/sócio(a)",
        v: "dono"
      },
      {
        t: "Diretor(a)/gestor(a)",
        v: "diretor"
      },
      {
        t: "Colaborador(a)",
        v: "colaborador"
      }
    ]
  },
  {
    estado: "p_faturamento",
    campo: "faturamento",
    etapaNum: 8,
    texto: "1/8 · Qual o faturamento mensal médio?",
    opcoes: [
      {
        t: "Até R$ 30 mil",
        v: "ate_30k"
      },
      {
        t: "R$ 30 a 50 mil",
        v: "30k_50k"
      },
      {
        t: "R$ 50 a 100 mil",
        v: "50k_100k"
      },
      {
        t: "R$ 100 a 300 mil",
        v: "100k_300k"
      },
      {
        t: "R$ 300 mil a 1 mi",
        v: "300k_1mi"
      },
      {
        t: "Acima de R$ 1 milhão",
        v: "1mi_mais"
      }
    ]
  },
  {
    estado: "p_equipe",
    campo: "equipe",
    etapaNum: 9,
    texto: "2/8 · Quantas pessoas trabalham na empresa?",
    opcoes: [
      {
        t: "1 a 5",
        v: "1-5"
      },
      {
        t: "6 a 15",
        v: "6-15"
      },
      {
        t: "16 a 50",
        v: "16-50"
      },
      {
        t: "Mais de 50",
        v: "50+"
      }
    ]
  },
  {
    estado: "p_canais",
    campo: "canais",
    etapaNum: 10,
    texto: "3/8 · De onde vem a maioria dos seus clientes? (escolha o principal)",
    opcoes: [
      ...mesmo("Indicação", "Instagram orgânico", "Anúncios pagos", "Google"),
      {
        t: "WhatsApp/lista",
        v: "WhatsApp / lista de contatos"
      },
      {
        t: "Vendedores/prospec.",
        v: "Vendedores / prospecção"
      },
      {
        t: "Loja física/ponto",
        v: "Loja física / ponto"
      },
      ...mesmo("Marketplace")
    ]
  },
  {
    estado: "p_invest",
    campo: "invest_marketing",
    etapaNum: 11,
    texto: "4/8 · Quanto investe em marketing por mês?",
    opcoes: mesmo("Não invisto hoje", "Até R$ 2 mil", "R$ 2 a 5 mil", "R$ 5 a 15 mil", "Acima de R$ 15 mil")
  },
  {
    estado: "p_tempo",
    campo: "tempo_resposta",
    etapaNum: 12,
    texto: "5/8 · Quanto tempo leva para responder um novo contato?",
    opcoes: mesmo("Na hora", "Em até 1 hora", "No mesmo dia", "Mais de 1 dia", "Não sei dizer")
  },
  {
    estado: "p_dores",
    campo: "dores",
    etapaNum: 13,
    texto: "6/8 · Qual é o maior gargalo hoje? (escolha o principal)",
    opcoes: [
      {
        t: "Poucos clientes",
        v: "Poucos clientes chegando"
      },
      {
        t: "Contatos não fecham",
        v: "Contatos que não viram venda"
      },
      {
        t: "Demora p/ responder",
        v: "Demora para responder os contatos"
      },
      {
        t: "Trabalho manual",
        v: "Muito trabalho manual e repetitivo"
      },
      {
        t: "Equipe cara/lotada",
        v: "Equipe cara ou sobrecarregada"
      },
      {
        t: "Sem controle vendas",
        v: "Falta de controle de clientes e vendas"
      },
      {
        t: "Margem baixa",
        v: "Margem baixa"
      },
      {
        t: "Presença digital",
        v: "Site ou presença digital fraca"
      }
    ]
  },
  {
    estado: "p_prazo",
    campo: "prazo",
    etapaNum: 14,
    texto: "7/8 · Quando quer resolver isso?",
    opcoes: [
      {
        t: "Agora, é prioridade",
        v: "imediato"
      },
      {
        t: "Próximos 3 meses",
        v: "ate_3_meses"
      },
      {
        t: "Em 3 a 6 meses",
        v: "3_a_6_meses"
      },
      {
        t: "Só pesquisando",
        v: "sem_previsao"
      }
    ]
  },
  {
    estado: "p_desafio",
    campo: "desafio",
    etapaNum: 15,
    pular: true,
    texto: "8/8 · Se pudesse resolver uma coisa na empresa amanhã, qual seria? Conte em poucas palavras (ou toque em Pular)."
  }
];
export const ETAPA_CONCLUIU = 16;
export const BOTAO_PULAR = {
  titulo: "Pular",
  payload: "PULAR"
};
export const ESTADOS_ATIVOS = new Set([
  "convidado",
  ...PERGUNTAS.map((p)=>p.estado)
]);
export const MAX_TENTATIVAS = 3;
export function semAcento(s) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
export function pedeDiagnostico(texto) {
  if (typeof texto !== "string") return false;
  return semAcento(texto).includes("diagnostico");
}
// ===== gatilhos =====
export const WHATSAPP_ANA = "5519988259883";
export const PAGINA_DIAGNOSTICO = "https://demandhub.com.br/diagnostico";
export const GATILHO_LEGADO = {
  id: null,
  nome: "Diagnóstico",
  tipo: "diagnostico",
  palavras: [
    "diagnostico"
  ],
  midias: [],
  respostas_publicas: [],
  mensagem: "",
  botao_tipo: "diagnostico",
  botao_texto: "",
  botao_url: null,
  whatsapp_texto: null
};
/** A palavra aparece inteira no comentário (sem acento, maiúscula ou minúscula). */ export function casaPalavra(texto, palavra) {
  if (typeof texto !== "string" || !palavra) return false;
  const t = semAcento(texto), p = semAcento(palavra).replace(/[^a-z0-9 ]/g, "").trim();
  if (!p) return false;
  const esc = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t);
}
/** Escolhe o gatilho do comentário: primeiro os ligados ao post, depois os de "qualquer post". */ export function escolherGatilho(gatilhos, texto, mediaId) {
  const casam = (gatilhos ?? []).filter((g)=>g.ativo !== false && (g.palavras ?? []).some((p)=>casaPalavra(texto, p)));
  const doPost = casam.find((g)=>(g.midias ?? []).length && mediaId && g.midias.includes(mediaId));
  if (doPost) return doPost;
  return casam.find((g)=>!(g.midias ?? []).length) ?? null;
}
export function textoComNome(texto, nome) {
  const t = String(texto ?? "");
  const r = nome ? t.replace(/\{nome\}/g, nome) : t.replace(/[,\s]*\{nome\}/g, "");
  return r.replace(/[ \t]{2,}/g, " ").trim();
}
const slug = (s)=>semAcento(String(s ?? "")).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
/** Endereço do botão do Direct. Página e WhatsApp já saem com a origem marcada. */ export function urlDoBotao(g, ctx = {}) {
  const tipo = g.botao_tipo ?? "nenhum";
  if (tipo === "whatsapp") {
    const msg = (g.whatsapp_texto ?? "").trim() || "Oi, quero o diagnóstico gratuito.";
    return `https://wa.me/${WHATSAPP_ANA}?text=${encodeURIComponent(msg)}`;
  }
  if (tipo === "diagnostico") {
    const q = new URLSearchParams({
      utm_source: "instagram",
      utm_medium: ctx.adId ? "pago" : "organico",
      utm_campaign: `gatilho-${slug(g.nome) || "instagram"}`,
      utm_content: slug((g.palavras ?? [])[0]) || "comentario"
    });
    return `${PAGINA_DIAGNOSTICO}?${q}`;
  }
  if (tipo === "link" && /^https?:\/\//i.test(g.botao_url ?? "")) return g.botao_url;
  return null;
}
export function ehComandoParar(texto) {
  return [
    "parar",
    "pare",
    "sair",
    "cancelar",
    "stop"
  ].includes(semAcento(texto).replace(/[^a-z]/g, ""));
}
export function normalizarWhatsapp(entrada) {
  if (typeof entrada !== "string" && typeof entrada !== "number") return null;
  let d = String(entrada).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);
  else if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[1] === "0") return null;
  const num = d.slice(2);
  if (num.length === 9 && num[0] !== "9") return null;
  if (num.length === 8 && !/^[2-5]/.test(num)) return null; // fixo; celular sem o 9 é recusado
  if (/^(\d)\1+$/.test(num)) return null;
  return "55" + d;
}
export function formatarWhatsapp(n) {
  const d = n.startsWith("55") ? n.slice(2) : n;
  const ddd = d.slice(0, 2), num = d.slice(2);
  const corte = num.length === 9 ? 5 : 4;
  return `(${ddd}) ${num.slice(0, corte)}-${num.slice(corte)}`;
}
export function normalizarEmail(entrada) {
  if (typeof entrada !== "string") return null;
  const e = entrada.toLowerCase().replace(/\s+/g, "");
  const ok = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e) && !e.includes("..") && e.length <= 254;
  return ok ? e : null;
}
export function casarOpcao(opcoes, texto, payload) {
  if (payload?.startsWith("OPT:")) {
    const i = Number(payload.slice(4));
    if (Number.isInteger(i) && opcoes[i]) return opcoes[i].v;
  }
  const norm = (o)=>semAcento(o).replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const t = norm(texto);
  if (!t) return null;
  if (/^\d{1,2}\)?\.?$/.test(t)) {
    const n = Number(t.replace(/\D/g, ""));
    if (n >= 1 && n <= opcoes.length) return opcoes[n - 1].v;
  }
  const exata = opcoes.find((o)=>norm(o.t) === t || norm(o.v) === t);
  if (exata) return exata.v;
  const palavras = t.split(/[^a-z0-9]+/).filter((p)=>p.length >= 4);
  const candidatas = opcoes.filter((o)=>{
    const on = norm(o.t + " " + o.v).split(/[^a-z0-9]+/).filter((p)=>p.length >= 4);
    return on.some((w)=>palavras.includes(w));
  });
  return candidatas.length === 1 ? candidatas[0].v : null;
}
export function ehSim(texto) {
  const t = semAcento(texto).replace(/[^a-z0-9 ]/g, "").trim();
  return /^(ok|okay|sim|s|pode|pode seguir|ok pode seguir|seguir|bora|vamos|claro|beleza|blz|certo|aceito|concordo|continuar)$/.test(t) || /^(👍|✅|👌)+$/u.test(texto.trim());
}
export function ehBora(texto, payload) {
  if (payload === BOTAO_BORA.payload || payload === BOTAO_CONTINUAR.payload) return true;
  const t = semAcento(texto).replace(/[^a-z ]/g, "").trim();
  return /^(bora|vamos|vamo|sim|quero|comecar|ok|continuar|pode|bora sim|quero sim)$/.test(t);
}
export function ehSite(texto, payload) {
  if (payload === BOTAO_SITE.payload) return true;
  const t = semAcento(texto);
  return /\b(site|link|formulario|prefiro pelo site)\b/.test(t);
}
// ===== lead.ts =====
export const POST_URL = "https://www.instagram.com/p/De-T9JQmabQ/";
export function payloadPagina(s) {
  const utm = {
    utm_source: s.utm_source,
    utm_medium: s.utm_medium,
    utm_campaign: s.utm_campaign,
    utm_term: s.utm_term,
    utm_content: s.utm_content
  };
  return {
    nome: s.nome ?? "",
    whatsapp: (s.whatsapp ?? "").replace(/^55/, ""),
    email: s.email ?? "",
    empresa: s.empresa ?? "",
    segmento: s.segmento ?? "",
    cargo: s.cargo ?? "",
    faturamento: s.faturamento ?? "",
    equipe: s.equipe ?? "",
    canais: s.canais ? [
      s.canais
    ] : [],
    dores: s.dores ? [
      s.dores
    ] : [],
    tempo_resposta: s.tempo_resposta ?? "",
    invest_marketing: s.invest_marketing ?? "",
    prazo: s.prazo ?? "",
    desafio: s.desafio ?? "",
    aceite: s.lgpd_aceite,
    utm,
    utm_first: utm,
    landing_url: POST_URL,
    referrer: "instagram_direct",
    page_url: POST_URL,
    fbp: "",
    fbc: "",
    event_id: `lead_igdm_${s.chave}`,
    website: "",
    origem: "instagram_direct",
    instagram_username: s.instagram_username,
    id_comentario: s.id_comentario
  };
}
export const COLUNAS_PLANILHA = [
  "chave",
  "data_comentario",
  "data_conclusao",
  "concluiu_fluxo",
  "ultima_etapa",
  "instagram_username",
  "nome",
  "empresa",
  "segmento",
  "cargo",
  "faturamento",
  "fora_do_perfil",
  "equipe",
  "canais",
  "invest_marketing",
  "tempo_resposta",
  "dores",
  "prazo",
  "desafio",
  "whatsapp",
  "email",
  "lgpd_aceite",
  "escolheu_site",
  "origem",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "id_comentario",
  "teste"
];
export function linhaPlanilha(s) {
  const out = {};
  const r = s;
  for (const c of COLUNAS_PLANILHA){
    let v = c === "origem" ? "instagram_direct" : r[c];
    if (typeof v === "boolean") v = v ? "sim" : "não";
    out[c] = v ?? "";
  }
  return out;
}
// ===== webhook.ts =====
export const paraISO = (t, padrao)=>{
  if (typeof t === "number") return new Date(t < 1e12 ? t * 1000 : t).toISOString();
  if (typeof t === "string" && t) {
    const d = new Date(t.replace(/\+0000$/, "Z"));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return padrao;
};
export async function assinaturaValida(corpo, cabecalho, segredo) {
  if (!cabecalho?.startsWith("sha256=") || !segredo) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), {
    name: "HMAC",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const esperado = Array.from(mac, (b)=>b.toString(16).padStart(2, "0")).join("");
  const recebido = cabecalho.slice(7).toLowerCase();
  if (recebido.length !== esperado.length) return false;
  let dif = 0;
  for(let i = 0; i < esperado.length; i++)dif |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return dif === 0;
}
export function lerNotificacao(payload, agoraISO) {
  const comentarios = [];
  const mensagens = [];
  if (payload?.object !== "instagram") return {
    comentarios,
    mensagens
  };
  for (const e of payload.entry ?? []){
    const mudancas = [
      ...e.changes ?? []
    ];
    if (e.field && e.value) mudancas.push({
      field: e.field,
      value: e.value
    });
    for (const m of mudancas){
      if (m.field !== "comments") continue;
      const v = m.value ?? {};
      const id = v.id ?? v.comment_id;
      if (!id || !v.from?.id) continue;
      comentarios.push({
        comentarioId: String(id),
        texto: String(v.text ?? ""),
        deId: String(v.from.id),
        deUsername: v.from.username ?? null,
        mediaId: v.media?.original_media_id ?? v.media?.id ?? null,
        adId: v.media?.ad_id ?? null,
        criadoEm: paraISO(e.time, agoraISO)
      });
    }
    for (const ev of e.messaging ?? []){
      const de = ev.sender?.id;
      if (!de) continue;
      if (ev.message) {
        const msg = ev.message;
        if (msg.is_echo || msg.is_deleted || msg.is_unsupported) continue;
        mensagens.push({
          mid: String(msg.mid),
          deId: String(de),
          texto: String(msg.text ?? ""),
          payload: msg.quick_reply?.payload ?? null,
          criadoEm: paraISO(ev.timestamp, agoraISO)
        });
      } else if (ev.postback) {
        mensagens.push({
          mid: String(ev.postback.mid ?? `pb-${de}-${ev.timestamp}`),
          deId: String(de),
          texto: String(ev.postback.title ?? ""),
          payload: ev.postback.payload ?? null,
          criadoEm: paraISO(ev.timestamp, agoraISO)
        });
      }
    }
  }
  return {
    comentarios,
    mensagens
  };
}
export function comentarioDaApi(c, mediaId, agoraISO) {
  if (!c.from?.id) return null;
  return {
    comentarioId: c.id,
    texto: c.text ?? "",
    deId: c.from.id,
    deUsername: c.from.username ?? c.username ?? null,
    mediaId,
    adId: null,
    criadoEm: paraISO(c.timestamp, agoraISO)
  };
}
export function mensagemDaApi(m, agoraISO) {
  if (!m.from?.id) return null;
  return {
    mid: m.id,
    deId: m.from.id,
    texto: m.message ?? "",
    payload: null,
    criadoEm: paraISO(m.created_time, agoraISO)
  };
}
// ===== instagram.ts =====
export class ErroInstagram extends Error {
  status;
  corpo;
  constructor(status, corpo){
    super(`Meta ${status}: ${JSON.stringify(corpo)}`);
    this.status = status;
    this.corpo = corpo;
  }
}
export class InstagramApi {
  tokenSistema;
  tokenPagina;
  ids;
  base;
  constructor(tokenSistema, tokenPagina, ids, versao = "v25.0"){
    this.tokenSistema = tokenSistema;
    this.tokenPagina = tokenPagina;
    this.ids = ids;
    this.base = `https://graph.facebook.com/${versao}`;
  }
  async chamar(metodo, caminho, opts = {}) {
    const url = new URL(this.base + caminho);
    for (const [k, v] of Object.entries(opts.query ?? {}))url.searchParams.set(k, v);
    const token = opts.token === "pagina" ? await this.tokenPagina() : await this.tokenSistema();
    const r = await fetch(url, {
      method: metodo,
      headers: {
        authorization: `Bearer ${token}`,
        ...opts.corpo ? {
          "content-type": "application/json"
        } : {}
      },
      body: opts.corpo ? JSON.stringify(opts.corpo) : undefined
    });
    const txt = await r.text();
    let json;
    try {
      json = JSON.parse(txt);
    } catch  {
      json = txt;
    }
    if (!r.ok) throw new ErroInstagram(r.status, json);
    return json;
  }
  mensagem(msg) {
    if (msg.link) {
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "button",
            text: msg.texto.slice(0, 640),
            buttons: [
              {
                type: "web_url",
                url: msg.link.url,
                title: msg.link.titulo.slice(0, 20)
              }
            ]
          }
        }
      };
    }
    const m = {
      text: msg.texto.slice(0, 990)
    };
    if (msg.botoes?.length) {
      m.quick_replies = msg.botoes.slice(0, 13).map((b)=>({
          content_type: "text",
          title: b.titulo.slice(0, 20),
          payload: b.payload
        }));
    }
    return m;
  }
  async postarMensagem(corpo) {
    const { pageId, igId } = await this.ids();
    try {
      await this.chamar("POST", `/${pageId}/messages`, {
        corpo,
        token: "pagina"
      });
    } catch (e) {
      if (!(e instanceof ErroInstagram) || e.status >= 500) throw e;
      await this.chamar("POST", `/${igId}/messages`, {
        corpo,
        token: "pagina"
      });
    }
  }
  async responderComentario(comentarioId, texto) {
    await this.chamar("POST", `/${comentarioId}/replies`, {
      corpo: {
        message: texto
      },
      token: "pagina"
    });
  }
  async respostaPrivada(comentarioId, msg) {
    await this.postarMensagem({
      recipient: {
        comment_id: comentarioId
      },
      message: this.mensagem(msg)
    });
  }
  async enviar(usuarioId, msg) {
    await this.postarMensagem({
      recipient: {
        id: usuarioId
      },
      messaging_type: "RESPONSE",
      message: this.mensagem(msg)
    });
  }
  async primeiroNome(usuarioId) {
    const r = await this.chamar("GET", `/${usuarioId}`, {
      query: {
        fields: "name"
      },
      token: "pagina"
    });
    const n = r.name?.trim().split(/\s+/)[0];
    return n || null;
  }
  async paginas() {
    const r = await this.chamar("GET", "/me/accounts", {
      query: {
        fields: "id,name,access_token,instagram_business_account{id,username}",
        limit: "50"
      }
    });
    return r.data ?? [];
  }
  conta(igId) {
    return this.chamar("GET", `/${igId}`, {
      query: {
        fields: "id,username"
      }
    });
  }
  async listarMidias(igId) {
    const r = await this.chamar("GET", `/${igId}/media`, {
      query: {
        fields: "id,permalink,timestamp",
        limit: "50"
      }
    });
    return r.data ?? [];
  }
  async assinarWebhooksPagina(pageId) {
    return await this.chamar("POST", `/${pageId}/subscribed_apps`, {
      query: {
        subscribed_fields: "messages,messaging_postbacks,feed"
      },
      token: "pagina"
    });
  }
  async comentarios(mediaId) {
    const r = await this.chamar("GET", `/${mediaId}/comments`, {
      query: {
        fields: "id,text,timestamp,from,username",
        limit: "50"
      }
    });
    return r.data ?? [];
  }
  async conversasRecentes() {
    const { pageId } = await this.ids();
    const r = await this.chamar("GET", `/${pageId}/conversations`, {
      query: {
        platform: "instagram",
        fields: "id,updated_time",
        limit: "25"
      },
      token: "pagina"
    });
    return r.data ?? [];
  }
  async mensagens(conversaId) {
    const r = await this.chamar("GET", `/${conversaId}`, {
      query: {
        fields: "messages.limit(10){id,created_time,from,message}"
      },
      token: "pagina"
    });
    return r.messages?.data ?? [];
  }
}
const H = 3600_000;
export function novaSessao(chave) {
  return {
    chave,
    instagram_username: null,
    estado: null,
    versao: 0,
    tentativas: 0,
    etapa_num: 0,
    ultima_etapa: null,
    nome: null,
    empresa: null,
    segmento: null,
    cargo: null,
    faturamento: null,
    equipe: null,
    canais: null,
    invest_marketing: null,
    tempo_resposta: null,
    dores: null,
    prazo: null,
    desafio: null,
    whatsapp: null,
    email: null,
    fora_do_perfil: false,
    lgpd_aceite: false,
    escolheu_site: false,
    concluiu_fluxo: false,
    id_comentario: null,
    media_id: null,
    ad_id: null,
    comentario_texto: null,
    data_comentario: null,
    data_inicio: null,
    data_conclusao: null,
    janela_ate: null,
    ultima_msg_usuario_em: null,
    ultima_msg_bot_em: null,
    lembrete_enviado: false,
    utm_source: UTM.utm_source,
    utm_medium: null,
    utm_campaign: UTM.utm_campaign,
    utm_term: UTM.utm_term,
    utm_content: UTM.utm_content,
    teste: false,
    enviado_sdr_em: null,
    sdr_diagnostico_id: null,
    erro: null
  };
}
function primeiroNome(nome) {
  if (!nome) return "";
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p[0].toUpperCase() + p.slice(1) : "";
}
function textoPergunta(p, s) {
  return typeof p.texto === "function" ? p.texto(primeiroNome(s.nome)) : p.texto;
}
function msgPergunta(p, s) {
  const texto = textoPergunta(p, s);
  if (p.estado === "lgpd") return {
    texto,
    botoes: [
      BOTAO_LGPD
    ]
  };
  if (p.pular) return {
    texto,
    botoes: [
      BOTAO_PULAR
    ]
  };
  return {
    texto,
    botoes: p.opcoes?.map((o, i)=>({
        titulo: o.t,
        payload: `OPT:${i}`
      }))
  };
}
function msgAbertura(s, nomeIg) {
  const p = proximaPergunta(s);
  if (!p || p.estado === "p_nome") return {
    texto: TEXTOS.abertura(primeiroNome(s.nome) || nomeIg)
  };
  const m = msgPergunta(p, s);
  return {
    texto: TEXTOS.retomada(primeiroNome(s.nome)) + textoPergunta(p, s),
    botoes: m.botoes
  };
}
function proximaPergunta(s) {
  for (const p of PERGUNTAS){
    if (p.campo === null ? !s.lgpd_aceite : s[p.campo] === null) return p;
  }
  return null;
}
function avancar(s, out, agora) {
  const p = proximaPergunta(s);
  s.tentativas = 0;
  if (p) {
    s.estado = p.estado;
    out.push({
      tipo: "dm",
      msg: msgPergunta(p, s)
    });
    return;
  }
  s.estado = "concluido";
  s.concluiu_fluxo = true;
  s.etapa_num = ETAPA_CONCLUIU;
  s.ultima_etapa = "concluiu";
  s.data_conclusao ??= agora;
  out.push({
    tipo: "dm",
    msg: {
      texto: TEXTOS.encerramento(primeiroNome(s.nome), formatarWhatsapp(s.whatsapp), s.email)
    }
  });
}
function registrarEtapa(s, etapa, num) {
  s.ultima_etapa = etapa;
  s.etapa_num = Math.max(s.etapa_num, num);
}
function comecar(s, out, agora) {
  s.data_inicio ??= agora;
  registrarEtapa(s, "iniciou", 1);
  avancar(s, out, agora);
}
function responder(s, p, texto, payload, out, agora) {
  const t = texto.trim();
  if (p.estado === "lgpd") {
    if (payload === BOTAO_LGPD.payload || ehSim(t)) {
      s.lgpd_aceite = true;
      registrarEtapa(s, "lgpd", p.etapaNum);
      return avancar(s, out, agora);
    }
    out.push({
      tipo: "dm",
      msg: msgPergunta(p, s)
    });
    return;
  }
  let valor = null;
  if (p.campo === "nome" && (ehBora(t, payload) || pedeDiagnostico(t))) {
    out.push({
      tipo: "dm",
      msg: msgPergunta(p, s)
    });
    return;
  }
  if (p.opcoes) {
    valor = casarOpcao(p.opcoes, t, payload);
    if (!valor) {
      s.tentativas++;
      out.push({
        tipo: "dm",
        msg: {
          texto: TEXTOS.escolhaUmaOpcao
        }
      });
      out.push({
        tipo: "dm",
        msg: msgPergunta(p, s)
      });
      return;
    }
  } else if (p.campo === "whatsapp" || p.campo === "email") {
    valor = p.campo === "whatsapp" ? normalizarWhatsapp(t) : normalizarEmail(t);
    if (!valor) {
      s.tentativas++;
      if (s.tentativas >= MAX_TENTATIVAS) {
        s.estado = "validacao_falhou";
        out.push({
          tipo: "dm",
          msg: {
            texto: TEXTOS.desistirValidacao
          }
        });
      } else {
        out.push({
          tipo: "dm",
          msg: {
            texto: p.campo === "whatsapp" ? TEXTOS.whatsappInvalido : TEXTOS.emailInvalido
          }
        });
      }
      return;
    }
  } else if (p.pular && (payload === BOTAO_PULAR.payload || /^pular$/i.test(t))) {
    valor = "";
  } else {
    valor = t.slice(0, p.campo === "desafio" ? 500 : 120);
    if (!valor) {
      out.push({
        tipo: "dm",
        msg: msgPergunta(p, s)
      }); // figurinha, áudio etc.
      return;
    }
  }
  s[p.campo] = valor;
  if (s.etapa_num < 1) registrarEtapa(s, "iniciou", 1);
  s.data_inicio ??= agora;
  if (p.campo === "faturamento") s.fora_do_perfil = valor === FAIXA_FORA_DO_PERFIL;
  if (p.campo === "whatsapp") s.lgpd_aceite = true;
  registrarEtapa(s, p.campo, p.etapaNum);
  avancar(s, out, agora);
}
export class Motor {
  d;
  constructor(d){
    this.d = d;
  }
  agoraISO() {
    return this.d.agora().toISOString();
  }
  async comSessao(chave, fn) {
    for(let tentativa = 0; tentativa < 4; tentativa++){
      const atual = await this.d.store.carregar(chave);
      const s = atual ? structuredClone(atual) : novaSessao(chave);
      const out = [];
      const salvar = fn(s, !atual, out);
      if (salvar === false) return atual;
      const versaoAnterior = atual ? atual.versao : null;
      s.versao = (atual?.versao ?? 0) + 1;
      if (out.some((o)=>o.tipo === "dm")) s.ultima_msg_bot_em = this.agoraISO();
      if (!await this.d.store.salvar(s, versaoAnterior)) continue; // outra execução ganhou: refaz
      await this.enviarTudo(s, out);
      try {
        await this.d.depoisDeSalvar(s);
      } catch (e) {
        await this.d.store.log("erro", "depoisDeSalvar", {
          chave,
          erro: String(e)
        });
      }
      return s;
    }
    await this.d.store.log("erro", "conflito de versão persistente", {
      chave
    });
    return null;
  }
  async enviarTudo(s, out) {
    for (const o of out){
      try {
        if (o.tipo === "publica") {
          await this.d.ig.responderComentario(o.comentarioId, o.texto);
        } else if (o.tipo === "privada") {
          try {
            await this.d.ig.respostaPrivada(o.comentarioId, o.msg);
          } catch (e) {
            if (o.msg.link) {
              await this.d.store.log("info", "resposta privada sem botão de link", {
                erro: String(e)
              });
              await this.d.ig.respostaPrivada(o.comentarioId, {
                texto: `${o.msg.texto}\n\n👉 ${o.msg.link.url}`
              });
              continue;
            }
            if (!o.msg.botoes?.length) throw e;
            await this.d.store.log("info", "resposta privada sem botões", {
              erro: String(e)
            });
            await this.d.ig.respostaPrivada(o.comentarioId, {
              texto: o.msg.texto + TEXTOS.aberturaSemBotoes
            });
          }
        } else {
          if (!s.janela_ate || s.janela_ate <= this.agoraISO()) {
            await this.d.store.log("info", "DM não enviada: fora da janela de 24h", {
              chave: s.chave
            });
            continue;
          }
          await this.d.ig.enviar(s.chave, o.msg);
        }
      } catch (e) {
        await this.d.store.log("erro", `falha ao enviar (${o.tipo})`, {
          chave: s.chave,
          erro: String(e)
        });
      }
    }
  }
  ehTeste(username) {
    return !!username && this.d.config.testUsernames.includes(username.toLowerCase());
  }
  async comentario(ev) {
    const c = this.d.config;
    if (ev.deId === c.igAccountId) return; // nossas próprias respostas
    const g = c.gatilhos ? escolherGatilho(c.gatilhos, ev.texto, ev.mediaId) : pedeDiagnostico(ev.texto) && (!c.mediaIds.length || ev.mediaId && c.mediaIds.includes(ev.mediaId)) ? GATILHO_LEGADO : null;
    if (!g) return;
    const idadeH = (this.d.agora().getTime() - new Date(ev.criadoEm).getTime()) / H;
    if (idadeH > 24 * 7 - 1) return; // resposta privada só até 7 dias
    if (!await this.d.store.novoEvento(`c:${ev.comentarioId}`, "comentario", {
      ...ev,
      gatilho_id: g.id
    })) return;
    let nome = "";
    try {
      nome = await this.d.ig.primeiroNome?.(ev.deId) ?? "";
    } catch  {}
    if (g.tipo !== "diagnostico") {
      await this.enviarGatilho(ev, g, nome);
      return;
    }
    await this.d.contar?.(g.id, true);
    await this.comSessao(ev.deId, (s, nova, out)=>{
      const agora = this.agoraISO();
      if (ev.deUsername) s.instagram_username = ev.deUsername;
      s.id_comentario = ev.comentarioId;
      s.media_id = ev.mediaId;
      s.comentario_texto = ev.texto.slice(0, 300);
      s.data_comentario ??= ev.criadoEm || agora;
      if (ev.adId) s.ad_id = ev.adId;
      if (nova || !s.utm_medium || ev.adId) s.utm_medium = ev.adId ? "pago" : c.mediumSemAd;
      if (this.ehTeste(s.instagram_username)) s.teste = true;
      const variantes = g.respostas_publicas?.length ? g.respostas_publicas : TEXTOS.respostasPublicas;
      out.push({
        tipo: "publica",
        comentarioId: ev.comentarioId,
        texto: variantes[Math.floor(this.d.sorteio() * variantes.length) % variantes.length]
      });
      if (s.concluiu_fluxo) {
        out.push({
          tipo: "privada",
          comentarioId: ev.comentarioId,
          msg: {
            texto: TEXTOS.jaConcluiu(primeiroNome(s.nome))
          }
        });
        return;
      }
      if (c.fluxo === "link") {
        s.estado = "link_enviado";
        registrarEtapa(s, "link", 1);
        out.push({
          tipo: "privada",
          comentarioId: ev.comentarioId,
          msg: {
            texto: g.mensagem ? textoComNome(g.mensagem, nome) : TEXTOS.aberturaLink(nome),
            link: {
              titulo: g.botao_texto || TEXTOS.botaoLink,
              url: g.id ? urlDoBotao(g, {
                adId: ev.adId
              }) ?? LINK_SITE : LINK_SITE
            }
          }
        });
        return;
      }
      s.estado = proximaPergunta(s)?.estado ?? "p_nome";
      s.lembrete_enviado = false;
      s.tentativas = 0;
      s.ultima_etapa ??= "comentou";
      out.push({
        tipo: "privada",
        comentarioId: ev.comentarioId,
        msg: msgAbertura(s, nome)
      });
    });
  }
  /** Gatilho simples: responde no comentário e manda uma mensagem no Direct (com botão, se tiver). */ async enviarGatilho(ev, g, nome) {
    const variantes = g.respostas_publicas?.length ? g.respostas_publicas : TEXTOS.respostasPublicas;
    try {
      await this.d.ig.responderComentario(ev.comentarioId, variantes[Math.floor(this.d.sorteio() * variantes.length) % variantes.length]);
    } catch (e) {
      await this.d.store.log("erro", "gatilho: resposta no comentário", {
        gatilho: g.id,
        erro: String(e)
      });
    }
    let enviou = false;
    const texto = textoComNome(g.mensagem, nome);
    if (texto) {
      const url = urlDoBotao(g, {
        adId: ev.adId
      });
      const msg = url ? {
        texto,
        link: {
          titulo: g.botao_texto || "Abrir",
          url
        }
      } : {
        texto
      };
      try {
        await this.d.ig.respostaPrivada(ev.comentarioId, msg);
        enviou = true;
      } catch (e) {
        if (url) {
          try {
            await this.d.ig.respostaPrivada(ev.comentarioId, {
              texto: `${texto}\n\n👉 ${url}`
            });
            enviou = true;
          } catch (e2) {
            await this.d.store.log("erro", "gatilho: direct", {
              gatilho: g.id,
              erro: String(e2)
            });
          }
        } else {
          await this.d.store.log("erro", "gatilho: direct", {
            gatilho: g.id,
            erro: String(e)
          });
        }
      }
    }
    await this.d.contar?.(g.id, enviou);
  }
  async mensagem(ev) {
    if (ev.deId === this.d.config.igAccountId) return;
    if (this.d.config.fluxo === "link") return; // sem acesso avançado não dá para responder no direct
    if (!await this.d.store.novoEvento(`m:${ev.mid}`, "mensagem", ev)) return;
    const texto = ev.texto ?? "";
    await this.comSessao(ev.deId, (s, nova, out)=>{
      const agora = this.agoraISO();
      const quando = ev.criadoEm || agora;
      s.ultima_msg_usuario_em = quando;
      s.janela_ate = new Date(new Date(quando).getTime() + 24 * H).toISOString();
      if (nova) {
        if (!pedeDiagnostico(texto)) return false;
        s.utm_medium = this.d.config.mediumSemAd;
        s.data_comentario = quando;
        s.estado = "p_nome";
        out.push({
          tipo: "dm",
          msg: msgAbertura(s, "")
        });
        return;
      }
      const estado = s.estado ?? "";
      if (ESTADOS_ATIVOS.has(estado) && ehComandoParar(texto)) {
        s.estado = "parou";
        out.push({
          tipo: "dm",
          msg: {
            texto: TEXTOS.parou
          }
        });
        return;
      }
      if (estado === "convidado") {
        if (ehSite(texto, ev.payload)) {
          s.escolheu_site = true;
          s.estado = "site";
          registrarEtapa(s, "site", 1);
          out.push({
            tipo: "dm",
            msg: {
              texto: TEXTOS.site
            }
          });
        } else if (ehBora(texto, ev.payload) || pedeDiagnostico(texto)) {
          comecar(s, out, agora);
        } else {
          out.push({
            tipo: "dm",
            msg: {
              texto: TEXTOS.lembreteConvite,
              botoes: [
                BOTAO_BORA,
                BOTAO_SITE
              ]
            }
          });
        }
        return;
      }
      const p = PERGUNTAS.find((q)=>q.estado === estado);
      if (p) {
        if (ev.payload === BOTAO_CONTINUAR.payload) {
          out.push({
            tipo: "dm",
            msg: msgPergunta(p, s)
          });
          return;
        }
        responder(s, p, texto, ev.payload, out, agora);
        return;
      }
      if (pedeDiagnostico(texto)) {
        if (s.concluiu_fluxo) {
          out.push({
            tipo: "dm",
            msg: {
              texto: TEXTOS.jaConcluiu(primeiroNome(s.nome))
            }
          });
        } else {
          s.estado = proximaPergunta(s)?.estado ?? "p_nome";
          s.lembrete_enviado = false;
          out.push({
            tipo: "dm",
            msg: msgAbertura(s, "")
          });
        }
        return;
      }
    });
  }
  async lembretes() {
    const agora = this.d.agora();
    const limite = new Date(agora.getTime() - this.d.config.horasLembrete * H).toISOString();
    const lista = await this.d.store.paraLembrete(limite, new Date(agora.getTime() + 5 * 60_000).toISOString());
    let n = 0;
    for (const alvo of lista){
      const r = await this.comSessao(alvo.chave, (s, _nova, out)=>{
        const ultima = [
          s.ultima_msg_usuario_em,
          s.ultima_msg_bot_em
        ].filter(Boolean).sort().pop();
        if (s.lembrete_enviado || !ESTADOS_ATIVOS.has(s.estado ?? "") || !ultima || ultima > limite) return false;
        if (!s.janela_ate || s.janela_ate <= agora.toISOString()) return false;
        s.lembrete_enviado = true;
        if (s.estado === "convidado") {
          out.push({
            tipo: "dm",
            msg: {
              texto: TEXTOS.lembreteConvite,
              botoes: [
                BOTAO_BORA,
                BOTAO_SITE
              ]
            }
          });
        } else {
          const p = PERGUNTAS.find((q)=>q.estado === s.estado);
          out.push({
            tipo: "dm",
            msg: {
              texto: TEXTOS.lembretePergunta
            }
          });
          out.push({
            tipo: "dm",
            msg: msgPergunta(p, s)
          });
        }
      });
      if (r?.lembrete_enviado && r.chave === alvo.chave && !alvo.lembrete_enviado) n++;
    }
    return n;
  }
}
// ===== banco.ts =====
const T = "direct_fluxo_diagnostico";
const DA_ENTREGA = [
  "enviado_sdr_em",
  "sdr_diagnostico_id"
];
export class Banco {
  sb;
  constructor(sb){
    this.sb = sb;
  }
  async novoEvento(id, tipo, dados) {
    const { error } = await this.sb.from("ig_eventos").insert({
      id,
      tipo,
      dados
    });
    if (!error) return true;
    if (error.code === "23505") return false; // já processado
    throw new Error(`ig_eventos: ${error.message}`);
  }
  async carregar(chave) {
    const { data, error } = await this.sb.from(T).select("*").eq("chave", chave).maybeSingle();
    if (error) throw new Error(`carregar: ${error.message}`);
    return data;
  }
  async salvar(s, versaoAnterior) {
    const linha = {
      ...s,
      atualizado_em: new Date().toISOString()
    };
    for (const c of DA_ENTREGA)delete linha[c];
    delete linha.criado_em;
    if (versaoAnterior === null) {
      const { error } = await this.sb.from(T).insert(linha);
      if (!error) return true;
      if (error.code === "23505") return false;
      throw new Error(`salvar (insert): ${error.message}`);
    }
    const { data, error } = await this.sb.from(T).update(linha).eq("chave", s.chave).eq("versao", versaoAnterior).select("chave");
    if (error) throw new Error(`salvar (update): ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
  async paraLembrete(limite, agora) {
    const { data, error } = await this.sb.from(T).select("*").in("estado", [
      ...ESTADOS_ATIVOS
    ]).eq("lembrete_enviado", false).gt("janela_ate", agora).lte("ultima_msg_usuario_em", limite).or(`ultima_msg_bot_em.is.null,ultima_msg_bot_em.lte."${limite}"`).limit(50);
    if (error) throw new Error(`paraLembrete: ${error.message}`);
    return data ?? [];
  }
  async log(nivel, msg, dados) {
    if (nivel === "erro") console.error(msg, dados);
    else console.log(msg, dados);
    await this.sb.from("ig_logs").insert({
      nivel,
      msg,
      dados: dados ?? null
    });
  }
  async config(chave) {
    const { data } = await this.sb.from("ig_config").select("valor").eq("chave", chave).maybeSingle();
    return data?.valor ?? null;
  }
  async definir(chave, valor) {
    const { error } = await this.sb.from("ig_config").upsert({
      chave,
      valor,
      atualizado_em: new Date().toISOString()
    });
    if (error) throw new Error(`ig_config: ${error.message}`);
  }
  async entregarLead(s, endpoint) {
    if (!s.concluiu_fluxo || s.enviado_sdr_em) return false;
    const agora = new Date().toISOString();
    const { data: pego } = await this.sb.from(T).update({
      enviado_sdr_em: agora
    }).eq("chave", s.chave).is("enviado_sdr_em", null).eq("concluiu_fluxo", true).select("*").maybeSingle();
    if (!pego) return false; // outra execução já entregou
    const lead = pego;
    let resposta = {};
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "origin": "https://demandhub.com.br",
          "referer": "https://demandhub.com.br/diagnostico"
        },
        body: JSON.stringify(payloadPagina(lead))
      });
      const txt = await r.text();
      try {
        resposta = JSON.parse(txt);
      } catch  {
        resposta = {
          corpo: txt.slice(0, 300)
        };
      }
      if (!r.ok) throw new Error(`endpoint ${r.status}: ${txt.slice(0, 300)}`);
    } catch (e) {
      await this.sb.from(T).update({
        enviado_sdr_em: null,
        erro: String(e).slice(0, 500)
      }).eq("chave", s.chave);
      throw e;
    }
    const id = resposta.id ?? resposta.lead_id ?? null;
    await this.sb.from(T).update({
      sdr_diagnostico_id: id != null ? String(id) : null,
      erro: null
    }).eq("chave", s.chave);
    const { error } = await this.sb.from("sdr_diagnosticos").update({
      origem: "instagram_direct",
      instagram_username: lead.instagram_username,
      id_comentario: lead.id_comentario,
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      utm_term: lead.utm_term,
      utm_content: lead.utm_content,
      fora_do_perfil: lead.fora_do_perfil,
      teste: lead.teste
    }).eq("email", lead.email).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    if (error) await this.log("erro", "marcar origem em sdr_diagnosticos", {
      chave: s.chave,
      erro: error.message
    });
    return true;
  }
  async pendentesDeEntrega() {
    const { data } = await this.sb.from(T).select("*").eq("concluiu_fluxo", true).is("enviado_sdr_em", null).limit(20);
    return data ?? [];
  }
  async limparAntigos() {
    const limite = new Date(Date.now() - 30 * 86400_000).toISOString();
    await this.sb.from("ig_logs").delete().lt("criado_em", limite);
    await this.sb.from("ig_eventos").delete().lt("criado_em", limite);
  }
}
export async function enviarPlanilha(s, url, segredo) {
  if (!url) return;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      segredo,
      linha: linhaPlanilha(s)
    }),
    redirect: "follow"
  });
  if (!r.ok) throw new Error(`planilha ${r.status}`);
}
// ===== index.ts =====
const env = (k, padrao = "")=>Deno.env.get(k) || padrao;
const IG_PADRAO = "17841468293151891"; // @demand_ia
const lista = (k)=>env(k).split(",").map((s)=>s.trim().replace(/^@/, "").toLowerCase()).filter(Boolean);
function chaveServico() {
  const antiga = env("SUPABASE_SERVICE_ROLE_KEY");
  if (antiga) return antiga;
  try {
    const novas = JSON.parse(env("SUPABASE_SECRET_KEYS", "{}"));
    return novas.default ?? Object.values(novas)[0] ?? "";
  } catch  {
    return "";
  }
}
const sb = createClient(env("SUPABASE_URL"), chaveServico(), {
  auth: {
    persistSession: false
  }
});
const banco = new Banco(sb);
async function tokenSistema() {
  const t = env("META_SYSTEM_TOKEN");
  if (!t) throw new Error("sem token: configure META_SYSTEM_TOKEN");
  return t;
}
let paginaCache = null;
async function tokenPagina() {
  if (paginaCache && paginaCache.ate > Date.now()) return paginaCache.token;
  const t = await banco.config("page_token");
  if (!t) throw new Error("sem token da Página: rode ?job=setup");
  paginaCache = {
    token: t,
    ate: Date.now() + 60_000
  };
  return t;
}
async function ids() {
  const igId = await banco.config("ig_account_id") ?? env("IG_ACCOUNT_ID", IG_PADRAO);
  const pageId = await banco.config("page_id") ?? "";
  if (!igId || !pageId) throw new Error("IDs ausentes: rode ?job=setup");
  return {
    igId,
    pageId
  };
}
const ig = new InstagramApi(tokenSistema, tokenPagina, ids, env("GRAPH_VERSION", "v25.0"));
let cfgCache = null;
/** Gatilhos ativos. null = tabela ainda não existe (robô segue no modo antigo, só DIAGNÓSTICO). */ async function carregarGatilhos() {
  const { data, error } = await sb.from("ig_gatilhos").select("*").eq("ativo", true).order("criado_em");
  if (error) return null;
  return data ?? [];
}
async function contarGatilho(id, enviou) {
  if (!id) return;
  const { error } = await sb.rpc("ig_gatilho_contar", {
    p_id: id,
    p_enviou: enviou
  });
  if (error) await banco.log("erro", "contar gatilho", {
    id,
    erro: error.message
  });
}
async function config() {
  if (cfgCache && cfgCache.ate > Date.now()) return cfgCache.valor;
  const medium = env("MEDIUM_SEM_AD", "pago") === "organico" ? "organico" : "pago";
  const valor = {
    igAccountId: await banco.config("ig_account_id") ?? "",
    mediaIds: (await banco.config("media_ids") ?? "").split(",").filter(Boolean),
    mediumSemAd: medium,
    testUsernames: lista("TEST_USERNAMES"),
    horasLembrete: 2,
    fluxo: (await banco.config("fluxo") ?? env("FLUXO", "link")) === "conversa" ? "conversa" : "link",
    gatilhos: await carregarGatilhos()
  };
  cfgCache = {
    valor,
    ate: Date.now() + 60_000
  };
  return valor;
}
const modo = ()=>env("MODO", "consulta") === "webhook" ? "webhook" : "consulta";
const pendentes = [];
function emSegundoPlano(p) {
  const seguro = p.catch((e)=>banco.log("erro", "segundo plano", {
      erro: String(e)
    }));
  const rt = globalThis.EdgeRuntime;
  if (rt) rt.waitUntil(seguro);
  else pendentes.push(seguro);
}
const leadEndpoint = ()=>env("LEAD_ENDPOINT", "https://demandhub.com.br/api/diagnostico");
async function depoisDeSalvar(s) {
  emSegundoPlano(enviarPlanilha(s, env("SHEETS_WEBHOOK_URL") || null, env("SHEETS_SECRET")));
  if (s.concluiu_fluxo && !s.enviado_sdr_em) {
    await banco.entregarLead(s, leadEndpoint());
  }
}
async function motor() {
  return new Motor({
    ig,
    store: banco,
    config: await config(),
    agora: ()=>new Date(),
    sorteio: Math.random,
    depoisDeSalvar,
    contar: contarGatilho
  });
}
const json = (b, status = 200)=>new Response(JSON.stringify(b, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
/** Posts que o robô lê a cada rodada: os dos gatilhos e, se algum vale para "qualquer post", os 10 mais recentes. */ async function midiasParaConsultar(cfg) {
  if (!cfg.gatilhos) return cfg.mediaIds;
  const set = new Set();
  for (const g of cfg.gatilhos)for (const id of g.midias ?? [])set.add(id);
  if (cfg.gatilhos.some((g)=>!(g.midias ?? []).length) && cfg.igAccountId) {
    try {
      for (const md of (await ig.listarMidias(cfg.igAccountId)).slice(0, 10))set.add(md.id);
    } catch (e) {
      await banco.log("erro", "listar posts recentes", {
        erro: String(e)
      });
    }
  }
  return [
    ...set
  ];
}
async function consultar(m, cfg) {
  const agora = new Date().toISOString();
  let comentarios = 0, mensagens = 0;
  const desde = await banco.config("consulta_desde") ?? agora;
  for (const mediaId of (await midiasParaConsultar(cfg))){
    for (const c of (await ig.comentarios(mediaId))){
      const ev = comentarioDaApi(c, mediaId, agora);
      if (!ev || ev.criadoEm < desde) continue;
      await m.comentario(ev);
      comentarios++;
    }
  }
  if (cfg.fluxo === "link") return {
    comentarios,
    mensagens
  }; // direct só depois da aprovação da Meta
  const nossoUsername = await banco.config("ig_username");
  const cursor = await banco.config("cursor_mensagens") ?? new Date(Date.now() - 10 * 60_000).toISOString();
  let maior = cursor;
  const novas = [];
  for (const conv of (await ig.conversasRecentes())){
    if (paraISO(conv.updated_time, agora) < cursor) continue;
    for (const msg of (await ig.mensagens(conv.id))){
      const ev = mensagemDaApi(msg, agora);
      if (!ev || ev.deId === cfg.igAccountId || msg.from?.username === nossoUsername || ev.criadoEm < cursor) continue;
      novas.push(ev);
    }
  }
  novas.sort((a, b)=>a.criadoEm.localeCompare(b.criadoEm));
  for (const ev of novas){
    await m.mensagem(ev); // eventos repetidos são ignorados pelo motor
    mensagens++;
    if (ev.criadoEm > maior) maior = ev.criadoEm;
  }
  const proximo = new Date(Math.max(new Date(cursor).getTime(), new Date(maior).getTime() - 120_000)).toISOString();
  await banco.definir("cursor_mensagens", proximo);
  return {
    comentarios,
    mensagens
  };
}
async function tick() {
  const cfg = await config();
  const m = await motor();
  const r = {};
  if (modo() === "consulta" && cfg.igAccountId) {
    try {
      r.consulta = await consultar(m, cfg);
    } catch (e) {
      r.consulta = String(e);
      await banco.log("erro", "consulta", {
        erro: String(e)
      });
    }
  }
  try {
    r.lembretes = await m.lembretes();
  } catch (e) {
    r.lembretes = String(e);
    await banco.log("erro", "lembretes", {
      erro: String(e)
    });
  }
  for (const s of (await banco.pendentesDeEntrega())){
    try {
      await banco.entregarLead(s, leadEndpoint());
    } catch (e) {
      await banco.log("erro", "reentrega", {
        chave: s.chave,
        erro: String(e)
      });
    }
  }
  const ultima = await banco.config("limpeza_em") ?? "1970-01-01";
  if (Date.now() - new Date(ultima).getTime() > 24 * 3600_000) {
    await banco.definir("limpeza_em", new Date().toISOString());
    await banco.limparAntigos();
  }
  return r;
}
async function setup() {
  const igId = env("IG_ACCOUNT_ID", IG_PADRAO);
  const paginas = await ig.paginas();
  const pagina = paginas.find((p)=>p.instagram_business_account?.id === igId) ?? paginas[0];
  if (!pagina?.access_token) {
    throw new Error(`nenhuma Página com token para o usuário do sistema (páginas: ${paginas.map((p)=>p.name).join(", ") || "nenhuma"})`);
  }
  await banco.definir("page_id", pagina.id);
  await banco.definir("page_token", pagina.access_token);
  await banco.definir("ig_account_id", igId);
  paginaCache = null;
  const conta = await ig.conta(igId);
  await banco.definir("ig_username", conta.username);
  const codigos = env("POST_SHORTCODES", "De-T9JQmabQ").split(",").map((s)=>s.trim()).filter(Boolean);
  const midias = await ig.listarMidias(igId);
  const achadas = midias.filter((m)=>codigos.some((c)=>m.permalink?.includes(`/${c}`)));
  await banco.definir("media_ids", achadas.map((m)=>m.id).join(","));
  if (!await banco.config("consulta_desde")) await banco.definir("consulta_desde", new Date().toISOString());
  let webhooks;
  try {
    webhooks = await ig.assinarWebhooksPagina(pagina.id);
  } catch (e) {
    webhooks = String(e);
  }
  cfgCache = null;
  return {
    conta: `@${conta.username}`,
    ig_account_id: igId,
    pagina: pagina.name,
    instagram_da_pagina: pagina.instagram_business_account?.username ?? "(não informado)",
    posts_encontrados: achadas.map((m)=>m.permalink),
    aviso: achadas.length ? undefined : "Nenhum post encontrado: confira POST_SHORTCODES (o fluxo responderia em TODOS os posts).",
    assinatura_webhooks_pagina: webhooks
  };
}
async function status() {
  const cfg = await config();
  const { count: sessoes } = await sb.from("direct_fluxo_diagnostico").select("*", {
    count: "exact",
    head: true
  });
  const { data: erros } = await sb.from("ig_logs").select("criado_em,msg,dados").eq("nivel", "erro").order("criado_em", {
    ascending: false
  }).limit(10);
  return {
    modo: modo(),
    fluxo: cfg.fluxo,
    conta: await banco.config("ig_username"),
    ig_account_id: cfg.igAccountId || "(rode ?job=setup)",
    posts: cfg.mediaIds,
    pagina_id: await banco.config("page_id"),
    sessoes,
    ultimos_erros: erros
  };
}
const ORIGENS = [
  "https://portal.demandhub.com.br"
];
function cors(req) {
  const o = req.headers.get("origin") ?? "";
  return {
    "access-control-allow-origin": ORIGENS.includes(o) ? o : ORIGENS[0],
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "vary": "origin"
  };
}
/** Confere o login do portal (mesmo Supabase) e se a pessoa é gestora (não colaboradora). */ async function gestor(req) {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data, error } = await sb.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: perfil } = await sb.from("perfis").select("papel, ativo").eq("id", data.user.id).maybeSingle();
  if (!perfil || perfil.ativo === false || perfil.papel === "colaborador") return null;
  return data.user.id;
}
async function api(req, url, rota) {
  const h = {
    ...cors(req),
    "content-type": "application/json; charset=utf-8"
  };
  const usuario = await gestor(req);
  if (!usuario) return new Response(JSON.stringify({
    erro: "sem permissão"
  }), {
    status: 401,
    headers: h
  });
  if (rota === "painel") {
    const dias = Number(url.searchParams.get("dias") ?? 30);
    const { data, error } = await sb.rpc("ig_painel_dados", {
      p_dias: dias
    });
    if (error) return new Response(JSON.stringify({
      erro: error.message
    }), {
      status: 500,
      headers: h
    });
    return new Response(JSON.stringify(data), {
      headers: h
    });
  }
  if (rota === "midias") {
    const { igId } = await ids();
    const r = await ig.chamar("GET", `/${igId}/media`, {
      query: {
        fields: "id,caption,permalink,timestamp,media_type,thumbnail_url,media_url",
        limit: "30"
      }
    });
    const midias = (r.data ?? []).map((md)=>({
        id: md.id,
        legenda: (md.caption ?? "").slice(0, 140),
        link: md.permalink,
        data: md.timestamp,
        tipo: md.media_type,
        imagem: md.thumbnail_url ?? md.media_url ?? null
      }));
    return new Response(JSON.stringify({
      midias
    }), {
      headers: h
    });
  }
  if (rota === "gatilhos_recarregar" && req.method === "POST") {
    cfgCache = null;
    return new Response(JSON.stringify({
      ok: true
    }), {
      headers: h
    });
  }
  if (rota === "acao" && req.method === "POST") {
    const b = await req.json().catch(()=>({}));
    const { error } = await sb.rpc("ig_painel_acao", {
      p_acao: String(b.acao ?? ""),
      p_valor: b.valor == null ? null : String(b.valor),
      p_usuario: usuario
    });
    if (error) return new Response(JSON.stringify({
      erro: error.message
    }), {
      status: 400,
      headers: h
    });
    cfgCache = null;
    return new Response(JSON.stringify({
      ok: true
    }), {
      headers: h
    });
  }
  return new Response(JSON.stringify({
    erro: "rota desconhecida"
  }), {
    status: 404,
    headers: h
  });
}
Deno.serve(async (req)=>{
  const url = new URL(req.url);
  const job = url.searchParams.get("job");
  const rotaApi = url.searchParams.get("api");
  if (rotaApi) {
    if (req.method === "OPTIONS") return new Response(null, {
      status: 204,
      headers: cors(req)
    });
    try {
      return await api(req, url, rotaApi);
    } catch (e) {
      return new Response(JSON.stringify({
        erro: String(e)
      }), {
        status: 500,
        headers: {
          ...cors(req),
          "content-type": "application/json"
        }
      });
    }
  }
  try {
    if (job) {
      const enviado = req.headers.get("x-cron-secret") ?? "";
      const validos = [
        env("CRON_SECRET"),
        await banco.config("cron_secret") ?? ""
      ].filter((v)=>v.length >= 16);
      if (!enviado || !validos.includes(enviado)) {
        return json({
          erro: "não autorizado"
        }, 401);
      }
      if (job === "tick") return json(await tick());
      if (job === "setup") return json(await setup());
      if (job === "status") return json(await status());
      return json({
        erro: "job desconhecido"
      }, 400);
    }
    if (req.method === "GET") {
      const ok = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === env("IG_VERIFY_TOKEN");
      return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("proibido", {
        status: 403
      });
    }
    if (req.method === "POST") {
      const corpo = await req.text();
      if (!await assinaturaValida(corpo, req.headers.get("x-hub-signature-256"), env("IG_APP_SECRET"))) {
        await banco.log("erro", "webhook com assinatura inválida");
        return new Response("assinatura inválida", {
          status: 401
        });
      }
      const cfg = await config();
      if (modo() !== "webhook") return new Response("ok"); // no modo consulta o tick faz o trabalho
      const { comentarios, mensagens } = lerNotificacao(JSON.parse(corpo), new Date().toISOString());
      const m = await motor();
      for (const c of comentarios)await m.comentario(c);
      for (const ev of mensagens){
        if (ev.deId !== cfg.igAccountId) await m.mensagem(ev);
      }
      return new Response("ok");
    }
    return new Response("método não suportado", {
      status: 405
    });
  } catch (e) {
    await banco.log("erro", "requisição", {
      job,
      erro: String(e)
    }).catch(()=>{});
    return job ? json({
      erro: String(e)
    }, 500) : new Response("ok");
  }
});
