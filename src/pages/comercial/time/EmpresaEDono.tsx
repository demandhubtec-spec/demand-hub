import { ExternalLink } from "lucide-react";
import type { OutreachLead } from "@/hooks/useProspeccao";
import { fmtTelefone, linkExterno } from "../prospeccao/shared";

const ETAPA_LEO: Record<string, string> = {
  inicio: "começando",
  busca: "procurando CNPJ e Instagram no Google",
  perfil: "lendo a bio do Instagram",
  dono: "procurando o LinkedIn e o Instagram do dono",
  ok: "ficha completa",
};
const FONTE: Record<string, string> = { google: "Google", whatsapp: "recado do WhatsApp", instagram: "bio do Instagram", site: "site" };

const fmtCnpj = (d: string) => d.replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Ficha do Léo: empresa pela Receita, sócios, dono e onde o site foi encontrado. */
export function EmpresaEDono({ lead }: { lead: OutreachLead }) {
  const etapa = lead.enriquecimento?.etapa;
  const Link = ({ href, children }: { href: string | null | undefined; children: React.ReactNode }) =>
    href ? (
      <a href={linkExterno(href) ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-bright hover:underline">
        {children} <ExternalLink className="h-3 w-3" />
      </a>
    ) : null;
  const linha = (rotulo: string, valor: React.ReactNode) =>
    valor ? (
      <div className="flex gap-2">
        <span className="w-[118px] shrink-0 text-muted">{rotulo}</span>
        <span className="min-w-0">{valor}</span>
      </div>
    ) : null;

  return (
    <div className="mb-4 rounded-md border border-border p-3 text-[12.5px]">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Empresa e dono · Léo</span>
        <span className="ml-auto text-[11px] text-muted">{etapa ? ETAPA_LEO[etapa] ?? etapa : "na fila do Léo"}</span>
      </div>
      <div className="space-y-1">
        {linha("CNPJ", lead.cnpj && `${fmtCnpj(lead.cnpj)}${lead.cnpj_situacao ? ` · ${lead.cnpj_situacao.toLowerCase()}` : ""}`)}
        {linha("Razão social", lead.razao_social)}
        {linha("Atividade", lead.cnae)}
        {linha(
          "Sócios",
          lead.socios?.length ? lead.socios.map((s) => `${s.nome}${s.qualificacao ? ` (${s.qualificacao.toLowerCase()})` : ""}`).join(", ") : null,
        )}
        {linha("Dono", lead.decisor)}
        {linha(
          "Dono nas redes",
          (lead.linkedin_decisor || lead.dono_instagram) && (
            <span className="flex flex-wrap gap-x-3">
              <Link href={lead.linkedin_decisor}>LinkedIn</Link>
              <Link href={lead.dono_instagram}>Instagram</Link>
              <span className="text-muted">confira antes de usar</span>
            </span>
          ),
        )}
        {linha("Contato na Receita", [lead.cnpj_telefone && fmtTelefone(lead.cnpj_telefone), lead.cnpj_email].filter(Boolean).join(" · ") || null)}
        {linha("Site", lead.site_fonte ? `encontrado no ${FONTE[lead.site_fonte] ?? lead.site_fonte}` : etapa === "ok" && !lead.site ? "não tem (conferido no Google, WhatsApp e Instagram)" : null)}
        {linha("LinkedIn da empresa", lead.linkedin_empresa && <Link href={lead.linkedin_empresa}>abrir</Link>)}
        {linha("Recado do WhatsApp", lead.wa_recado)}
      </div>
      {!lead.cnpj && etapa === "ok" && <div className="mt-2 text-muted">CNPJ não encontrado no site, no Instagram nem no Google.</div>}
    </div>
  );
}
