# Demand Hub

Portal interno da Demand Marketing: gestão de clientes, projetos, atividades e financeiro —
tanto para os clientes da agência quanto para os negócios próprios do Kelvin (Sentiari Music
e K19 Barbearia, tratados como clientes de acesso restrito).

Reconstrução em React real do protótipo estático `demand-hub-prototipo-v3.html`, mantendo o
mesmo visual, cores, tipografia e microinterações — agora componentizado e conectado a um
banco de dados de verdade (Supabase).

## Stack

- React 18 + Vite + TypeScript
- Tailwind CSS + primitivas Radix (estilo shadcn/ui)
- React Router (rotas client-side)
- Tanstack React Query (dados assíncronos)
- Gráficos em CSS puro (barras), como no protótipo
- Supabase (Postgres + Auth) como backend
- Deploy alvo: Vercel

## Rodando localmente

```bash
npm install
cp .env.example .env   # preencha com as chaves do seu projeto Supabase
npm run dev
```

Sem um `.env` preenchido, o app roda em **modo demo**: os hooks em `src/hooks/*` caem
automaticamente nos dados de referência de `src/data/seed.ts` (os mesmos números do
protótipo), então dá pra conferir o visual sem precisar configurar o Supabase primeiro.

## Banco de dados (Supabase)

1. Crie um projeto novo em [supabase.com](https://supabase.com).
2. Rode a migration em `supabase/migrations/0001_init.sql` (SQL editor do painel, ou
   `npx supabase db push` com o CLI configurado). Ela cria as tabelas
   (`perfis`, `clientes`, `projetos`, `atividades`, `financeiro_lancamentos`, `contratos`)
   e as políticas de Row Level Security descritas no briefing:
   - **Kelvin** — dono, acesso total (inclusive clientes com `privado = true`).
   - **Matheus** — dono, acesso total **exceto** clientes privados.
   - **Fabrício** — colaborador: só enxerga projetos e atividades.
3. Crie os três usuários em Authentication → Users, depois rode o `insert into perfis`
   comentado no fim da migration com os UUIDs gerados.
4. Copie a URL do projeto e a `anon key` (Project Settings → API) para o `.env`.

## Deploy

Pronto pra import direto na Vercel — configure `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` nas variáveis de ambiente do projeto.
