import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/lib/types";

interface AuthContextValue {
  session: Session | null;
  perfil: Perfil | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Colaborador (ex: Fabrício) só enxerga projetos, atividades e o dashboard geral. */
  isColaborador: boolean;
  /** Apenas Kelvin: também enxerga clientes marcados como privado (Sentiari Music, K19 Barbearia). */
  hasPrivateAccess: boolean;
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null>(null);
  const [perfil, setPerfil] = React.useState<Perfil | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!session?.user) {
      setPerfil(null);
      return;
    }
    supabase
      .from("perfis")
      .select("*")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error }) => {
        if (!error && data) setPerfil(data as Perfil);
      });
  }, [session]);

  const signInWithPassword = React.useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = React.useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value: AuthContextValue = {
    session,
    perfil,
    loading,
    signInWithPassword,
    signOut,
    isColaborador: perfil?.papel === "colaborador",
    hasPrivateAccess: perfil?.acesso_privado === true,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
