import { HelpCircle, GitBranch, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";

const cards = [
  { icon: HelpCircle, title: "FAQ", sub: "Respostas rápidas pras dúvidas mais comuns." },
  { icon: GitBranch, title: "Processos", sub: "Como cada tipo de projeto caminha por aqui." },
  { icon: Mail, title: "Falar com o suporte", sub: "Envie sua dúvida direto pra equipe técnica." },
];

export default function Ajuda() {
  return (
    <section>
      <div className="mb-[22px]">
        <div className="text-[21px] font-semibold">Central de ajuda</div>
        <div className="mt-1 text-[13px] text-muted">Precisa de uma mão? Comece por aqui.</div>
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.title} className="p-5">
            <c.icon className="mb-3 h-[22px] w-[22px] text-primary-bright" />
            <div className="mb-1 text-[13.5px] font-semibold">{c.title}</div>
            <div className="text-xs leading-relaxed text-muted">{c.sub}</div>
          </Card>
        ))}
      </div>
    </section>
  );
}
