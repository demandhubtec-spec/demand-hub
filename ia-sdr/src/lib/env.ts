function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const env = {
  get openaiKey() { return req("OPENAI_API_KEY"); },
  get openaiModel() { return process.env.OPENAI_MODEL || "gpt-5.4-mini"; },
  /** Opcional: "low" | "medium" | "high" (só para modelos de raciocínio) */
  get openaiReasoningEffort() { return process.env.OPENAI_REASONING_EFFORT || ""; },

  get supabaseUrl() { return req("SUPABASE_URL"); },
  get supabaseServiceKey() { return req("SUPABASE_SERVICE_ROLE_KEY"); },

  get evolutionUrl() { return req("EVOLUTION_API_URL").replace(/\/$/, ""); },
  /** Token da instância (não a chave global) — usado no header apikey do /send/text */
  get evolutionInstanceToken() { return req("EVOLUTION_INSTANCE_TOKEN"); },
  /** Nome da instância; se definido, o webhook ignora eventos de outras instâncias */
  get evolutionInstance() { return process.env.EVOLUTION_INSTANCE || ""; },
  get webhookSecret() { return req("WEBHOOK_SECRET"); },

  get googleClientId() { return req("GOOGLE_CLIENT_ID"); },
  get googleClientSecret() { return req("GOOGLE_CLIENT_SECRET"); },
  get googleCalendarId() { return process.env.GOOGLE_CALENDAR_ID || "primary"; },

  get appUrl() { return req("APP_URL").replace(/\/$/, ""); },
  get adminSecret() { return req("ADMIN_SECRET"); },
  get cronSecret() { return req("CRON_SECRET"); },

  /** WhatsApp do Kelvin para receber avisos (handoff, reunião marcada). Só dígitos. */
  get ownerPhone() { return process.env.OWNER_PHONE || ""; },
  /** Web app do Apps Script da planilha de leads (grava a linha e manda o e-mail de aviso) */
  get sheetWebhookUrl() { return process.env.SHEET_WEBHOOK_URL || ""; },
  get sheetWebhookSecret() { return process.env.SHEET_WEBHOOK_SECRET || ""; },
  /** Para onde vai o aviso de cada cadastro da landing page. Se vazio, usa OWNER_PHONE. */
  get alertPhone() { return (process.env.ALERT_PHONE || process.env.OWNER_PHONE || "").replace(/\D/g, ""); },
};
