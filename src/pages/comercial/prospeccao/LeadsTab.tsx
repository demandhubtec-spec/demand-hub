import * as React from "react";
import { MessageCircle, Pause, Play, Plus, Upload, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TableWrap, Th, Td } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { useToast } from "@/components/ui/toast";
import {
  type OutreachLead,
  detalheTexto,
  useImportLeads,
  useOutreachLeads,
  useOutreachLog,
  useUpdateLead,
} from "@/hooks/useProspeccao";
import { Pill, comercialLabels, fmtData, fmtTelefone, linkExterno, waLabels } from "./shared";

const TODOS = "__todos";

function opcoes(leads: OutreachLead[], campo: keyof OutreachLead) {
  return Array.from(new Set(leads.map((l) => l[campo]).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
}

function ultimaAtividade(l: OutreachLead) {
  return [l.updated_at, l.wa_sent_at, l.email_sent_at, l.created_at].filter(Boolean).sort().pop() ?? null;
}

// ─────────────── CSV ───────────────
function parseCsv(text: string): Record<string, string>[] {
  const sep = (text.split("\n")[0].match(/;/g)?.length ?? 0) > (text.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((v) => v.trim())) rows.push(cur);
      cur = [];
    } else field += c;
  }
  cur.push(field);
  if (cur.some((v) => v.trim())) rows.push(cur);
  const norm = (h: string) =>
    h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const alias: Record<string, string> = {
    nome: "empresa", nome_da_empresa: "empresa", categoria: "nicho", segmento: "nicho",
    linkedin: "linkedin_empresa", cargo: "cargo_decisor", avaliacao: "avaliacoes", num_avaliacoes: "avaliacoes",
    whatsapp_numero: "whatsapp", e_mail: "email", obs: "observacoes", observacao: "observacoes",
  };
  const header = (rows.shift() ?? []).map((h) => alias[norm(h)] ?? norm(h));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

function ImportarCsv() {
  const importar = useImportLeads();
  const { showToast } = useToast();
  const ref = React.useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (!rows.length) return showToast("O arquivo está vazio");
      const r = await importar.mutateAsync(rows);
      showToast(`${r.novos} leads novos · ${r.duplicados} já existiam`);
    } catch (err) {
      showToast(`Não foi possível importar: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      <Button variant="ghost" size="sm" onClick={() => ref.current?.click()} disabled={importar.isPending}>
        <Upload /> {importar.isPending ? "Importando…" : "Importar CSV"}
      </Button>
    </>
  );
}

const CAMPOS_FORM: { key: string; label: string; full?: boolean }[] = [
  { key: "empresa", label: "Empresa *" },
  { key: "nicho", label: "Nicho" },
  { key: "cidade", label: "Cidade" },
  { key: "whatsapp", label: "WhatsApp (com DDD)" },
  { key: "email", label: "E-mail" },
  { key: "decisor", label: "Decisor" },
  { key: "cargo_decisor", label: "Cargo do decisor" },
  { key: "telefone", label: "Telefone fixo" },
  { key: "site", label: "Site" },
  { key: "instagram", label: "Instagram" },
  { key: "cnpj", label: "CNPJ" },
  { key: "porte", label: "Porte (ME/EPP/DEMAIS)" },
  { key: "endereco", label: "Endereço", full: true },
  { key: "observacoes", label: "Observações", full: true },
];

function AdicionarLead() {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>({ prioridade: "Média" });
  const importar = useImportLeads();
  const { showToast } = useToast();

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await importar.mutateAsync([{ ...form, origem: "manual" }]);
      showToast(r.novos ? "Lead adicionado" : "Esse lead já existe (mesmo nome e cidade)");
      if (r.novos) { setOpen(false); setForm({ prioridade: "Média" }); }
    } catch (err) {
      showToast(`Erro: ${(err as Error).message}`);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus /> Adicionar lead</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-[640px] overflow-y-auto">
          <DialogTitle>Adicionar lead</DialogTitle>
          <DialogDescription>Entra na fila se tiver WhatsApp e prioridade Alta ou Média.</DialogDescription>
          <form onSubmit={salvar} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CAMPOS_FORM.map((c) => (
              <div key={c.key} className={c.full ? "sm:col-span-2" : ""}>
                <Label>{c.label}</Label>
                <Input
                  required={c.key === "empresa"}
                  value={form[c.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label>Prioridade</Label>
              <Select value={form.prioridade} onValueChange={(v) => setForm((f) => ({ ...f, prioridade: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Alta", "Média", "Baixa"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end justify-end sm:col-span-2">
              <Button type="submit" disabled={importar.isPending}>Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─────────────── Detalhe do lead ───────────────
function Campo({ label, value, href }: { label: string; value: React.ReactNode; href?: string | null }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 break-words text-[13px]">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-bright hover:underline">
            {value} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (value || "—")}
      </div>
    </div>
  );
}

const EDITAVEIS = ["empresa", "nicho", "cidade", "decisor", "cargo_decisor", "whatsapp", "email", "telefone", "site", "instagram", "linkedin_empresa", "linkedin_decisor", "cnpj", "porte", "endereco", "observacoes"] as const;

function DetalheLead({ lead, onClose }: { lead: OutreachLead; onClose: () => void }) {
  const { data: log = [] } = useOutreachLog(lead.place_id);
  const update = useUpdateLead();
  const { showToast } = useToast();
  const [editando, setEditando] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setForm(Object.fromEntries(EDITAVEIS.map((k) => [k, (lead[k] as string | null) ?? ""])));
  }, [lead]);

  async function salvar() {
    const patch = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    try {
      await update.mutateAsync({ placeId: lead.place_id, patch, descricao: "Dados do lead editados no portal" });
      setEditando(false);
      showToast("Lead atualizado");
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="left-auto right-0 top-0 h-full max-h-none w-full max-w-[520px] translate-x-0 translate-y-0 overflow-y-auto rounded-none">
        <DialogTitle>{lead.empresa}</DialogTitle>
        <DialogDescription>
          {[lead.nicho, lead.cidade, lead.prioridade && `Prioridade ${lead.prioridade}`].filter(Boolean).join(" · ")}
        </DialogDescription>

        <div className="mb-4 flex flex-wrap gap-2">
          <Pill status={lead.wa_status} label={`WhatsApp: ${waLabels[lead.wa_status] ?? lead.wa_status}`} />
          <Pill status={lead.email_status} label={`E-mail: ${waLabels[lead.email_status] ?? lead.email_status}`} />
          <Pill status={lead.status_comercial} />
        </div>

        {editando ? (
          <div className="grid grid-cols-2 gap-3">
            {EDITAVEIS.map((k) => (
              <div key={k} className={k === "endereco" || k === "observacoes" ? "col-span-2" : ""}>
                <Label>{k.replace(/_/g, " ")}</Label>
                {k === "observacoes" ? (
                  <Textarea rows={3} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                ) : (
                  <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                )}
              </div>
            ))}
            <div className="col-span-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
              <Button size="sm" onClick={salvar} disabled={update.isPending}>Salvar</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo label="Decisor" value={[lead.decisor, lead.cargo_decisor].filter(Boolean).join(" · ")} />
              <Campo label="WhatsApp" value={fmtTelefone(lead.whatsapp)} href={lead.whatsapp ? `https://wa.me/${lead.whatsapp}` : null} />
              <Campo label="E-mail" value={lead.email} href={lead.email ? `mailto:${lead.email}` : null} />
              <Campo label="Telefone" value={lead.telefone} />
              <Campo label="Site" value={lead.site} href={linkExterno(lead.site)} />
              <Campo label="Instagram" value={lead.instagram} href={linkExterno(lead.instagram)} />
              <Campo label="LinkedIn empresa" value={lead.linkedin_empresa ? "Abrir" : null} href={linkExterno(lead.linkedin_empresa)} />
              <Campo label="LinkedIn decisor" value={lead.linkedin_decisor ? "Abrir" : null} href={linkExterno(lead.linkedin_decisor)} />
              <Campo label="CNPJ" value={lead.cnpj} />
              <Campo label="Porte" value={lead.porte} />
              <Campo label="Avaliações" value={lead.avaliacoes} />
              <Campo label="Coletado em" value={fmtData(lead.coletado_em ?? lead.created_at, false)} />
              <div className="col-span-2"><Campo label="Endereço" value={lead.endereco} /></div>
              <div className="col-span-2"><Campo label="Observações" value={lead.observacoes} /></div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditando(true)}>Editar dados</Button>
            </div>
          </>
        )}

        <div className="mt-5 space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Mensagem enviada</div>
            <div className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-[13px]">{lead.wa_message || "Ainda não enviada"}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Resposta recebida</div>
            <div className="mt-1 whitespace-pre-wrap rounded-md bg-surface-2 p-3 text-[13px]">{lead.reply_text || "Sem resposta"}</div>
          </div>
          {lead.wa_status === "respondeu" && (
            <a href="/comercial/sdr" className="inline-flex items-center gap-1 text-[12.5px] text-primary-bright hover:underline">
              Ver conversa no SDR IA <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Linha do tempo</div>
          {log.length === 0 && <div className="text-[12.5px] text-muted">Nada registrado ainda.</div>}
          <ul className="space-y-2">
            {log.map((e) => (
              <li key={e.id} className="flex gap-3 text-[12.5px]">
                <span className="w-[86px] shrink-0 font-mono text-[11px] text-muted">{fmtData(e.created_at)}</span>
                <span><b className="font-semibold">{e.event}</b> {detalheTexto(e.detail)}</span>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────── Tabela ───────────────
export function LeadsTab() {
  const { data: leads = [], isLoading, error } = useOutreachLeads();
  const update = useUpdateLead();
  const { showToast } = useToast();
  const [busca, setBusca] = React.useState("");
  const [fStatus, setFStatus] = React.useState(TODOS);
  const [fPrio, setFPrio] = React.useState(TODOS);
  const [fCidade, setFCidade] = React.useState(TODOS);
  const [fNicho, setFNicho] = React.useState(TODOS);
  const [aberto, setAberto] = React.useState<string | null>(null);

  const cidades = opcoes(leads, "cidade");
  const nichos = opcoes(leads, "nicho");

  const filtrados = leads.filter((l) => {
    if (busca && !l.empresa.toLowerCase().includes(busca.toLowerCase())) return false;
    if (fStatus !== TODOS && l.wa_status !== fStatus && l.status_comercial !== fStatus) return false;
    if (fPrio !== TODOS && l.prioridade !== fPrio) return false;
    if (fCidade !== TODOS && l.cidade !== fCidade) return false;
    if (fNicho !== TODOS && l.nicho !== fNicho) return false;
    return true;
  });

  async function acao(l: OutreachLead, patch: Partial<OutreachLead>, msg: string) {
    try {
      await update.mutateAsync({ placeId: l.place_id, patch, descricao: `${msg}: ${l.empresa}` });
      showToast(msg);
    } catch (e) {
      showToast(`Erro: ${(e as Error).message}`);
    }
  }

  const leadAberto = leads.find((l) => l.place_id === aberto);

  function Filtro({ value, onChange, placeholder, items }: { value: string; onChange: (v: string) => void; placeholder: string; items: { v: string; l: string }[] }) {
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-auto min-w-[130px] py-1.5 text-[12.5px]"><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>{placeholder}</SelectItem>
          {items.map((i) => <SelectItem key={i.v} value={i.v}>{i.l}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar empresa…" value={busca} onChange={(e) => setBusca(e.target.value)} className="h-9 max-w-[220px] py-1.5" />
        <Filtro value={fStatus} onChange={setFStatus} placeholder="Todos os status" items={[
          ...Object.entries(waLabels).filter(([k]) => k !== "sem_email").map(([v, l]) => ({ v, l: `WhatsApp: ${l}` })),
          ...Object.entries(comercialLabels).map(([v, l]) => ({ v, l: `Comercial: ${l}` })),
        ]} />
        <Filtro value={fPrio} onChange={setFPrio} placeholder="Prioridade" items={["Alta", "Média", "Baixa"].map((p) => ({ v: p, l: p }))} />
        <Filtro value={fCidade} onChange={setFCidade} placeholder="Cidade" items={cidades.map((c) => ({ v: c, l: c }))} />
        <Filtro value={fNicho} onChange={setFNicho} placeholder="Nicho" items={nichos.map((c) => ({ v: c, l: c }))} />
        <div className="ml-auto flex gap-2">
          <ImportarCsv />
          <AdicionarLead />
        </div>
      </div>

      {error ? (
        <EmptyState>Não foi possível carregar os leads: {(error as Error).message}</EmptyState>
      ) : isLoading ? (
        <EmptyState>Carregando…</EmptyState>
      ) : filtrados.length === 0 ? (
        <EmptyState>Nenhum lead encontrado.</EmptyState>
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th>Empresa</Th>
              <Th>Prioridade</Th>
              <Th>WhatsApp</Th>
              <Th>E-mail</Th>
              <Th>Comercial</Th>
              <Th>Última atividade</Th>
              <Th>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((l) => (
              <tr key={l.place_id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setAberto(l.place_id)}>
                <Td wrap>
                  <div className="font-semibold">{l.empresa}</div>
                  <div className="text-[11.5px] text-muted">
                    {[l.nicho, l.cidade, l.decisor].filter(Boolean).join(" · ")}
                  </div>
                </Td>
                <Td>{l.prioridade ?? "—"}</Td>
                <Td>
                  <Pill status={l.wa_status} />
                  <div className="mt-0.5 font-mono text-[11px] text-muted">{fmtTelefone(l.whatsapp)}</div>
                </Td>
                <Td><Pill status={l.email_status} /></Td>
                <Td>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={l.status_comercial}
                      onValueChange={(v) => acao(l, { status_comercial: v as OutreachLead["status_comercial"] }, `Status comercial: ${comercialLabels[v]}`)}
                    >
                      <SelectTrigger className="h-8 w-[130px] py-1 text-[12px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(comercialLabels).map(([v, lb]) => <SelectItem key={v} value={v}>{lb}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </Td>
                <Td><span className="font-mono text-[11.5px] text-muted">{fmtData(ultimaAtividade(l))}</span></Td>
                <Td>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {l.wa_status === "pendente" ? (
                      <Button variant="icon" size="icon" title="Pausar este lead" onClick={() => acao(l, { wa_status: "ignorado", ...(l.email_status === "pendente" ? { email_status: "ignorado" } : {}) }, "Lead pausado")}>
                        <Pause />
                      </Button>
                    ) : ["ignorado", "erro"].includes(l.wa_status) && l.whatsapp ? (
                      <Button variant="icon" size="icon" title="Colocar de volta na fila" onClick={() => acao(l, { wa_status: "pendente", ...(l.email_status === "ignorado" && l.email ? { email_status: "pendente" } : {}) }, "Lead de volta na fila")}>
                        <Play />
                      </Button>
                    ) : null}
                    {l.whatsapp && (
                      <Button variant="icon" size="icon" title="Abrir no WhatsApp Web" asChild>
                        <a href={`https://web.whatsapp.com/send?phone=${l.whatsapp}`} target="_blank" rel="noreferrer"><MessageCircle /></a>
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <div className="mt-2 text-[11.5px] text-muted">{filtrados.length} de {leads.length} leads</div>

      {leadAberto && <DetalheLead lead={leadAberto} onClose={() => setAberto(null)} />}
    </div>
  );
}
