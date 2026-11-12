/** Relógio diário do SEO (pg_cron do Supabase com CRON_SECRET). A lógica fica em /api/seo. */
export { GET, POST, OPTIONS } from "../../seo/route.ts";
export const runtime = "nodejs";
export const maxDuration = 300;
