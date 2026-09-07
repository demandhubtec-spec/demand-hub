import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import DepartmentVisao from "@/pages/department/DepartmentVisao";
import DepartmentProjetos from "@/pages/department/DepartmentProjetos";
import DepartmentAtividades from "@/pages/department/DepartmentAtividades";
import Crm from "@/pages/comercial/Crm";
import Sdr from "@/pages/comercial/Sdr";
import Clientes from "@/pages/comercial/Clientes";
import Financas from "@/pages/administrativo/Financas";
import Contratos from "@/pages/administrativo/Contratos";
import Acessos from "@/pages/config/Acessos";
import Faq from "@/pages/Faq";
import Processos from "@/pages/Processos";
import Ajuda from "@/pages/Ajuda";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />

          <Route path=":dept/visao" element={<DepartmentVisao />} />
          <Route path=":dept/projetos" element={<DepartmentProjetos />} />
          <Route path=":dept/atividades" element={<DepartmentAtividades />} />

          <Route path="comercial/crm" element={<Crm />} />
          <Route path="comercial/sdr" element={<Sdr />} />
          <Route path="comercial/clientes" element={<Clientes />} />

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
