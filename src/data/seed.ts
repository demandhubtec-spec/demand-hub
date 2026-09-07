// Conteúdo estático de apoio (não é dado de negócio — cliente/projeto/atividade/
// financeiro vêm sempre do Supabase, ver src/hooks/*). Isso aqui é só texto de
// UI para páginas que ainda não têm fonte de dados própria (CRM/SDR, acessos,
// FAQ e processos).

export const acessosSeed = [
  { usuario: "Kelvin", papel: "Dono", empresas: "DemandHub, Sentiari Music, K19 Barbearia", financeiro: true, status: "ativo" as const },
  { usuario: "Matheus", papel: "Dono", empresas: "DemandHub", financeiro: true, status: "ativo" as const },
  { usuario: "Fabrício", papel: "Colaborador", empresas: "DemandHub", financeiro: false, status: "ativo" as const },
];

export const kanbanCrm = [
  { titulo: "Prospecção", cards: [] as { nome: string; meta: string; valor: string }[] },
  { titulo: "Proposta enviada", cards: [] as { nome: string; meta: string; valor: string }[] },
  { titulo: "Negociação", cards: [] as { nome: string; meta: string; valor: string }[] },
  { titulo: "Fechado", cards: [] as { nome: string; meta: string; valor: string }[] },
];

export const faqSeed = [
  { pergunta: "Como eu adiciono um novo cliente?", resposta: 'Vá em Comercial → Clientes e clique em "Novo cliente". Preencha nome, segmento, status e o projeto inicial — o cliente e o primeiro projeto aparecem na hora.' },
  { pergunta: "Como funciona o acesso por empresa?", resposta: "Cada usuário só enxerga as empresas liberadas pra ele. Kelvin vê DemandHub, Sentiari Music e K19 Barbearia; os demais veem só o que for autorizado." },
  { pergunta: "Posso mudar o tema do sistema?", resposta: "Sim — o ícone de sol/lua no topo alterna entre modo claro e escuro a qualquer momento." },
  { pergunta: "Como crio uma nova atividade?", resposta: 'Clique em "Nova atividade" no dashboard geral ou dentro de "Minhas atividades" de um departamento. Preencha título, descrição, prazo, prioridade e o responsável.' },
  { pergunta: "Como marco uma atividade como concluída?", resposta: 'Em "Minhas atividades", dentro de cada departamento, é só marcar o checkbox ao lado da tarefa — o status é salvo na hora.' },
];

export const processosSeed = [
  { titulo: "Diagnóstico", desc: "Entender o momento e o principal gargalo do cliente ou da empresa." },
  { titulo: "Proposta", desc: "Definir escopo, prioridades e o que entra em cada fase." },
  { titulo: "Kickoff", desc: "Alinhar expectativas e abrir o projeto no Demand Hub." },
  { titulo: "Execução", desc: "Atividades distribuídas por departamento, acompanhadas no Dashboard." },
  { titulo: "Entrega", desc: "Validação com o cliente e encerramento (ou renovação) do contrato." },
];
