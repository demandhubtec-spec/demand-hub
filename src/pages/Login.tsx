import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { BrandLogo } from "@/components/layout/Logo";
import { HoloSymbol, Sparkle } from "@/components/brand/HoloSymbol";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/* Brilhos soltos sobre a grade de 28px (posições em múltiplos da grade) */
const SPARKLES = [
  { left: 28 * 2, top: 28 * 2, size: 12, delay: 0 },
  { left: 28 * 24, top: 28 * 2, size: 9, delay: 1.2 },
  { left: 28 * 2, top: 28 * 30, size: 14, delay: 2.1 },
  { left: 28 * 25, top: 28 * 31, size: 10, delay: 0.6 },
  { left: 28 * 49, top: 28 * 3, size: 11, delay: 1.7 },
  { left: 28 * 49, top: 28 * 28, size: 8, delay: 2.8 },
];

export default function Login() {
  const { signInWithPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [entering, setEntering] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await signInWithPassword(email, password);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    // Transição: a estrela acende e toma a tela antes de abrir o portal
    setEntering(true);
    window.setTimeout(() => navigate("/", { replace: true }), 720);
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0B0420] text-white">
      {/* Elementos gráficos do manual: Aura + Grade de pontos com brilhos */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(164,123,255,.16)_1px,transparent_1.4px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_60%_45%,#000_30%,transparent_78%)]" />
      <div className="pointer-events-none absolute -left-[18%] -top-[35%] h-[1100px] w-[1100px] rounded-full bg-[radial-gradient(circle,rgba(110,58,255,.45)_0%,rgba(42,12,143,.16)_42%,transparent_66%)]" />
      <div className="pointer-events-none absolute -bottom-[30%] right-[-10%] h-[900px] w-[900px] rounded-full bg-[radial-gradient(circle,rgba(110,58,255,.30)_0%,transparent_62%)]" />
      {SPARKLES.map((s, i) => (
        <Sparkle
          key={i}
          size={s.size}
          className="twinkle pointer-events-none absolute text-[#C9B0FF] max-md:hidden"
          style={{ left: s.left, top: s.top, animationDelay: `${s.delay}s` }}
        />
      ))}

      <div className="relative mx-auto grid min-h-screen max-w-[1240px] grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-[1.25fr_1fr] lg:gap-8 lg:px-10">
        {/* Assinatura */}
        <div className="flex flex-col max-lg:items-center max-lg:text-center">
          <div className="rise mb-8 max-lg:mb-6" style={{ animationDelay: "0.05s" }}>
            <BrandLogo height={38} />
          </div>
          <h1 className="brand-h text-[clamp(40px,6.2vw,92px)] leading-[0.9] lg:whitespace-nowrap">
            <span className="rise block" style={{ animationDelay: "0.25s" }}>
              Sua demanda,
            </span>
            <span className="rise block" style={{ animationDelay: "0.4s" }}>
              resolvida com
            </span>
            <span className="rise block text-[#A47BFF]" style={{ animationDelay: "0.55s" }}>
              inteligência.
            </span>
          </h1>
        </div>

        {/* Holograma projetado + acesso */}
        <div className="flex flex-col items-center">
          <HoloSymbol size={340} className="-mb-[78px] max-md:-mb-[48px] max-md:h-[210px] max-md:w-[210px]" />
          <div
            className="beam-border rise relative w-full max-w-[420px] rounded-[24px] bg-[linear-gradient(180deg,rgba(28,10,74,.88),rgba(16,6,46,.92))] px-7 pb-7 pt-8 shadow-[0_40px_100px_rgba(0,0,0,.55)] backdrop-blur-xl"
            style={{ animationDelay: "0.5s" }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div>
                <div className="eyebrow text-[10.5px] text-[#A47BFF]">Acesso ao portal</div>
                <div className="mt-1.5 text-[19px] font-semibold">Entre na sua conta</div>
              </div>
              <span className="eyebrow flex items-center gap-1.5 rounded-full border border-[rgba(47,210,127,.35)] bg-[rgba(47,210,127,.08)] px-2.5 py-1 text-[9.5px] text-[#7BE7AE]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2FD27F]" />
                Online
              </span>
            </div>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="email" className="eyebrow mb-2 block text-[10.5px] text-[#C9BEEA]">
                  E-mail
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@exemplo.com"
                  className="h-[52px] rounded-[14px] border-[#3A2A6E] bg-[#0E0628] text-[16px] text-white placeholder:text-[#6E61A0] focus:border-[#A47BFF]"
                />
              </div>
              <div>
                <Label htmlFor="password" className="eyebrow mb-2 block text-[10.5px] text-[#C9BEEA]">
                  Senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-[52px] rounded-[14px] border-[#3A2A6E] bg-[#0E0628] pr-12 text-[16px] text-white placeholder:text-[#6E61A0] focus:border-[#A47BFF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-[#8E7FC4] hover:text-white"
                    aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {error && (
                <div className="rounded-[12px] border border-[#FF6B81] bg-[rgba(255,107,129,.12)] px-3.5 py-2.5 text-[13.5px] text-[#FFC2CC]">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading || entering}
                className="group mt-2 inline-flex h-[54px] w-full items-center justify-center gap-2.5 rounded-full bg-[#6E3AFF] font-display text-[16px] font-extrabold uppercase tracking-[.02em] text-white shadow-[0_14px_40px_rgba(110,58,255,.5),inset_0_-4px_0_rgba(0,0,0,.18)] transition-[filter,transform] [font-stretch:96%] hover:brightness-110 active:scale-[.98] disabled:opacity-70"
              >
                {loading ? "Entrando…" : "Entrar"}
                {!loading && <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-1" />}
              </button>
            </form>
            <div className="mt-5 flex items-center justify-center gap-1.5 text-[12.5px] text-[#8E7FC4]">
              <Lock className="h-3.5 w-3.5" />
              Primeiro acesso? Peça o convite ao administrador.
            </div>
          </div>
        </div>
      </div>

      {/* Transição de entrada */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[radial-gradient(circle_at_50%_50%,#A47BFF_0%,#6E3AFF_22%,#1C0A4A_55%,#0B0420_100%)]",
          entering ? "enter-burst" : "hidden",
        )}
      >
        <Sparkle size={72} className="text-white drop-shadow-[0_0_24px_#fff]" />
      </div>
    </div>
  );
}
