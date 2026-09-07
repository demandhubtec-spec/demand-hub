import { Card } from "@/components/ui/card";
import { processosSeed } from "@/data/seed";

export default function Processos() {
  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">Processos Demand Hub</div>
        <div className="mt-1 text-[13px] text-muted">Como um projeto novo caminha, do diagnóstico à entrega.</div>
      </div>
      <Card className="p-5 px-[22px]">
        <div className="flex flex-col">
          {processosSeed.map((p, i) => (
            <div key={p.titulo} className="flex gap-4 border-b border-border py-4 last:border-b-0">
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-primary-tint font-display text-[13px] font-bold text-primary-bright">
                {i + 1}
              </div>
              <div>
                <div className="mb-0.5 text-[13.5px] font-semibold">{p.titulo}</div>
                <div className="text-[12.5px] leading-relaxed text-muted">{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
