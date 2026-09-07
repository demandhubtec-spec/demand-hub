// Dados de referência/seed, espelhando o protótipo (demand-hub-prototipo-v3.html).
// Usados como fallback visual enquanto o Supabase não tem dados reais cadastrados —
// os hooks em src/hooks/* tentam o Supabase primeiro e caem aqui se a tabela vier vazia.

import type { Departamento } from "@/lib/types";

export interface DeptKpi {
  label: string;
  value: string;
  delta: string;
  deltaClass: "up" | "warn";
}

export interface DeptProjeto {
  nome: string;
  empresa: string;
  progresso: number;
  status: "andamento" | "concluido" | "atrasado";
  prazo: string;
}

export interface DeptAtividade {
  titulo: string;
  contexto: string;
  prazo: string;
  status: "a-fazer" | "andamento" | "atrasado" | "concluido";
}

export interface DeptData {
  nome: string;
  resumo: string;
  kpis: DeptKpi[];
  projetos: DeptProjeto[];
  atividades: DeptAtividade[];
}

export const deptData: Record<Departamento, DeptData> = {
  tecnologia: {
    nome: "Tecnologia",
    resumo: "Times de desenvolvimento e produtos internos.",
    kpis: [
      { label: "Projetos ativos", value: "4", delta: "+1 este mês", deltaClass: "up" },
      { label: "Tarefas em aberto", value: "18", delta: "6 vencem essa semana", deltaClass: "warn" },
      { label: "Entregas no prazo", value: "92%", delta: "+4% vs. mês anterior", deltaClass: "up" },
    ],
    projetos: [
      { nome: "Reformulação de site", empresa: "Fnx Tabacaria", progresso: 60, status: "andamento", prazo: "20/09" },
      { nome: "Automação de atendimento via WhatsApp", empresa: "Tonabê", progresso: 75, status: "andamento", prazo: "15/09" },
      { nome: "App interno de gestão", empresa: "DemandHub", progresso: 30, status: "andamento", prazo: "05/10" },
      { nome: "Migração de infraestrutura", empresa: "Dos Cria Tabacaria", progresso: 100, status: "concluido", prazo: "22/08" },
    ],
    atividades: [
      { titulo: "Revisar arquitetura do portal", contexto: "DemandHub", prazo: "10/09", status: "andamento" },
      { titulo: "Configurar ambiente de staging", contexto: "DemandHub", prazo: "12/09", status: "a-fazer" },
      { titulo: "Corrigir bug no formulário de contato", contexto: "Tonabê", prazo: "08/09", status: "atrasado" },
      { titulo: "Documentar API interna", contexto: "DemandHub", prazo: "18/09", status: "a-fazer" },
    ],
  },
  marketing: {
    nome: "Marketing",
    resumo: "Campanhas, conteúdo e posicionamento de marca.",
    kpis: [
      { label: "Projetos ativos", value: "3", delta: "estável", deltaClass: "up" },
      { label: "Campanhas no ar", value: "4", delta: "2 empresas próprias", deltaClass: "up" },
      { label: "Leads gerados (mês)", value: "126", delta: "+18% vs. mês anterior", deltaClass: "up" },
    ],
    projetos: [
      { nome: "Tráfego pago — Instagram/Meta Ads", empresa: "Fnx Tabacaria", progresso: 40, status: "andamento", prazo: "30/09" },
      { nome: "Reposicionamento de marca", empresa: "Sentiari Music", progresso: 20, status: "andamento", prazo: "15/10" },
      { nome: "Campanha de lançamento", empresa: "K19 Barbearia", progresso: 80, status: "andamento", prazo: "12/09" },
    ],
    atividades: [
      { titulo: "Criar criativos para Meta Ads", contexto: "Fnx Tabacaria", prazo: "14/09", status: "andamento" },
      { titulo: "Planejar calendário de conteúdo", contexto: "Sentiari Music", prazo: "09/09", status: "a-fazer" },
      { titulo: "Revisar copy da campanha", contexto: "K19 Barbearia", prazo: "11/09", status: "andamento" },
    ],
  },
  comercial: {
    nome: "Comercial",
    resumo: "Pipeline, propostas e relacionamento com clientes.",
    kpis: [
      { label: "Oportunidades abertas", value: "2", delta: "no funil", deltaClass: "up" },
      { label: "Taxa de conversão", value: "34%", delta: "+3% vs. mês anterior", deltaClass: "up" },
      { label: "Ticket médio", value: "R$ 3.100", delta: "por cliente/mês", deltaClass: "up" },
    ],
    projetos: [
      { nome: "Diagnóstico estratégico", empresa: "Dos Cria Tabacaria", progresso: 100, status: "concluido", prazo: "25/08" },
      { nome: "Landing page de captação", empresa: "Tonabê", progresso: 25, status: "andamento", prazo: "10/10" },
      { nome: "Proposta comercial", empresa: "Fnx Tabacaria", progresso: 50, status: "andamento", prazo: "11/09" },
    ],
    atividades: [
      { titulo: "Preparar proposta comercial", contexto: "Fnx Tabacaria", prazo: "11/09", status: "a-fazer" },
      { titulo: "Follow-up pós-reunião", contexto: "Tonabê", prazo: "09/09", status: "andamento" },
      { titulo: "Enviar contrato", contexto: "Dos Cria Tabacaria", prazo: "13/09", status: "a-fazer" },
    ],
  },
};

export interface ClienteSeed {
  nome: string;
  segmento: string;
  status: "ativo" | "pausado" | "prospeccao";
  projetos: number;
  ultima: string;
  privado: boolean;
}

export const clientesSeed: ClienteSeed[] = [
  { nome: "Fnx Tabacaria", segmento: "Varejo / Tabacaria", status: "ativo", projetos: 1, ultima: "Hoje", privado: false },
  { nome: "Tonabê", segmento: "Logística / E-commerce", status: "ativo", projetos: 1, ultima: "Ontem", privado: false },
  { nome: "Dos Cria Tabacaria", segmento: "Varejo / Tabacaria", status: "ativo", projetos: 1, ultima: "há 2 dias", privado: false },
  { nome: "Sentiari Music", segmento: "Música / Entretenimento", status: "ativo", projetos: 1, ultima: "Hoje", privado: true },
  { nome: "K19 Barbearia", segmento: "Beleza / Estética", status: "ativo", projetos: 1, ultima: "Ontem", privado: true },
];

export const faturamentoMensal = [
  { mes: "ABR", valor: 11200 },
  { mes: "MAI", valor: 13400 },
  { mes: "JUN", valor: 15100 },
  { mes: "JUL", valor: 16800 },
  { mes: "AGO", valor: 18200 },
  { mes: "SET", valor: 19300 },
];

export const fluxoCaixa = [
  { mes: "ABR", entrada: 11200, saida: 3300 },
  { mes: "MAI", entrada: 13400, saida: 2900 },
  { mes: "JUN", entrada: 15100, saida: 3500 },
  { mes: "JUL", entrada: 16800, saida: 2500 },
  { mes: "AGO", entrada: 18200, saida: 2900 },
  { mes: "SET", entrada: 19300, saida: 2370 },
];

export const lancamentosSeed = [
  { data: "05/09", descricao: "Mensalidade — Automação", cliente: "Tonabê", categoria: "Recorrente", tipo: "entrada" as const, valor: 4500 },
  { data: "04/09", descricao: "Mensalidade — Tráfego pago", cliente: "Fnx Tabacaria", categoria: "Recorrente", tipo: "entrada" as const, valor: 2200 },
  { data: "03/09", descricao: "Ferramentas (Meta / Google Ads)", cliente: "—", categoria: "Operacional", tipo: "saida" as const, valor: 1150 },
  { data: "02/09", descricao: "Mensalidade — Consultoria", cliente: "Dos Cria Tabacaria", categoria: "Recorrente", tipo: "entrada" as const, valor: 3800 },
  { data: "01/09", descricao: "Assinatura de software", cliente: "—", categoria: "Operacional", tipo: "saida" as const, valor: 320 },
  { data: "30/08", descricao: "Projeto — Diagnóstico estratégico", cliente: "Dos Cria Tabacaria", categoria: "Pontual", tipo: "entrada" as const, valor: 6000 },
  { data: "29/08", descricao: "Freelancer — Design", cliente: "—", categoria: "Operacional", tipo: "saida" as const, valor: 900 },
  { data: "28/08", descricao: "Mensalidade — Landing page", cliente: "Tonabê", categoria: "Recorrente", tipo: "entrada" as const, valor: 2800 },
];

export const contratosSeed = [
  { cliente: "Fnx Tabacaria", tipo: "Tráfego pago mensal", inicio: "10/08", renovacao: "10/09 (mensal)", status: "ativo" as const },
  { cliente: "Tonabê", tipo: "Automação + suporte", inicio: "15/06", renovacao: "15/06/2027", status: "ativo" as const },
  { cliente: "Dos Cria Tabacaria", tipo: "Consultoria pontual", inicio: "—", renovacao: "—", status: "pendente" as const },
];

export const acessosSeed = [
  { usuario: "Kelvin", papel: "Dono", empresas: "DemandHub, Sentiari Music, K19 Barbearia", financeiro: true, status: "ativo" as const },
  { usuario: "Matheus", papel: "Dono", empresas: "DemandHub", financeiro: true, status: "ativo" as const },
  { usuario: "Fabrício", papel: "Colaborador", empresas: "DemandHub", financeiro: false, status: "ativo" as const },
];

export const kanbanCrm = [
  { titulo: "Prospecção", cards: [] as { nome: string; meta: string; valor: string }[] },
  { titulo: "Proposta enviada", cards: [{ nome: "Fnx Tabacaria", meta: "Pacote crescimento", valor: "R$ 3.200/mês" }] },
  { titulo: "Negociação", cards: [{ nome: "Dos Cria Tabacaria", meta: "Consultoria + tráfego pago", valor: "R$ 2.800/mês" }] },
  { titulo: "Fechado", cards: [{ nome: "Tonabê", meta: "Automação + suporte", valor: "R$ 4.500/mês" }] },
];

export const atividadesRecentes = [
  { atividade: "Configurar fluxo de automação", departamento: "Tecnologia", contexto: "Tonabê", prazo: "13/09", status: "andamento" as const },
  { atividade: "Criar criativos para Meta Ads", departamento: "Marketing", contexto: "Fnx Tabacaria", prazo: "14/09", status: "andamento" as const },
  { atividade: "Corrigir bug no formulário de contato", departamento: "Tecnologia", contexto: "Tonabê", prazo: "08/09", status: "atrasado" as const },
  { atividade: "Follow-up pós-reunião", departamento: "Comercial", contexto: "Tonabê", prazo: "09/09", status: "andamento" as const },
  { atividade: "Migração de infraestrutura", departamento: "Tecnologia", contexto: "Dos Cria Tabacaria", prazo: "22/08", status: "concluido" as const },
];

export const faqSeed = [
  { pergunta: "Como eu adiciono um novo cliente?", resposta: 'Vá em Comercial → Clientes e clique em "Novo cliente". Preencha nome, segmento e status — ele aparece na lista na hora.' },
  { pergunta: "Como funciona o acesso por empresa?", resposta: "Cada usuário só enxerga as empresas liberadas pra ele. Kelvin vê DemandHub, Sentiari Music e K19 Barbearia; os demais veem só o que for autorizado." },
  { pergunta: "Posso mudar o tema do sistema?", resposta: "Sim — o ícone de sol/lua no topo alterna entre modo claro e escuro a qualquer momento." },
  { pergunta: "Como marco uma atividade como concluída?", resposta: 'Em "Minhas atividades", dentro de cada departamento, é só marcar o checkbox ao lado da tarefa.' },
];

export const processosSeed = [
  { titulo: "Diagnóstico", desc: "Entender o momento e o principal gargalo do cliente ou da empresa." },
  { titulo: "Proposta", desc: "Definir escopo, prioridades e o que entra em cada fase." },
  { titulo: "Kickoff", desc: "Alinhar expectativas e abrir o projeto no Demand Hub." },
  { titulo: "Execução", desc: "Atividades distribuídas por departamento, acompanhadas no Dashboard." },
  { titulo: "Entrega", desc: "Validação com o cliente e encerramento (ou renovação) do contrato." },
];
