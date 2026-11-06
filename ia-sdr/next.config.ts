import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O vídeo dos reels é montado com o ffmpeg (binário do pacote ffmpeg-static) nas rotas que rodam o Diretor de arte
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/cron/estudio": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/estudio": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async redirects() {
    return [
      // No domínio demandhub.com.br, a página inicial leva para a landing page
      { source: "/", has: [{ type: "host", value: "(www\\.)?demandhub\\.com\\.br" }], destination: "/diagnostico", permanent: false },
    ];
  },
  async rewrites() {
    return [
      // Landing page do diagnóstico gratuito (arquivo estático em public/diagnostico)
      { source: "/diagnostico", destination: "/diagnostico/index.html" },
    ];
  },
};

export default nextConfig;
