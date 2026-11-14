import { AbasDaPagina } from "@/components/shared/AbasDaPagina";
import Ajuda from "./Ajuda";
import Faq from "./Faq";
import Processos from "./Processos";

/** Ajuda num lugar só: Central de ajuda, Perguntas frequentes e Processos (antes eram 3 itens no menu). */
export default function AjudaCentral() {
  return (
    <AbasDaPagina
      titulo="Ajuda"
      sub="Dúvidas, processos e contato com o suporte."
      abas={[
        { k: "central", label: "Central de ajuda", conteudo: <Ajuda /> },
        { k: "faq", label: "Perguntas frequentes", conteudo: <Faq /> },
        { k: "processos", label: "Processos", conteudo: <Processos /> },
      ]}
    />
  );
}
