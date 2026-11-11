/** Tipos que o robô do estúdio manda para os modelos (Remotion). */
export type MarcaArte = {
  cores: { fundo: string; fundo2: string; destaque: string; destaque2: string; texto: string };
  fontes: { titulo: string; texto: string };
  logo: string | null;
  logoProporcao: number;
  assinatura: string;
  arroba: string;
};

export type TipoLamina = "capa" | "foto" | "imersiva" | "destaque" | "chamada";

export type PropsLamina = {
  tipo: TipoLamina;
  titulo: string;
  texto?: string;
  numero?: number;
  pagina?: string;
  foto?: string | null;
  palavra?: string | null;
  marca: MarcaArte;
};

/** Uma lâmina do carrossel contínuo (padrão V5). */
export type SlideArte = {
  modelo: "capa" | "cena" | "imersiva" | "chat" | "lista" | "chamada";
  titulo: string;
  texto?: string;
  itens?: string[];
  conversa?: { quem: "cliente" | "ia"; texto: string }[];
  /** Foto da cena, ou a pessoa recortada (PNG sem fundo) na capa e na chamada. */
  foto?: string | null;
  /** Texto do botão que puxa para a próxima lâmina. */
  proximo?: string | null;
};

export type PropsCarrossel = {
  slides: SlideArte[];
  indice: number;
  palavra: string | null;
  marca: MarcaArte;
};

export type CenaVideo = {
  texto: string;
  destaque?: string;
  foto?: string | null;
  /** Narração da cena (link do áudio). */
  voz?: string | null;
  segundos: number;
};

export type PropsReels = {
  cenas: CenaVideo[];
  palavra: string | null;
  marca: MarcaArte;
  /** Trilha de fundo (link), tocando baixinho por baixo da narração. */
  trilha?: string | null;
};

export const MARCA_PADRAO: MarcaArte = {
  cores: { fundo: "#0d0a1a", fundo2: "#1e1145", destaque: "#8b5cf6", destaque2: "#c4b5fd", texto: "#ffffff" },
  fontes: { titulo: "anton", texto: "inter" },
  logo: null,
  logoProporcao: 3,
  assinatura: "A DemandIA trabalha. Você fatura.",
  arroba: "@demand_ia",
};
