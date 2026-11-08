import { Navigate, useSearchParams } from "react-router-dom";
import { ABA_ANTIGA } from "./TimeComercial";

/** O CRM agora vive dentro do Time Comercial IA: o endereço antigo leva para a aba equivalente. */
export default function Crm() {
  const [params] = useSearchParams();
  const aba = ABA_ANTIGA[params.get("aba") ?? ""] ?? "funil";
  const lead = params.get("lead");
  return <Navigate to={`/comercial/time?aba=${aba}${lead ? `&lead=${encodeURIComponent(lead)}` : ""}`} replace />;
}
