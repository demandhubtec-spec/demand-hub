import type { Departamento } from "@/lib/types";

export interface DepartamentoInfo {
  nome: string;
  resumo: string;
}

/** Nome/descrição de cada departamento — texto de UI, não dado de negócio. */
export const departamentoInfo: Record<Departamento, DepartamentoInfo> = {
  tecnologia: {
    nome: "Tecnologia",
    resumo: "Times de desenvolvimento e produtos internos.",
  },
  marketing: {
    nome: "Marketing",
    resumo: "Campanhas, conteúdo e posicionamento de marca.",
  },
  comercial: {
    nome: "Comercial",
    resumo: "Pipeline, propostas e relacionamento com clientes.",
  },
  administrativo: {
    nome: "Administrativo",
    resumo: "Financeiro, contratos e organização interna.",
  },
};

export const departamentoOptions: { value: Departamento; label: string }[] = [
  { value: "tecnologia", label: "Tecnologia" },
  { value: "marketing", label: "Marketing" },
  { value: "comercial", label: "Comercial" },
  { value: "administrativo", label: "Administrativo" },
];
