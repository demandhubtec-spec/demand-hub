// Tipos gerados manualmente a partir do schema em supabase/migrations/0001_init.sql.
// Quando o CLI do Supabase estiver configurado, troque por:
//   npx supabase gen types typescript --project-id <id> > src/lib/types.ts

export type Departamento = "tecnologia" | "marketing" | "comercial";
export type Papel = "dono" | "colaborador";
export type ClienteStatus = "ativo" | "pausado" | "prospeccao";
export type ProjetoStatus = "andamento" | "concluido" | "atrasado";
export type AtividadeStatus = "a-fazer" | "andamento" | "atrasado" | "concluido";
export type LancamentoTipo = "entrada" | "saida";
export type ContratoStatus = "ativo" | "pendente" | "encerrado";

export interface Perfil {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  // true apenas para Kelvin: além de "dono", enxerga também clientes com clientes.privado = true
  // (Sentiari Music, K19 Barbearia). Matheus é "dono" mas fica com acesso_privado = false.
  acesso_privado: boolean;
}

export interface Cliente {
  id: string;
  nome: string;
  segmento: string | null;
  status: ClienteStatus;
  privado: boolean;
  criado_em: string;
}

export interface Projeto {
  id: string;
  cliente_id: string | null;
  nome: string;
  departamento: Departamento;
  status: ProjetoStatus;
  progresso: number;
  prazo: string | null;
}

export interface Atividade {
  id: string;
  projeto_id: string | null;
  titulo: string;
  responsavel_id: string | null;
  departamento: Departamento | null;
  prazo: string | null;
  status: AtividadeStatus;
}

export interface FinanceiroLancamento {
  id: string;
  cliente_id: string | null;
  descricao: string | null;
  categoria: string | null;
  tipo: LancamentoTipo;
  valor: number;
  data: string;
}

export interface Contrato {
  id: string;
  cliente_id: string | null;
  tipo: string | null;
  inicio: string | null;
  renovacao: string | null;
  status: ContratoStatus;
}

// Formato mínimo esperado pelo cliente Supabase tipado.
export interface Database {
  public: {
    Tables: {
      perfis: { Row: Perfil; Insert: Partial<Perfil>; Update: Partial<Perfil> };
      clientes: { Row: Cliente; Insert: Partial<Cliente>; Update: Partial<Cliente> };
      projetos: { Row: Projeto; Insert: Partial<Projeto>; Update: Partial<Projeto> };
      atividades: { Row: Atividade; Insert: Partial<Atividade>; Update: Partial<Atividade> };
      financeiro_lancamentos: {
        Row: FinanceiroLancamento;
        Insert: Partial<FinanceiroLancamento>;
        Update: Partial<FinanceiroLancamento>;
      };
      contratos: { Row: Contrato; Insert: Partial<Contrato>; Update: Partial<Contrato> };
    };
  };
}
