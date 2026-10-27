# DemandIA · IA SDR

IA que atende leads no WhatsApp, qualifica pelo BANT, marca a reunião no Google Agenda com link do Meet, confirma com o lead e faz follow-up. Roda na Vercel com Supabase, Evolution GO e OpenAI, sem n8n.

## Como funciona

```
Lead (WhatsApp) ──► Evolution GO ──webhook──► Vercel /api/webhooks/evolution
                                                   │  salva no Supabase
                                                   │  espera 8s (agrupa mensagens seguidas)
                                                   ▼
                                     OpenAI + ferramentas (src/lib/tools.ts)
                     registrar_qualificacao · ver_horarios · agendar_reuniao
                     confirmar_reuniao · cancelar_reuniao · encaminhar_humano · encerrar_contato
                                                   │
                         Google Agenda + Meet ◄────┤────► Supabase (CRM do portal)
                                                   ▼
                                Resposta em balões pelo WhatsApp

Supabase pg_cron (a cada 10 min) ──► /api/cron/tick
      • follow-ups (só dias úteis, 08h–18h de Brasília)
      • confirmação da reunião + lembrete 1h antes
```

## Regras configuradas (`src/config/sdr.ts`)

| Regra | Valor |
|---|---|
| **B: Budget** | faturamento a partir de R$ 30 mil/mês (abaixo disso, a IA encerra com gentileza) |
| **A: Authority** | precisa ter um decisor na reunião (`decisor` ou `decisor_vai_participar`) |
| **N: Need** | marketing ineficiente, mais leads/demanda, automação, IA, sistema, site/LP |
| **T: Timing** | imediato ou em até 3 meses |
| Reunião | 40 min · seg–sex 18:30–20:30 · sáb 09:00–14:00 (sem o almoço, 12h–13h) · antecedência mínima de 3h |
| Follow-up | até 12 tentativas · intervalos de 1, 3 e 7 dias, intercalando · só em dias úteis, das 08h às 18h · feriados nacionais pulados |
| Confirmação | reunião à tarde/noite: 09:00 do mesmo dia · reunião de manhã: 17:00 do dia anterior · lembrete 1h antes com o link |

As regras críticas ficam no servidor, não só no prompt. Ela só oferece horário com BANT 4/4, só agenda horário válido e livre, e o banco impede duas reuniões no mesmo horário.

**Handoff:** se você responder um lead manualmente pelo WhatsApp, a IA pausa naquele contato (`ai_paused = true`). Pra reativar, mude o campo para `false` no Supabase ou pelo portal.

## Passo a passo para colocar no ar

### 1. Supabase
1. SQL Editor → rode `supabase/migrations/20261021000000_ia_sdr.sql`.
2. Copie `SUPABASE_URL` e a **service role key** (Project Settings → API).

### 2. Google Agenda (OAuth)
1. [console.cloud.google.com](https://console.cloud.google.com) → crie um projeto → **APIs e serviços → Biblioteca** → ative a **Google Calendar API**.
2. **Tela de consentimento OAuth**: tipo Externo, adicione seu e-mail como usuário de teste e depois **publique o app** (em modo "Teste", o token expira em 7 dias).
3. **Credenciais → Criar → ID do cliente OAuth → Aplicativo da Web**
   - URI de redirecionamento: `https://SEU-APP.vercel.app/api/google/callback`
4. Copie `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`.

### 3. Vercel
1. Suba esta pasta num repositório do GitHub e importe na Vercel.
2. Preencha as variáveis de ambiente usando o `.env.example` como modelo.
3. Faça o deploy.
4. Abra `https://SEU-APP.vercel.app/api/google/connect?secret=SEU_ADMIN_SECRET` e autorize sua conta Google. A tela deve mostrar "✅ Google Agenda conectado".

### 4. Evolution GO
1. Crie a instância `demandia` (com um token próprio) e conecte o WhatsApp da DemandIA pelo QR Code.
2. Coloque o token da instância em `EVOLUTION_INSTANCE_TOKEN` na Vercel.
3. Configure o webhook da instância (header `apikey` = token da instância):
```
POST https://evo.demandhub.com.br/instance/connect
{ "webhookUrl": "https://SEU-APP.vercel.app/api/webhooks/evolution?secret=SEU_WEBHOOK_SECRET", "subscribe": ["MESSAGE"] }
```

### 5. Agendador (follow-ups e lembretes)
SQL Editor do Supabase → rode `supabase/cron.sql`, trocando a URL e o `CRON_SECRET`.
> No plano Pro da Vercel dá pra usar o Vercel Cron no lugar. Basta criar um `vercel.json` com `{"crons":[{"path":"/api/cron/tick","schedule":"*/10 * * * *"}]}`.

### 6. Teste
Mande um "oi" de outro número pro WhatsApp conectado na Evolution e acompanhe as tabelas `sdr_leads`, `sdr_messages` e `sdr_events`.

## Indicadores pro portal
- `sdr_funil_diario`: leads, engajados, qualificados, desqualificados, agendados e sem resposta por dia
- `sdr_reunioes_resumo`: reuniões marcadas, realizadas, no-show e canceladas por semana
- `sdr_events`: log de tudo que a IA fez (ferramentas, follow-ups, handoffs)

## Desenvolvimento
```bash
npm install
npm test        # 26 testes das regras (agenda, follow-up, BANT, webhook)
npm run dev
```
Node 22.18 ou superior (os testes rodam TypeScript direto no Node).

## Estrutura
```
src/config/sdr.ts        regras de negócio (edite aqui)
src/lib/prompt.ts        prompt da SDR
src/lib/tools.ts         ferramentas da IA (qualificar, agenda, handoff)
src/lib/agent.ts         loop da conversa com o modelo
src/lib/llm.ts           chamada à OpenAI (function calling)
src/lib/jobs.ts          follow-ups, confirmações e lembretes
src/lib/schedule.ts      horários de reunião
src/lib/followup.ts      cadência e horário comercial
src/lib/google.ts        Google Agenda + Meet
src/lib/evolution.ts     WhatsApp (Evolution GO)
app/api/...              webhook, cron e OAuth do Google
supabase/                banco e agendador
```

## Próximos passos sugeridos
- Integrar com o CRM do portal (ligar `sdr_leads` às tabelas do portal) quando o repositório estiver conectado.
- Transcrever áudios dos leads (hoje a IA pede para o lead escrever).
- Atualizar o status das reuniões para `realizada` / `no_show` pelo portal, para medir o funil completo.
