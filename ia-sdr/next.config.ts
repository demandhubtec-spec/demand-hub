import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
