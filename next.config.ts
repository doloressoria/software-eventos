import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/eventos/*/excel": ["./resources/commercial-excel/evento.xlsx"],
    "/catering/*/excel": ["./resources/commercial-excel/catering.xlsx"],
  },
};

export default nextConfig;
