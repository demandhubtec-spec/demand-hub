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
    const { email, sites } = await exchangeCode(code, kind);
    const msg =
      kind === "searchconsole"
        ? sites?.some((x) => x.includes("demandhub.com.br"))
          ? "✅ Google Search Console conectado. Os dados de busca do site começam a aparecer no portal em Marketing > SEO e orgânico. Pode fechar esta aba."
          : "⚠️ Conectado, mas essa conta Google não tem o site demandhub.com.br verificado no Search Console. Conecte com a conta demandhubtec@gmail.com."
        : kind === "gmail"
        ? `✅ Gmail ${email ?? ""} conectado. Os e-mails da prospecção vão sair por ele. Pode fechar esta aba.`
        : kind === "planilhas"
          ? "✅ Google Planilhas conectado. Volte ao portal e clique de novo em Abrir no Google Sheets. Pode fechar esta aba."
          : "✅ Google Agenda conectado à IA SDR. Pode fechar esta aba.";
    return new Response(msg, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response(`Erro ao conectar: ${(e as Error).message}`, { status: 500 });
  }
}
