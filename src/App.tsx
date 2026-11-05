import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import DepartmentVisao from "@/pages/department/DepartmentVisao";
import DepartmentProjetos from "@/pages/department/DepartmentProjetos";
import MinhasAtividades from "@/pages/MinhasAtividades";
import Crm from "@/pages/comercial/Crm";
import Sdr from "@/pages/comercial/Sdr";
import Prospeccao from "@/pages/comercial/Prospeccao";
import Clientes from "@/pages/comercial/Clientes";
import TimeComercial from "@/pages/comercial/TimeComercial";
import InstagramDirect from "@/pages/marketing/InstagramDirect";
import LandingPage from "@/pages/marketing/LandingPage";
import Estudio from "@/pages/marketing/Estudio";
import Financas from "@/pages/administrativo/Financas";
import Contratos from "@/pages/administrativo/Contratos";
import Acessos from "@/pages/config/Acessos";
import Faq from "@/pages/Faq";
import Processos from "@/pages/Processos";
import Ajuda from "@/pages/Ajuda";
import ProjetosHome from "@/pages/projetos/ProjetosHome";
import ProjetosCliente from "@/pages/projetos/ProjetosCliente";
import Acompanhar from "@/pages/Acompanhar";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Página pública do cliente (sem login): cronograma por link secreto */}
      <Route path="/acompanhar/:token" element={<Acompanhar />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />

          <Route path="minhas-atividades" element={<MinhasAtividades />} />
          <Route path="projetos" element={<ProjetosHome />} />
          <Route path="projetos/:clienteId" element={<ProjetosCliente />} />

          <Route path=":dept/visao" element={<DepartmentVisao />} />
          <Route path=":dept/projetos" element={<DepartmentProjetos />} />
          <Route path=":dept/atividades" element={<MinhasAtividades />} />

          <Route path="marketing/instagram-direct" element={<InstagramDirect />} />
          <Route path="marketing/landing-page" element={<LandingPage />} />
          <Route path="marketing/estudio" element={<Estudio />} />

          <Route path="comercial/crm" element={<Crm />} />
          <Route path="comercial/sdr" element={<Sdr />} />
          <Route path="comercial/prospeccao" element={<Prospeccao />} />
          <Route path="prospeccao" element={<Navigate to="/comercial/prospeccao" replace />} />
          <Route path="comercial/clientes" element={<Clientes />} />
          <Route path="comercial/time" element={<TimeComercial />} />

          <Route path="administrativo/financas" element={<Financas />} />
          <Route path="administrativo/contratos" element={<Contratos />} />

          <Route path="configuracoes/acessos" element={<Acessos />} />

          <Route path="faq" element={<Faq />} />
          <Route path="processos" element={<Processos />} />
          <Route path="ajuda" element={<Ajuda />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
