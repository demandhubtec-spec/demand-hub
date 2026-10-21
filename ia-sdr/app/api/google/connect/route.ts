/** Abra no navegador: /api/google/connect?secret=ADMIN_SECRET — conecta o Google Agenda do Kelvin. */
import { env } from "@/src/lib/env.ts";
import { authUrl, oauthState } from "@/src/lib/google.ts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("secret") !== env.adminSecret) {
    return new Response("unauthorized", { status: 401 });
  }
  return Response.redirect(authUrl(oauthState()), 302);
}
