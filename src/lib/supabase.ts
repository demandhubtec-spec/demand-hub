import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[Demand Hub] Variáveis VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas. " +
      "Copie .env.example para .env e preencha com as chaves do seu projeto Supabase.",
  );
}

// Sem o generic <Database> de propósito: nosso Database "manual" (src/lib/types.ts)
// não replica 100% o formato que o supabase-js v2 espera internamente para os
// overloads de .insert()/.update(), o que gerava falso-erro de TypeScript no
// build (TS2353) mesmo com os campos corretos. As tabelas continuam com os
// tipos (Cliente, Projeto, etc.) aplicados manualmente em cada hook.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
);
