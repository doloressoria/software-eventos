import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"],
  devIndicators: { position: "bottom-right" },
  outputFileTracingIncludes: {
    "/eventos/*/ingresos/recibos/*/pdf": ["./node_modules/pdfkit/js/data/*.afm"],
    "/catering/*/ingresos/recibos/*/pdf": ["./node_modules/pdfkit/js/data/*.afm"],
    "/eventos/*/excel": ["./resources/commercial-excel/evento.xlsx"],
    "/eventos/*/ingresos/excel": ["./resources/commercial-excel/evento.xlsx"],
    "/catering/*/excel": ["./resources/commercial-excel/catering.xlsx"],
  },
};

export default nextConfig;
