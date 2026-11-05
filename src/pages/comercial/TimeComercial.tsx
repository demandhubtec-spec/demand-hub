import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

/**
 * Comercial · Time comercial: a Central do Time de Vendas aprovada pelo Kelvin em 04/11/2026,
 * rodando como está (public/central-comercial.html, com as fotos dos agentes). Só o dono acessa.
 */
export default function TimeComercial() {
  const { isColaborador } = useAuth();
  if (isColaborador) return <Navigate to="/" replace />;
  return (
    <iframe
      src="/central-comercial.html"
      title="Central do Time Comercial"
      className="block w-full rounded-[14px] border-0"
      style={{ height: "calc(100vh - 110px)", minHeight: 640 }}
    />
  );
}
