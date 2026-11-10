import { LayoutDashboard, Megaphone, Package, TrendingUp, Truck, Wallet, type LucideIcon } from "lucide-react";

/** Áreas (departamentos do portal do cliente) usadas para agrupar as entregas do escopo. */
export interface AreaInfo {
  id: string;
  nome: string;
  desc: string;
  icone: LucideIcon;
}

export const AREAS: AreaInfo[] = [
  { id: "portal", nome: "Portal e visão geral", desc: "A base que todos usam: acesso, menu, integrações, celular e o painel geral.", icone: LayoutDashboard },
  { id: "estoque", nome: "Estoque e compras", desc: "Entrada de mercadoria, cadastro de produtos, estoque e o painel de giro.", icone: Package },
  { id: "comercial", nome: "Comercial", desc: "Preços, painel de vendas, relatório do dia e relacionamento com a base.", icone: TrendingUp },
  { id: "financeiro", nome: "Financeiro", desc: "Contas, taxas, cobrança, conciliação e o painel financeiro.", icone: Wallet },
  { id: "expedicao", nome: "Expedição", desc: "Separação, nota para os Correios, rastreio e avisos da equipe.", icone: Truck },
  { id: "marketing", nome: "Marketing", desc: "Campanhas e relacionamento com a base.", icone: Megaphone },
];

export const OUTRAS: AreaInfo = { id: "outras", nome: "Entregas", desc: "Entregas do escopo.", icone: LayoutDashboard };

export function areaInfo(id: string | null | undefined): AreaInfo {
  return AREAS.find((a) => a.id === id) ?? OUTRAS;
}

/** "Entrega 09.1" quando há rótulo próprio; senão "Entrega 09". */
export function rotuloEntrega(numero: number, rotulo?: string | null) {
  return `Entrega ${rotulo || String(numero).padStart(2, "0")}`;
}

/** Atividade que depende de uma conversa com o cliente para definir o que construir. */
export function ehDefinicao(titulo: string) {
  return /^definir com /i.test(titulo.trim());
}
