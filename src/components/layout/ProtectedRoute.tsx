import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const supabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export function ProtectedRoute() {
  const { session, loading } = useAuth();

  // Sem Supabase configurado ainda (.env não preenchido) o app roda em modo demo,
  // usando os dados de referência (src/data/seed.ts) para não bloquear o desenvolvimento visual.
  if (!supabaseConfigured) return <Outlet />;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted">Carregando…</div>;
  }

  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
