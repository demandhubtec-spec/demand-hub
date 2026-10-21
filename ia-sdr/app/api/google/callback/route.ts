import { exchangeCode, validOauthState } from "@/src/lib/google.ts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!validOauthState(url.searchParams.get("state"))) {
    return new Response("Link expirado ou inválido. Tente de novo.", { status: 400 });
  }
  const code = url.searchParams.get("code");
  if (!code) return new Response(`Autorização cancelada: ${url.searchParams.get("error") ?? ""}`, { status: 400 });
  try {
    await exchangeCode(code);
    return new Response("✅ Google Agenda conectado à IA SDR. Pode fechar esta aba.", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (e) {
    return new Response(`Erro ao conectar: ${(e as Error).message}`, { status: 500 });
  }
}
