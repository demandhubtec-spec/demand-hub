/**
 * Ficha do lead no card do funil (21/11/2026, Kelvin): empresa, responsável, telefones, site, endereço,
 * Instagram, cidade e segmento, tudo editável ali mesmo.
 */
import * as React from "react";
import { Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";
import type { Contato } from "@/hooks/useCrm";
import { type OutreachLead, useUpdateLead } from "@/hooks/useProspeccao";
import { type ListaLead, useAtualizarListaLead } from "@/hooks/useComercial";

type Reg = { tipo: "google"; lead: OutreachLead } | { tipo: "lista"; lead: ListaLead } | { tipo: "inbound"; contato: Contato };
type Campo = { k: string; rotulo: string; valor: string | null; editavel?: boolean; link?: "tel" | "url" | "ig" };

function camposDe(r: Reg): Campo[] {
  if (r.tipo === "google") {
    const l = r.lead;
    return [
      { k: "empresa", rotulo: "Empresa", valor: l.empresa },
      { k: "decisor", rotulo: "Responsável / dono", valor: l.decisor },
      { k: "cargo_decisor", rotulo: "Cargo", valor: l.cargo_decisor },
      { k: "whatsapp", rotulo: "WhatsApp", valor: l.whatsapp, link: "tel" },
      { k: "telefone", rotulo: "Telefone", valor: l.telefone, link: "tel" },
      { k: "email", rotulo: "E-mail", valor: l.email },
      { k: "site", rotulo: "Site", valor: l.site, link: "url" },
      { k: "instagram", rotulo: "Instagram", valor: l.instagram, link: "ig" },
      { k: "endereco", rotulo: "Endereço", valor: l.endereco },
      { k: "cidade", rotulo: "Cidade", valor: l.cidade },
      { k: "nicho", rotulo: "Segmento", valor: l.nicho },
    ];
  }
  if (r.tipo === "lista") {
    const l = r.lead;
    return [
      { k: "empresa", rotulo: "Empresa", valor: l.empresa },
      { k: "perfil", rotulo: "Responsável / dono", valor: l.perfil },
      { k: "whatsapp", rotulo: "WhatsApp / telefone", valor: l.whatsapp, link: "tel" },
      { k: "email", rotulo: "E-mail", valor: l.email },
      { k: "perfil_url", rotulo: "Instagram / site", valor: l.perfil_url, link: "url" },
      { k: "cidade", rotulo: "Cidade", valor: l.cidade },
      { k: "nicho", rotulo: "Segmento", valor: l.nicho },
    ];
  }
  const c = r.contato;
  return [
    { k: "empresa", rotulo: "Empresa", valor: c.empresa },
    { k: "nome", rotulo: "Responsável / dono", valor: c.nome },
    { k: "phone", rotulo: "WhatsApp", valor: c.phone, editavel: false, link: "tel" },
    { k: "email", rotulo: "E-mail", valor: c.email },
    { k: "segmento", rotulo: "Segmento", valor: c.segmento },
  ];
}

function Valor({ c }: { c: Campo }) {
  if (!c.valor) return <span className="text-muted">—</span>;
  if (c.link === "url") {
    const href = /^https?:\/\//.test(c.valor) ? c.valor : `https://${c.valor}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        {c.valor}
      </a>
    );
  }
  if (c.link === "ig") {
    const h = c.valor.replace(/^.*instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
    return (
      <a href={`https://instagram.com/${h}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
        @{h}
      </a>
    );
  }
  if (c.link === "tel") return <a href={`tel:+${c.valor.replace(/\D/g, "")}`} className="hover:underline">{c.valor}</a>;
  return <>{c.valor}</>;
}

export function FichaDados({ reg, extras }: { reg: Reg; extras: [string, React.ReactNode][] }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const updateLead = useUpdateLead();
  const atualizarLista = useAtualizarListaLead();
  const atualizarContato = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, string | null> }) => {
      const { error } = await supabase.from("sdr_leads").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm"] }),
  });
  const campos = camposDe(reg);
  const [editando, setEditando] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (editando) setForm(Object.fromEntries(campos.map((c) => [c.k, c.valor ?? ""])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  function salvar() {
    const patch: Record<string, string | null> = {};
    for (const c of campos) {
      if (c.editavel === false) continue;
      const v = (form[c.k] ?? "").trim();
      if (v !== (c.valor ?? "")) patch[c.k] = v || null;
    }
    if (!Object.keys(patch).length) return setEditando(false);
    const ok = { onSuccess: () => (setEditando(false), showToast("Ficha atualizada.")), onError: (e: unknown) => showToast(`Não salvou: ${(e as Error).message}`) };
    if (reg.tipo === "google") updateLead.mutate({ placeId: reg.lead.place_id, patch: patch as Partial<OutreachLead>, descricao: `Ficha: ${reg.lead.empresa}` }, ok);
    else if (reg.tipo === "lista") atualizarLista.mutate({ id: reg.lead.id, patch: patch as Partial<ListaLead> }, ok);
    else atualizarContato.mutate({ id: reg.contato.id, patch }, ok);
  }

  return (
    <div>
      <div className="mb-2 flex items-center">
        <div className="text-[12px] font-semibold text-muted">Ficha do lead</div>
        {!editando && (
          <button onClick={() => setEditando(true)} className="ml-auto inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
      </div>
      <dl className="space-y-2 text-[14px]">
        {campos.map((c) => (
          <div key={c.k} className="grid grid-cols-[150px_1fr] items-center gap-3 border-b border-border/60 pb-2">
            <dt className="text-muted">{c.rotulo}</dt>
            <dd>
              {editando && c.editavel !== false ? (
                <input
                  value={form[c.k] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [c.k]: e.target.value }))}
                  className="h-8 w-full rounded-[6px] border border-border bg-white px-2 text-[14px] outline-none focus:border-primary"
                />
              ) : (
                <Valor c={c} />
              )}
            </dd>
          </div>
        ))}
        {extras
          .filter(([, v]) => v != null && v !== "")
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[150px_1fr] gap-3 border-b border-border/60 pb-2">
              <dt className="text-muted">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {editando && (
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={salvar} disabled={updateLead.isPending || atualizarLista.isPending || atualizarContato.isPending}>
            Salvar ficha
          </Button>
        </div>
      )}
    </div>
  );
}
