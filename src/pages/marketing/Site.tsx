import { AbasDaPagina } from "@/components/shared/AbasDaPagina";
import LandingPage from "./LandingPage";
import Seo from "./Seo";

/** Landing pages e SEO juntos: os dois cuidam do site (antes eram 2 itens no menu). */
export default function Site() {
  return (
    <AbasDaPagina
      titulo="Landing pages e SEO"
      sub="Páginas de captação e o que traz gente do Google para o site."
      abas={[
        { k: "landing", label: "Landing pages", conteudo: <LandingPage /> },
        { k: "seo", label: "SEO e orgânico", conteudo: <Seo /> },
      ]}
    />
  );
}
