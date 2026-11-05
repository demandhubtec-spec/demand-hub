/**
 * Ferramentas que a IA SDR pode usar durante a conversa.
 * As regras críticas (só agenda se qualificado, só horário válido, sem conflito) são
 * garantidas aqui no servidor — não dependem do modelo "obedecer" o prompt.
 */
import { SDR_CONFIG } from "../config/sdr.ts";
import { evaluateBant, faturamentoMinimo, normalizeFaturamento } from "./bant.ts";
import type { Tool } from "./llm.ts";
import { activeMeeting, db, getLead, logEvent, updateLead, type Lead } from "./db.ts";
import { env } from "./env.ts";
import { sendText } from "./evolution.ts";
import { busyIntervals, cancelMeeting, createMeeting } from "./google.ts";
import { freeSlots, isValidSlot, pickOptions, reminderTimes } from "./schedule.ts";
import { formatBR, isoBR, localDayStart, toLocal } from "./time.ts";
import { pedirOrientacao } from "./canal.ts";
import { prospeccaoDoTelefone } from "./prospeccao.ts";

export const TOOLS: Tool[] = [
  {
    name: "registrar_qualificacao",
    description:
      "Salva no CRM o que você descobriu sobre o lead (dados e BANT). Envie só os campos novos ou alterados. Retorna o placar BANT e se o lead está qualificado.",
    input_schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        empresa: { type: "string" },
        segmento: { type: "string" },
        email: { type: "string" },
        faturamento_mensal: { type: "number", description: "Faturamento médio MENSAL em REAIS COMPLETOS. Ex.: '50 mil' = 50000; faixa '50 a 60 mil' = 50000 (use o mínimo); '1 milhão por ano' = 83000." },
        autoridade: {
          type: "string",
          enum: ["decisor", "responsavel_area", "decisor_vai_participar", "sem_decisor"],
          description: "decisor = dono ou sócio; responsavel_area = responde por marketing, atendimento ou vendas da empresa; decisor_vai_participar = não decide, mas o dono ou o responsável vai na reunião; sem_decisor = nenhum deles vai participar",
        },
        dores: {
          type: "array",
          items: { type: "string" },
          description: "Dores identificadas, ex: 'quer mais leads', 'quer IA no atendimento', 'quer um sistema'",
        },
        necessidade_resumo: { type: "string", description: "Resumo do contexto e do que o lead quer resolver" },
        prazo: { type: "string", enum: ["imediato", "ate_3_meses", "3_a_6_meses", "sem_previsao"] },
      },
    },
  },
  {
    name: "ver_horarios",
    description: "Busca horários livres reais na agenda do especialista para a reunião de diagnóstico. Só funciona com lead qualificado.",
    input_schema: {
      type: "object",
      properties: {
        preferencia: {
          type: "string",
          enum: ["qualquer", "dias_de_semana", "sabado"],
          description: "Preferência do lead, se ele disse alguma",
        },
        a_partir_de: { type: "string", description: "Opcional. Data AAAA-MM-DD a partir da qual buscar, se o lead pediu outro dia" },
      },
    },
  },
  {
    name: "agendar_reuniao",
    description: "Cria a reunião no Google Agenda com link do Meet e envia convite por e-mail. Use o valor 'inicio' exatamente como veio de ver_horarios.",
    input_schema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Horário de início no formato ISO retornado por ver_horarios, ex: 2026-10-22T19:10:00-03:00" },
        emails: { type: "array", items: { type: "string" }, description: "E-mails dos participantes (lead e decisor, se for outra pessoa)" },
      },
      required: ["inicio", "emails"],
    },
  },
  {
    name: "confirmar_reuniao",
    description: "Marca a reunião como confirmada quando o lead confirma presença.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "cancelar_reuniao",
    description: "Cancela a reunião atual (para remarcar ou porque o lead desistiu).",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
  {
    name: "pedir_orientacao",
    description:
      "Pede orientação ao seu gestor sobre este lead (objeção difícil, pergunta que você não sabe responder, próximo passo incerto). Ele responde pelo canal interno e você aplica depois.",
    input_schema: {
      type: "object",
      properties: {
        pergunta: { type: "string", description: "O que o lead disse e qual a sua dúvida, em 1 a 3 frases." },
        opcoes: { type: "array", items: { type: "string" }, description: "1 a 3 respostas que você pensou em mandar." },
      },
      required: ["pergunta"],
    },
  },
  {
    name: "combinar_retorno",
    description:
      "Guarda o retorno combinado com o contato (ex.: 'o Adriano volta terça depois das 10h', 'me chama semana que vem'). No dia e hora, você prepara a retomada e o gestor aprova antes de sair.",
    input_schema: {
      type: "object",
      properties: {
        quando: { type: "string", description: "Data e hora no formato ISO com fuso de Brasília, ex: 2026-11-03T10:30:00-03:00. Sem hora definida, use 09:30." },
        com_quem: { type: "string", description: "Com quem retomar (nome e função, se souber)." },
        nota: { type: "string", description: "O que foi combinado, em uma frase." },
      },
      required: ["quando"],
    },
  },
  {
    name: "registrar_objetivo",
    description:
      "Marca o progresso rumo ao objetivo (reunião ou ligação com o responsável): diagnóstico enviado e/ou contato do responsável obtido.",
    input_schema: {
      type: "object",
      properties: {
        diagnostico_enviado: { type: "boolean", description: "true quando você mandou os achados ou a análise do diagnóstico." },
        responsavel: { type: "string", description: "Nome do responsável e o contato dele (WhatsApp ou e-mail), como o lead passou." },
      },
    },
  },
  {
    name: "encaminhar_humano",
    description:
      "Avisa a equipe. Só pausa a IA quando o lead pede para falar com uma pessoa ou faz uma reclamação; nos outros casos (ex.: mandar a análise por e-mail) a equipe é avisada e VOCÊ continua a conversa.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string" },
        tipo: {
          type: "string",
          enum: ["pedido_de_pessoa", "reclamacao", "enviar_email", "outro"],
          description: "pedido_de_pessoa e reclamacao pausam a IA; enviar_email e outro só avisam a equipe.",
        },
      },
      required: ["motivo"],
    },
  },
  {
    name: "lead_quente",
    description:
      "Avisa o especialista NA HORA para ligar para este contato. Use quando quem decide (dono, sócio, médico, advogado titular ou quem cuida do marketing/perfil no Google) estiver conversando com interesse: fez perguntas, mandou prints, pediu detalhes, aceitou ver a análise ou falou de horário. Não pausa a conversa: você continua oferecendo os horários.",
    input_schema: {
      type: "object",
      properties: {
        quem: { type: "string", description: "Nome e papel de quem está conversando (ex.: Helton, gestor do perfil)" },
        resumo: { type: "string", description: "Em 1 ou 2 frases: o que a pessoa disse e por que está quente" },
      },
      required: ["resumo"],
    },
  },
  {
    name: "encerrar_contato",
    description: "Para os follow-ups com este lead.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", enum: ["opt_out", "desqualificado"] } },
      required: ["motivo"],
    },
  },
];

type Input = Record<string, any>;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function notifyOwner(text: string) {
  if (!env.ownerPhone) return;
  try {
    await sendText(env.ownerPhone, text);
  } catch (e) {
    console.error("Falha ao avisar o dono:", e);
  }
}

/** Agenda fora do ar: avisa o Kelvin no máximo uma vez a cada 6 horas. */
let ultimoAvisoAgenda = 0;
async function avisarAgendaFora(lead: Lead, e: unknown) {
  if (Date.now() - ultimoAvisoAgenda < 6 * 3600e3) return;
  ultimoAvisoAgenda = Date.now();
  const msg = String((e as Error)?.message ?? e).slice(0, 160);
  await notifyOwner(`⚠️ A Google Agenda da Ana não respondeu (${msg}). Ela segue oferecendo horários do expediente, mas reconecte a agenda para não marcar em cima de compromisso. Lead: ${lead.empresa ?? lead.nome ?? lead.phone}`).catch(() => {});
}

/** Próximos horários livres reais da agenda (para a retomada já chegar com 2 opções concretas). */
export async function proximosHorarios(now = new Date()): Promise<string[]> {
  const cfg = SDR_CONFIG.reuniao;
  const busy = await busyIntervals(now, new Date(now.getTime() + (cfg.diasAFrente + 1) * 86_400_000)).catch(() => []);
  return pickOptions(freeSlots(now, busy, cfg)).map((s) => formatBR(s.start));
}

/**
 * Pode oferecer horários e marcar? Inbound: só com BANT 4/4. Prospecção ativa: sim, porque ali a Ana
 * não pergunta faturamento (quem responde costuma ser a recepção) e o objetivo é justamente marcar
 * o diagnóstico com o responsável. Sem isso a Ana nunca conseguia oferecer horários reais.
 */
async function podeAgendar(lead: Lead): Promise<boolean> {
  if (evaluateBant(lead).qualificado) return true;
  const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
  return !!p;
}

export async function runTool(name: string, input: Input, leadId: string): Promise<string> {
  const lead = await getLead(leadId);
  await logEvent(leadId, `tool:${name}`, input);

  switch (name) {
    case "registrar_qualificacao": {
      const patch: Record<string, unknown> = {};
      for (const k of ["nome", "empresa", "segmento", "necessidade_resumo", "autoridade", "prazo"]) {
        if (input[k] !== undefined && input[k] !== "") patch[k] = input[k];
      }
      if (input.faturamento_mensal !== undefined && input.faturamento_mensal !== "") {
        const fat = normalizeFaturamento(input.faturamento_mensal);
        if (fat !== null) patch.faturamento_mensal = fat;
      }
      if (input.email) {
        if (!EMAIL_RE.test(input.email)) return "E-mail inválido. Peça para o lead conferir.";
        patch.email = String(input.email).toLowerCase();
      }
      if (Array.isArray(input.dores) && input.dores.length) {
        patch.dores = [...new Set([...(lead.dores ?? []), ...input.dores])];
      }
      const merged = { ...lead, ...patch } as Lead;
      const r = evaluateBant(merged);
      const minimo = faturamentoMinimo(merged.segmento);
      patch.bant_score = r.score;
      if (!["agendado", "humano", "opt_out", "cliente"].includes(lead.status)) {
        patch.status = r.qualificado ? "qualificado" : r.desqualificado ? "desqualificado" : "em_qualificacao";
      }
      if (r.desqualificado) patch.next_followup_at = null;
      await updateLead(leadId, patch);
      return JSON.stringify({
        bant: `${r.score}/4`,
        faturamento_registrado: merged.faturamento_mensal ? `R$ ${Number(merged.faturamento_mensal).toLocaleString("pt-BR")}/mês` : null,
        B_budget: r.budget,
        A_autoridade: r.authority,
        N_necessidade: r.need,
        T_tempo: r.timing,
        qualificado: r.qualificado,
        desqualificado_por_faturamento: r.desqualificado,
        faturamento_minimo: `R$ ${minimo.toLocaleString("pt-BR")}/mês`,
        ainda_falta: r.faltando,
        proximo_passo: r.qualificado
          ? "Lead qualificado: use ver_horarios e ofereça opções."
          : r.desqualificado
            ? "Faturamento abaixo do mínimo: encerre com gentileza, sem marcar reunião."
            : `Continue a conversa e descubra: ${r.faltando.join(", ") || "os critérios que não bateram"}.`,
      });
    }

    case "ver_horarios": {
      if (!(await podeAgendar(lead))) {
        return "Bloqueado: o lead ainda não está qualificado (BANT 4/4). Continue a qualificação antes de oferecer horários.";
      }
      const now = new Date();
      const cfg = SDR_CONFIG.reuniao;
      // Se o lead pediu "a partir de" outra data, desloca a janela de busca (máx. 30 dias à frente)
      const pedido = input.a_partir_de ? new Date(`${input.a_partir_de}T00:00:00-03:00`) : now;
      const offsetDias = isNaN(pedido.getTime()) ? 0 : Math.min(30, Math.max(0, Math.ceil((pedido.getTime() - now.getTime()) / 86_400_000)));
      const base = new Date(now.getTime() + offsetDias * 86_400_000);
      const diasAFrente = cfg.diasAFrente + offsetDias;
      // Agenda do Google fora do ar (ex.: acesso expirado): oferece os horários do expediente mesmo assim
      // e avisa o Kelvin, em vez de travar a conversa com quem decide (Munhoz, 04/11)
      let agendaOk = true;
      const busy = await busyIntervals(now, new Date(now.getTime() + (diasAFrente + 1) * 86_400_000)).catch(async (e) => {
        agendaOk = false;
        console.error("ver_horarios: agenda indisponível", e);
        await avisarAgendaFora(lead, e);
        return [] as Awaited<ReturnType<typeof busyIntervals>>;
      });
      let slots = freeSlots(now, busy, { ...cfg, diasAFrente }).filter((s) => offsetDias === 0 || s.start >= localDayStart(base));
      if (input.preferencia === "sabado") slots = slots.filter((s) => toLocal(s.start).dow === 6);
      if (input.preferencia === "dias_de_semana") slots = slots.filter((s) => toLocal(s.start).dow !== 6);
      if (!slots.length) return "Sem horários livres nesse período. Pergunte se o lead prefere outra semana ou encaminhe para humano.";
      const options = pickOptions(slots);
      return JSON.stringify({
        opcoes: options.map((s) => ({ inicio: isoBR(s.start), legivel: formatBR(s.start) })),
        outros_horarios_livres: slots.slice(0, 12).map((s) => formatBR(s.start)),
        duracao_minutos: SDR_CONFIG.reuniao.duracaoMin,
        ...(agendaOk ? {} : { aviso: "Agenda não confirmada agora; o especialista já foi avisado. Ofereça normalmente 2 destes horários." }),
      });
    }

    case "agendar_reuniao": {
      if (!(await podeAgendar(lead))) return "Bloqueado: lead não qualificado.";
      const existing = await activeMeeting(leadId);
      if (existing) {
        return `Já existe reunião marcada para ${formatBR(new Date(existing.starts_at))}. Para trocar, use cancelar_reuniao antes.`;
      }
      const start = new Date(input.inicio);
      const now = new Date();
      if (isNaN(start.getTime()) || !isValidSlot(start, now)) {
        return "Horário inválido ou fora da agenda. Use ver_horarios e escolha um dos horários retornados.";
      }
      const emails: string[] = (input.emails ?? []).map((e: string) => e.trim().toLowerCase()).filter((e: string) => EMAIL_RE.test(e));
      if (!emails.length) return "Preciso de pelo menos um e-mail válido para enviar o convite. Peça ao lead.";

      const end = new Date(start.getTime() + SDR_CONFIG.reuniao.duracaoMin * 60_000);
      const busy = await busyIntervals(start, end).catch(() => []);
      if (busy.length) return "Esse horário acabou de ser ocupado. Chame ver_horarios de novo e ofereça outras opções.";

      // Reserva no banco primeiro (índice único impede duas reuniões no mesmo horário)
      const ins = await db()
        .from("sdr_meetings")
        .insert({
          lead_id: leadId,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          attendee_emails: emails,
          ...reminderTimes(start, now),
        })
        .select("id")
        .single();
      if (ins.error) return "Esse horário acabou de ser reservado por outro lead. Chame ver_horarios de novo.";

      try {
        const titulo = `${SDR_CONFIG.reuniao.tituloEvento} — ${lead.empresa || lead.nome || lead.phone}`;
        const descricao = [
          `Lead: ${lead.nome ?? "—"} (${lead.phone})`,
          `Empresa: ${lead.empresa ?? "—"} | Segmento: ${lead.segmento ?? "—"}`,
          `Faturamento mensal: ${lead.faturamento_mensal ? `R$ ${lead.faturamento_mensal.toLocaleString("pt-BR")}` : "—"}`,
          `Dores: ${(lead.dores ?? []).join("; ") || "—"}`,
          `Contexto: ${lead.necessidade_resumo ?? "—"}`,
          `Prazo: ${lead.prazo ?? "—"} | Autoridade: ${lead.autoridade ?? "—"}`,
          "",
          "Agendado pela IA SDR da DemandIA.",
        ].join("\n");
        const ev = await createMeeting({ start, end, summary: titulo, description: descricao, attendees: emails });
        await db().from("sdr_meetings").update({ google_event_id: ev.eventId, meet_link: ev.meetLink }).eq("id", ins.data.id);
        await updateLead(leadId, {
          status: "agendado",
          email: lead.email ?? emails[0],
          next_followup_at: null,
          followup_attempts: 0,
        });
        await notifyOwner(
          `📅 Nova reunião marcada pela IA\n${formatBR(start)}\n${lead.nome ?? ""} — ${lead.empresa ?? ""}\nFaturamento: R$ ${lead.faturamento_mensal?.toLocaleString("pt-BR") ?? "—"}\nDor: ${(lead.dores ?? []).join("; ")}\n${ev.meetLink ?? ""}`,
        );
        return JSON.stringify({
          ok: true,
          quando: formatBR(start),
          duracao_minutos: SDR_CONFIG.reuniao.duracaoMin,
          link_meet: ev.meetLink,
          convite_enviado_para: emails,
        });
      } catch (e) {
        // Sem Google Agenda: a reunião fica reservada no banco e o Kelvin manda o convite à mão.
        // Perder a reunião por falha técnica é pior do que o convite chegar alguns minutos depois.
        console.error(e);
        await updateLead(leadId, { status: "agendado", email: lead.email ?? emails[0], next_followup_at: null, followup_attempts: 0 });
        await notifyOwner(
          `📅 REUNIÃO MARCADA, mas a Google Agenda falhou: crie o convite à mão\n${formatBR(start)} (${SDR_CONFIG.reuniao.duracaoMin} min)\n${lead.nome ?? ""} ${lead.empresa ? `(${lead.empresa})` : ""}\nE-mail: ${emails.join(", ")}\nWhatsApp: +${lead.phone}`,
        );
        return JSON.stringify({
          ok: true,
          quando: formatBR(start),
          duracao_minutos: SDR_CONFIG.reuniao.duracaoMin,
          convite: "o link do Google Meet chega por e-mail em seguida (o especialista envia). Confirme dia e horário ao lead e diga que o convite chega no e-mail.",
        });
      }
    }

    case "confirmar_reuniao": {
      const m = await activeMeeting(leadId);
      if (!m) return "Não há reunião ativa para confirmar.";
      await db().from("sdr_meetings").update({ status: "confirmada" }).eq("id", m.id);
      return `Confirmada: ${formatBR(new Date(m.starts_at))}. Link: ${m.meet_link ?? "no convite do e-mail"}`;
    }

    case "cancelar_reuniao": {
      const m = await activeMeeting(leadId);
      if (!m) return "Não há reunião ativa.";
      if (m.google_event_id) {
        try {
          await cancelMeeting(m.google_event_id);
        } catch (e) {
          console.error(e);
        }
      }
      await db().from("sdr_meetings").update({ status: "cancelada" }).eq("id", m.id);
      await updateLead(leadId, { status: evaluateBant(lead).qualificado ? "qualificado" : "em_qualificacao" });
      await notifyOwner(`❌ Reunião cancelada pelo lead ${lead.nome ?? lead.phone} (${formatBR(new Date(m.starts_at))}). Motivo: ${input.motivo}`);
      return "Reunião cancelada. Se o lead quiser remarcar, use ver_horarios.";
    }

    case "pedir_orientacao":
      return pedirOrientacao(leadId, String(input.pergunta ?? ""), Array.isArray(input.opcoes) ? input.opcoes.map(String).slice(0, 3) : []);

    case "encaminhar_humano": {
      const tipo = String(input.tipo ?? "");
      const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
      // Na prospecção, pausar só quando a pessoa pede um humano ou reclama: "vou encaminhar para a equipe"
      // e parar era o que mais matava conversa (ninguém assumia).
      const pausar = !p || tipo === "pedido_de_pessoa" || tipo === "reclamacao";
      if (pausar) {
        await updateLead(leadId, { ai_paused: true, status: "humano", next_followup_at: null });
        await notifyOwner(`🙋 Lead pediu atendimento humano\n${lead.nome ?? ""} (+${lead.phone})\nMotivo: ${input.motivo}\nwa.me/${lead.phone}`);
        return "IA pausada nesta conversa. Avise o lead que alguém da nossa equipe vai responder pessoalmente em breve (sem dizer nomes).";
      }
      await notifyOwner(`📌 ${p?.empresa ?? lead.empresa ?? lead.nome ?? ""} (+${lead.phone})\n${input.motivo}\nwa.me/${lead.phone}`);
      return "Equipe avisada. NÃO diga ao lead que alguém da equipe vai responder: continue você mesma a conversa, rumo à conversa de 30 minutos com o nosso especialista.";
    }

    case "lead_quente": {
      const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
      const empresa = p?.empresa ?? lead.empresa ?? lead.nome ?? `+${lead.phone}`;
      await logEvent(leadId, "lead_quente", input);
      await notifyOwner(
        `🔥 LEAD QUENTE: ligue em até 1 hora\n${empresa}${input.quem ? `\nQuem: ${input.quem}` : ""}\n${input.resumo ?? ""}\nLigar: +${lead.phone}\nwa.me/${lead.phone}`,
      );
      return "Especialista avisado para ligar. Continue a conversa normalmente e ofereça 2 horários reais (ver_horarios) para a conversa de 30 minutos.";
    }

    case "combinar_retorno": {
      const quando = new Date(String(input.quando ?? ""));
      if (Number.isNaN(quando.getTime()) || quando.getTime() < Date.now() - 3600e3)
        return "Data inválida. Use o formato ISO com fuso de Brasília, numa data futura (ex.: 2026-11-03T10:30:00-03:00).";
      const nota = [input.com_quem, input.nota].filter((x) => typeof x === "string" && x.trim()).join(": ") || null;
      const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
      if (p?.place_id) {
        await db()
          .from("outreach_leads")
          .update({ retorno_em: quando.toISOString(), retorno_nota: nota, ...(input.com_quem && !p.responsavel_contato ? { responsavel_contato: String(input.com_quem) } : {}) })
          .eq("place_id", p.place_id);
      }
      await updateLead(leadId, { next_followup_at: quando.toISOString() });
      return `Retorno guardado para ${formatBR(quando)}. Agradeça, confirme que retoma nesse dia e encerre por agora, sem mais perguntas.`;
    }

    case "registrar_objetivo": {
      const p = await prospeccaoDoTelefone(lead.phone).catch(() => null);
      if (!p?.place_id) return "Ok, anotado.";
      const patch: Record<string, unknown> = {};
      if (input.diagnostico_enviado === true && !p.diag_enviado_em) patch.diag_enviado_em = new Date().toISOString();
      if (typeof input.responsavel === "string" && input.responsavel.trim()) patch.responsavel_contato = input.responsavel.trim().slice(0, 200);
      if (Object.keys(patch).length) await db().from("outreach_leads").update(patch).eq("place_id", p.place_id);
      return "Progresso registrado. Siga rumo à conversa de 30 minutos ou ligação com o responsável.";
    }

    case "encerrar_contato": {
      await updateLead(leadId, {
        status: input.motivo === "opt_out" ? "opt_out" : "desqualificado",
        next_followup_at: null,
      });
      // Na prospecção, quem pediu para sair vai para "Fora" e a cadência para de vez
      const pe = await prospeccaoDoTelefone(lead.phone).catch(() => null);
      if (pe?.place_id) {
        await db()
          .from("outreach_leads")
          .update({
            status_comercial: "descartado",
            cadencia: "parada",
            proximo_toque_em: null,
            proximo_canal: null,
            retorno_em: null,
            ...(input.motivo === "opt_out" ? { wa_status: "optout" } : {}),
          })
          .eq("place_id", pe.place_id);
      }
      return "Follow-ups encerrados para este lead. Agora responda ao lead com UMA mensagem curta, gentil e sem insistir (ex.: agradecer o retorno e deixar a porta aberta). Nunca deixe a mensagem dele sem resposta.";
    }

    default:
      return `Ferramenta desconhecida: ${name}`;
  }
}
