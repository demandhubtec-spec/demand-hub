/**
 * Regras de negócio da IA SDR da DemandIA.
 * Tudo que o Kelvin pode querer ajustar sem mexer no código fica aqui.
 * Horários sempre no fuso de Brasília (UTC-3, sem horário de verão desde 2019).
 */

export type Window = [start: string, end: string]; // "HH:MM"

export const SDR_CONFIG = {
  empresa: {
    nome: "DemandIA",
    responsavel: "Kelvin", // uso interno: nunca aparece para o lead
    /** Como a Ana se refere a quem faz o diagnóstico (nunca pelo nome). */
    especialista: "um dos nossos especialistas em presença digital",
    pilares: ["Marketing", "Vendas", "Tecnologia"],
  },

  /** Nome que a IA usa ao se apresentar. */
  nomeAssistente: "Ana",
  /** Cargo que aparece na assinatura de e-mail. */
  cargoAssistente: "Consultora estratégica de negócios",
  /** WhatsApp da Ana (o número da instância que envia as mensagens). */
  whatsapp: { numero: "5519988259883", exibicao: "(19) 98825-9883" },

  /** Qualificação BANT */
  qualificacao: {
    faturamentoMinimoMensal: 30_000, // B — Budget
    exigeDecisorNaReuniao: true, // A — Authority
    // N — Need: dores que a DemandIA resolve
    dores: [
      "marketing ineficiente / quer melhorar o marketing",
      "quer mais leads e mais demanda",
      "quer automatizar processos",
      "quer colocar IA para rodar (atendimento, SDR, etc.)",
      "quer implementar um sistema / software",
      "site ou landing page",
    ],
    // T — Timing: prazos que contam como "no time"
    prazosAceitos: ["imediato", "ate_3_meses"] as const,
  },

  /** Agenda do Kelvin para reuniões */
  reuniao: {
    duracaoMin: 40,
    intervaloEntreReunioesMin: 0,
    antecedenciaMinimaHoras: 3, // não oferecer horário muito em cima
    diasAFrente: 7, // até quantos dias à frente oferecer horários
    maxOpcoesOferecidas: 3,
    // 0=domingo ... 6=sábado
    janelas: {
      1: [["18:30", "20:30"]],
      2: [["18:30", "20:30"]],
      3: [["18:30", "20:30"]],
      4: [["18:30", "20:30"]],
      5: [["18:30", "20:30"]],
      6: [["09:00", "12:00"], ["13:00", "14:00"]], // sábado, sem o almoço
    } as Record<number, Window[]>,
    tituloEvento: "Diagnóstico DemandIA",
  },

  /** Follow-up com leads que pararam de responder */
  followUp: {
    maxTentativas: 12,
    intervalosDias: [1, 3, 7], // vai intercalando: 1, 3, 7, 1, 3, 7...
    diasUteis: [1, 2, 3, 4, 5],
    janela: ["08:00", "18:00"] as Window,
    // Feriados nacionais fixos (MM-DD). Feriados móveis (Carnaval, Sexta-feira
    // Santa, Corpus Christi) vão em feriadosExtras como "YYYY-MM-DD".
    feriadosFixos: ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"],
    feriadosExtras: ["2027-02-08", "2027-02-09", "2027-03-26", "2027-05-27"] as string[],
  },

  /** Lembretes da reunião (não contam como follow-up) */
  lembretes: {
    // Confirmação: se a reunião é à tarde/noite, manda às 09:00 do mesmo dia;
    // se é de manhã, manda às 17:00 do dia anterior.
    confirmacaoMesmoDiaHora: "09:00",
    confirmacaoDiaAnteriorHora: "17:00",
    lembreteAntesMin: 60,
  },

  /** Agrupa mensagens seguidas do lead antes de responder */
  debounceMs: 8_000,
};

export type Prazo = "imediato" | "ate_3_meses" | "3_a_6_meses" | "sem_previsao";
export type Autoridade = "decisor" | "decisor_vai_participar" | "sem_decisor";
