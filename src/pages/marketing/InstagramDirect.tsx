import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Painel "Instagram · Direct" (robô de comentários DIAGNÓSTICO → direct → lead).
 * O painel é a página estática public/painel-instagram.html, que usa a sessão
 * do Supabase do próprio portal (mesmo domínio) para chamar a Edge Function
 * bright-respondig-boter. ?embed=1 esconde o cabeçalho repetido.
 * Só gestores: colaborador volta para o dashboard (a API também recusa).
 */
export default function InstagramDirect() {
  const { isColaborador } = useAuth();
  if (isColaborador) return <Navigate to="/" replace />;

  return (
    <iframe
      src="/painel-instagram.html?embed=1"
      title="Instagram · Direct"
      className="block w-full rounded-[9px] border-0"
      style={{ height: "calc(100vh - 140px)", minHeight: 640, background: "transparent" }}
    />
  );
}
