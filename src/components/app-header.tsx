import { Badge } from "@/components/ui/badge";

export function AppHeader() {
  return (
    <header className="border-b border-slate-200/70 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Panel interno
          </p>
          <h2 className="mt-1 text-sm font-semibold text-slate-950 sm:text-base">
            Administracion de eventos y finanzas
          </h2>
        </div>
        <Badge variant="success" className="hidden sm:inline-flex">
          Sistema activo
        </Badge>
      </div>
    </header>
  );
}
