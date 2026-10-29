/**
 * Prévia de site grátis (isca da prospecção): 3 seções de como ficaria o site da empresa.
 * Página pública, fora do Google (noindex), acessada só por quem tem o link.
 */
import { notFound } from "next/navigation";
import { db } from "@/src/lib/db.ts";
import { type SitePreview } from "@/src/lib/extras.ts";
import { PreviaSite } from "../PreviaSite.tsx";

export const dynamic = "force-dynamic";

async function carregar(token: string): Promise<SitePreview | null> {
  if (!/^[A-Za-z0-9_-]{6,16}$/.test(token)) return null;
  const { data } = await db().from("outreach_leads").select("site_preview").eq("site_preview->>token", token).maybeSingle();
  return (data?.site_preview as SitePreview | undefined) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const p = await carregar((await params).token);
  return {
    title: p ? `${p.empresa} · prévia do site` : "Prévia de site",
    robots: { index: false, follow: false },
  };
}

export default async function Previa({ params }: { params: Promise<{ token: string }> }) {
  const p = await carregar((await params).token);
  if (!p) notFound();
  return <PreviaSite p={p} />;
}
