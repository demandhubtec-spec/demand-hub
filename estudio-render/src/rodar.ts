/**
 * Estúdio de produção da DemandIA (roda no GitHub Actions de 30 em 30 minutos, sem limite de tempo da Vercel).
 * É a mesma Duda (Diretor de arte) do sistema: pega as copies aprovadas, aplica os ajustes pedidos, gera as fotos
 * no ChatGPT e monta a peça. A diferença é o acabamento: lâminas e reels saem pelo Remotion (modelos em src/remotion).
 *
 * Precisa de SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e OPENAI_API_KEY (secrets do repositório).
 */
import { lerConfig, rodarDiretor, type Renderizador } from "../../ia-sdr/src/lib/estudio/agentes.ts";
import type { CopyCarrossel, CopyReels, Marca } from "../../ia-sdr/src/lib/estudio/ia.ts";
import { duracaoDaCena } from "../../ia-sdr/src/lib/estudio/video-args.ts";
import { renderLamina, renderReels } from "./render.ts";
import { modelosDasLaminas } from "../../ia-sdr/src/lib/estudio/fotos.ts";
import { narrar } from "./voz.ts";
import { MARCA_PADRAO, type MarcaArte, type PropsLamina } from "./remotion/tipos.ts";

const hex = (c: string | undefined) => (c && /^#[0-9a-f]{3,8}$/i.test(c.trim()) ? c.trim() : undefined);
/** "Montserrat Bold" → "montserrat" (nome no Fontsource). */
const familia = (f: string | undefined) =>
  (f ?? "").toLowerCase().replace(/\b(regular|bold|black|light|medium|semibold|extrabold|italic|\d{3})\b/g, "").trim().replace(/\s+/g, "-");

/** Manual de marca do portal → marca dos modelos. */
export function marcaDaArte(m: Marca | null | undefined): MarcaArte {
  const p = MARCA_PADRAO;
  return {
    cores: {
      fundo: hex(m?.cores?.fundo) ?? p.cores.fundo,
      fundo2: hex(m?.cores?.fundo2) ?? p.cores.fundo2,
      destaque: hex(m?.cores?.destaque) ?? p.cores.destaque,
      destaque2: hex(m?.cores?.destaque2) ?? p.cores.destaque2,
      texto: hex(m?.cores?.texto) ?? p.cores.texto,
    },
    fontes: { titulo: familia(m?.fontes?.titulo) || "anton", texto: familia(m?.fontes?.texto) || "inter" },
    logo: m?.logo_url?.trim() || null,
    logoProporcao: m?.logo_proporcao && m.logo_proporcao > 0.2 && m.logo_proporcao < 12 ? m.logo_proporcao : 3,
    assinatura: m?.assinatura?.trim() || p.assinatura,
    arroba: p.arroba,
  };
}

/** Uma das trilhas do Manual de marca, sorteada por vídeo (sem trilha cadastrada, sai só com a narração). */
export function sortearTrilha(m: Marca | null | undefined): string | null {
  const lista = (m?.trilhas ?? []).map((t) => t?.trim()).filter((t): t is string => !!t && /^https?:\/\//.test(t));
  return lista.length ? lista[Math.floor(Math.random() * lista.length)] : null;
}

const render: Renderizador = {
  async carrossel(c: CopyCarrossel, palavra, fotos, m) {
    const marca = marcaDaArte(m);
    const slides = (c.slides ?? []).filter((s) => s.titulo).slice(0, 10);
    const tipos = modelosDasLaminas(slides.length, (i) => fotos.has(i));
    const out: Buffer[] = [];
    for (const [i, s] of slides.entries()) {
      const props: PropsLamina = {
        tipo: tipos[i],
        titulo: s.titulo,
        texto: s.texto,
        numero: i,
        pagina: `${i + 1}/${slides.length}`,
        foto: fotos.get(i) ?? null,
        palavra,
        marca,
      };
      out.push(await renderLamina(props));
    }
    return out;
  },
  async reels(c: CopyReels, palavra, fotos, m) {
    const cenas = (c.cenas ?? []).filter((x) => x.texto_tela?.trim()).slice(0, 10);
    if (!cenas.length) throw new Error("roteiro sem cenas");
    // Narração: a fala de cada cena (ou o texto da tela) vira voz; a cena dura pelo menos o tempo da fala
    const lote = Date.now();
    const vozes = await Promise.all(cenas.map((x, i) => narrar(x.fala?.trim() || x.texto_tela, `${lote}-${String(i + 1).padStart(2, "0")}`)));
    if (!vozes.some(Boolean)) console.error("Reels sem narração: a voz da OpenAI não respondeu");
    return renderReels({
      palavra,
      marca: marcaDaArte(m),
      trilha: sortearTrilha(m),
      cenas: cenas.map((x, i) => {
        const fim = i === cenas.length - 1 ? 1.5 : 0.4;
        const voz = vozes[i];
        return {
          texto: x.texto_tela,
          destaque: x.imagem?.trim().slice(0, 12) || undefined,
          foto: fotos.get(i) ?? null,
          voz: voz?.url ?? null,
          segundos: Math.max(duracaoDaCena(x.tempo), voz ? voz.segundos + 0.5 : 0) + fim,
        };
      }),
    });
  },
};

const LIMITE_MINUTOS = Number(process.env.ESTUDIO_MINUTOS ?? 25);

async function main() {
  const inicio = Date.now();
  const cfg = await lerConfig();
  if (!cfg.ativo) {
    console.log("Estúdio desligado no portal");
    return;
  }
  let feitas = 0;
  let vazias = 0;
  // Uma peça por vez, até a fila acabar (duas voltas sem peça) ou o tempo da rodada
  while ((Date.now() - inicio) / 60_000 < LIMITE_MINUTOS && vazias < 2) {
    const r = await rodarDiretor(1, cfg, render);
    feitas += r.feitas;
    vazias = r.feitas ? 0 : vazias + 1;
  }
  console.log(`Estúdio de produção: ${feitas} peça(s) em ${Math.round((Date.now() - inicio) / 1000)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
