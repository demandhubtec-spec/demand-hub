import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O vídeo dos reels é montado com o ffmpeg (binário do pacote ffmpeg-static) nas rotas que rodam o Diretor de arte
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/cron/estudio": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/estudio": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async rewrites() {
    return {
      // No domínio demandhub.com.br, a página inicial mostra o site geral da DemandIA (arquivo estático em public/site).
      // Fica em beforeFiles porque já existe uma página "/" (status do serviço), que continua no endereço da Vercel.
      beforeFiles: [
        { source: "/", has: [{ type: "host", value: "(www\\.)?demandhub\\.com\\.br" }], destination: "/site/index.html" },
      ],
      afterFiles: [
      // Landing page do diagnóstico gratuito (arquivo estático em public/diagnostico)
      { source: "/diagnostico", destination: "/diagnostico/index.html" },
      // Portfólio animado para clínicas (arquivo estático em public/portfolioclinicas)
      { source: "/portfolioclinicas", destination: "/portfolioclinicas/index.html" },
      // Portfólio animado para barbearias (arquivo estático em public/portfoliobarbearia)
      { source: "/portfoliobarbearia", destination: "/portfoliobarbearia/index.html" },
      { source: "/portfolio/barbearia", destination: "/portfoliobarbearia/index.html" },
      // Portfólios dos outros nichos (mesma estrutura, narrativa adaptada)
      { source: "/portfolioimobiliaria", destination: "/portfolioimobiliaria/index.html" },
      { source: "/portfolio/imobiliaria", destination: "/portfolioimobiliaria/index.html" },
      { source: "/portfolioadvocacia", destination: "/portfolioadvocacia/index.html" },
      { source: "/portfolio/advocacia", destination: "/portfolioadvocacia/index.html" },
      { source: "/portfoliopetshop", destination: "/portfoliopetshop/index.html" },
      { source: "/portfolio/petshop", destination: "/portfoliopetshop/index.html" },
      { source: "/portfoliorestaurante", destination: "/portfoliorestaurante/index.html" },
      { source: "/portfolio/restaurante", destination: "/portfoliorestaurante/index.html" },
      { source: "/portfolioeventos", destination: "/portfolioeventos/index.html" },
      { source: "/portfolio/eventos", destination: "/portfolioeventos/index.html" },
      { source: "/portfolioservicos", destination: "/portfolioservicos/index.html" },
      { source: "/portfolio/servicos", destination: "/portfolioservicos/index.html" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
