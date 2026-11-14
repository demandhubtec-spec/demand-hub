import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GatilhosInstagram from "./GatilhosInstagram";

/**
 * Marketing · Instagram Direct
 * - Gatilhos: palavra-chave + post → resposta no comentário + mensagem no Direct (tabela ig_gatilhos).
 * - Painel: números do robô (página estática public/painel-instagram.html, que usa a sessão do portal
 *   para chamar a Edge Function bright-respondig-boter). ?embed=1 esconde o cabeçalho repetido.
 * Só gestores: colaborador volta para o dashboard (a API e o banco também recusam).
 */
export default function InstagramDirect() {
  const { isColaborador } = useAuth();
  if (isColaborador) return <Navigate to="/" replace />;

  return (
    <Tabs defaultValue="gatilhos">
      <TabsList>
        <TabsTrigger value="gatilhos">Gatilhos</TabsTrigger>
        <TabsTrigger value="painel">Painel</TabsTrigger>
      </TabsList>
      <TabsContent value="gatilhos">
        <GatilhosInstagram />
      </TabsContent>
      <TabsContent value="painel">
        <iframe
          src="/painel-instagram.html?embed=1"
          title="Instagram · Direct"
          className="block w-full rounded-[8px] border-0"
          style={{ height: "calc(100vh - 190px)", minHeight: 640, background: "transparent" }}
        />
      </TabsContent>
    </Tabs>
  );
}
