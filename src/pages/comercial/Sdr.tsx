import { Navigate } from "react-router-dom";

/** O SDR IA virou a aba "Conversas" do CRM, com as conversas reais da Ana. */
export default function Sdr() {
  return <Navigate to="/comercial/crm?aba=conversas" replace />;
}
