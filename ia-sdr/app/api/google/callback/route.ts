import { exchangeCode, validOauthState } from "@/src/lib/google.ts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = validOauthState(url.searchParams.get("state"));
  if (!kind) {
    return new Response("Link expirado ou inválido. Tente de novo.", { status: 400 });
  }
  const code = url.searchParams.get("code");
  if (!code) return new Response(`Autorização cancelada: ${url.searchParams.get("error") ?? ""}`, { status: 400 });
  try {
    const { email } = await exchangeCode(code, kind);
    const msg =
      kind === "gmail"
        ? `✅ Gmail ${email ?? ""} conectado. Os e-mails da prospecção vão sair por ele. Pode fechar esta aba.`
        : "✅ Google Agenda conectado à IA SDR. Pode fechar esta aba.";
    return new Response(msg, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`Erro ao conectar: ${(e as Error).message}`, { status: 500 });
  }
}
