/**
 * Abra no navegador:
 *   /api/google/connect?secret=ADMIN_SECRET              → conecta o Google Agenda da IA SDR
 *   /api/google/connect?secret=ADMIN_SECRET&tipo=gmail   → conecta o Gmail que envia os e-mails da prospecção
 *   /api/google/connect?secret=ADMIN_SECRET&tipo=searchconsole → conecta o Search Console (SEO do site)
 */
import { env } from "@/src/lib/env.ts";
import { authUrl, oauthState, type GoogleKind } from "@/src/lib/google.ts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  if (params.get("secret") !== env.adminSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  const tipo = params.get("tipo");
  const kind: GoogleKind = tipo === "gmail" || tipo === "searchconsole" ? tipo : "google";
  return Response.redirect(authUrl(oauthState(kind), kind), 302);
}
