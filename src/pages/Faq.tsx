import { Card } from "@/components/ui/card";
import { faqSeed } from "@/data/seed";

export default function Faq() {
  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">Perguntas frequentes</div>
        <div className="mt-1 text-[13px] text-muted">As dúvidas mais comuns sobre o Demand Hub.</div>
      </div>
      <Card className="p-5 px-[22px]">
        {faqSeed.map((f, i) => (
          <details key={f.pergunta} className="border-b border-border py-3.5 last:border-b-0" open={i === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between text-[13.5px] font-semibold [&::-webkit-details-marker]:hidden">
              {f.pergunta}
              <span className="text-lg text-muted">+</span>
            </summary>
            <div className="mt-2.5 text-[13px] leading-relaxed text-muted">{f.resposta}</div>
          </details>
        ))}
      </Card>
    </section>
  );
}
