import type { Departamento } from "@/lib/types";

export interface NavChild {
  label: string;
  path: string;
  /** Some children (crm, sdr, clientes) são exclusivos de Comercial e ficam fora do acesso de colaborador. */
  colaboradorPode?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  icon: "tecnologia" | "marketing" | "comercial" | "administrativo" | "config";
  children: NavChild[];
  colaboradorPode?: boolean;
}

function deptChildren(dept: Departamento): NavChild[] {
  return [
    { label: "Visão do departamento", path: `/${dept}/visao`, colaboradorPode: true },
    { label: "Projetos", path: `/${dept}/projetos`, colaboradorPode: true },
    { label: "Minhas atividades", path: `/${dept}/atividades`, colaboradorPode: true },
  ];
}

export const navGroups: NavGroup[] = [
  {
    key: "tecnologia",
    label: "Tecnologia",
    icon: "tecnologia",
    colaboradorPode: true,
    children: deptChildren("tecnologia"),
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: "marketing",
    colaboradorPode: true,
    children: deptChildren("marketing"),
  },
  {
    key: "comercial",
    label: "Comercial",
    icon: "comercial",
    colaboradorPode: true,
    children: [
      ...deptChildren("comercial"),
      { label: "CRM", path: "/comercial/crm", colaboradorPode: false },
      { label: "SDR IA", path: "/comercial/sdr", colaboradorPode: false },
      { label: "Clientes", path: "/comercial/clientes", colaboradorPode: false },
    ],
  },
  {
    key: "administrativo",
    label: "Administrativo",
    icon: "administrativo",
    colaboradorPode: false,
    children: [
      { label: "Finanças", path: "/administrativo/financas", colaboradorPode: false },
      { label: "Contratos", path: "/administrativo/contratos", colaboradorPode: false },
    ],
  },
  {
    key: "config",
    label: "Configurações",
    icon: "config",
    colaboradorPode: false,
    children: [{ label: "Acessos e logins", path: "/configuracoes/acessos", colaboradorPode: false }],
  },
];
