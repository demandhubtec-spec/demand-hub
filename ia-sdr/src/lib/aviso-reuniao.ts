/**
 * 18/11 (Kelvin): toda reunião marcada pela Gabi ou pela Marina chega no WhatsApp dele assim:
 * quem marcou, dia e horário, cliente, empresa, telefone e e-mail. O link da reunião ele cria à mão
 * enquanto a Google Agenda estiver desconectada.
 */
export interface DadosReuniao {
  sdr: string;
  quando: string;
  nome?: string | null;
  empresa?: string | null;
  phone: string;
  emails: string[];
  meetLink?: string | null;
}

export function telefoneBR(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

export function textoReuniao(r: DadosReuniao): string {
  const empresa = (r.empresa ?? "").replace(/\s*[|].*$/, "").trim();
  return [
    `📅 Reunião agendada pela ${r.sdr}`,
    `Dia e horário: ${r.quando}`,
    `Cliente: ${r.nome?.trim() || "não informado"}`,
    ...(empresa ? [`Empresa: ${empresa}`] : []),
    `Telefone: ${telefoneBR(r.phone)}`,
    `E-mail: ${r.emails.join(", ") || "não informado"}`,
    r.meetLink ? `Link: ${r.meetLink}` : "Link: ainda não criado (crie o convite e mande para o cliente)",
  ].join("\n");
}
