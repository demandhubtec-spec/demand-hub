import { continueRender, delayRender, staticFile } from "remotion";

const carregadas = new Set<string>();
const cdn = (familia: string, peso: number) => `https://cdn.jsdelivr.net/npm/@fontsource/${familia}@5/files/${familia}-latin-${peso}-normal.woff2`;
/** Anton e Inter vão junto no pacote (não dependem da internet). */
const local = (familia: "anton" | "inter", peso: number) => staticFile(`fontes/${familia}-latin-${familia === "anton" ? 400 : peso}-normal.woff2`);

/** Baixa a primeira fonte que existir na lista de endereços. Nunca derruba a peça: no pior caso fica a padrão. */
async function primeiraQueExiste(urls: string[]): Promise<ArrayBuffer | null> {
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) return await r.arrayBuffer();
    } catch {
      /* tenta a próxima */
    }
  }
  return null;
}

/**
 * Carrega as fontes da marca (Fontsource). Se a fonte da marca não tiver o peso pedido, tenta os pesos vizinhos
 * e, por último, Anton (títulos) e Inter (textos), que vão no pacote. O Remotion espera antes de fotografar.
 */
export function carregarFontes(titulo: string, texto: string) {
  const pedidos: [string, string, number[], "anton" | "inter", number][] = [
    ["Titulo", titulo, [800, 700, 900, 600, 400], "anton", 400],
    ["Texto", texto, [400, 500], "inter", 400],
    ["Texto", texto, [600, 700, 500], "inter", 600],
    ["Texto", texto, [700, 800, 600], "inter", 700],
    ["Texto", texto, [800, 700, 900], "inter", 800],
  ];
  for (const [nome, familia, pesos, padrao, peso] of pedidos) {
    const chave = `${nome}-${familia}-${peso}`;
    if (carregadas.has(chave)) continue;
    carregadas.add(chave);
    const urls = familia === padrao ? [local(padrao, peso)] : [...pesos.map((p) => cdn(familia, p)), local(padrao, peso)];
    const espera = delayRender(`fonte ${chave}`);
    primeiraQueExiste(urls)
      .then(async (dados) => {
        if (!dados) return;
        const f = new FontFace(nome, dados, { weight: String(nome === "Titulo" ? 400 : peso) });
        await f.load();
        document.fonts.add(f);
      })
      .catch(() => null)
      .finally(() => continueRender(espera));
  }
}
