import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

const carregadas = new Set<string>();
const cdn = (familia: string, peso: number) => `https://cdn.jsdelivr.net/npm/@fontsource/${familia}@5/files/${familia}-latin-${peso}-normal.woff2`;
/** Anton e Inter vão junto no pacote (não dependem da internet); outras fontes da marca vêm do Fontsource. */
const local = (familia: "anton" | "inter", peso: number) => staticFile(`fontes/${familia}-latin-${familia === "anton" ? 400 : peso}-normal.woff2`);

/** Carrega as fontes da marca. O Remotion espera a fonte antes de fotografar o quadro. */
export function carregarFontes(titulo: string, texto: string) {
  const pedidos: [string, string, number, "anton" | "inter"][] = [
    ["Titulo", titulo, titulo === "anton" || titulo === "bebas-neue" ? 400 : 800, "anton"],
    ["Texto", texto, 400, "inter"],
    ["Texto", texto, 600, "inter"],
    ["Texto", texto, 700, "inter"],
    ["Texto", texto, 800, "inter"],
  ];
  for (const [nome, familia, peso, padrao] of pedidos) {
    const chave = `${nome}-${familia}-${peso}`;
    if (carregadas.has(chave)) continue;
    carregadas.add(chave);
    const url = familia === padrao ? local(padrao, peso) : cdn(familia, peso);
    loadFont({ family: nome, url, weight: String(peso) }).catch(() => loadFont({ family: nome, url: local(padrao, peso), weight: String(peso) }).catch(() => null));
  }
}
