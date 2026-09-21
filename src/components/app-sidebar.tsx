"use client";

import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Landmark,
  ScrollText,
  Settings,
  Store,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/utils/cn";
import type { ScreenPermission } from "@/lib/roles/permissions";

type NavigationItem = {
  adminOnly?: boolean;
  group: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  permission?: ScreenPermission;
};

const navigation: NavigationItem[] = [
  {
    name: "Dashboard",
    href: "/dashboard",
    group: "Operacion",
    icon: LayoutDashboard,
    permission: "dashboard",
  },
  { name: "Eventos", href: "/eventos", group: "Operacion", icon: CalendarDays, permission: "eventos" },
  { name: "Catering", href: "/catering", group: "Operacion", icon: UtensilsCrossed, permission: "catering" },
  { name: "Salones", href: "/salones", group: "Gestion", icon: Store, permission: "salones" },
  { name: "Pagos", href: "/pagos", group: "Finanzas", icon: Landmark, permission: "pagos" },
  { name: "Reportes", href: "/reportes", group: "Finanzas", icon: BarChart3, permission: "reportes" },
  {
    name: "Usuarios",
    href: "/admin/usuarios",
    group: "Sistema",
    icon: Users,
    adminOnly: true,
  },
  {
    name: "Roles",
    href: "/admin/roles",
    group: "Sistema",
    icon: Settings,
    adminOnly: true,
  },
  {
    name: "Auditoria",
    href: "/admin/auditoria",
    group: "Sistema",
    icon: ScrollText,
    adminOnly: true,
  },
  {
    name: "Admin",
    href: "/admin",
    group: "Sistema",
    icon: Settings,
    adminOnly: true,
  },
];

export function AppSidebar({ isAdmin, permissions }: { isAdmin: boolean; permissions: string[] }) {
  const pathname = usePathname();
  const visibleNavigation = navigation.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.permission || permissions.includes(item.permission)),
  );

  return (
    <aside className="border-b border-slate-200/70 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:sticky lg:top-0 lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col px-4 py-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition hover:bg-slate-50"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm shadow-teal-950/10">
            SE
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-950">
              Software Eventos
            </span>
            <span className="block text-xs text-slate-500">
              Operacion y finanzas
            </span>
          </span>
        </Link>

        <Separator className="mt-5 bg-slate-100" />

        <nav className="mt-5 grid gap-1 sm:grid-cols-3 lg:grid-cols-1">
          {visibleNavigation.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              name={item.name}
              group={item.group}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>

        <div className="mt-6 hidden rounded-2xl border border-teal-100 bg-teal-50/70 p-4 shadow-sm shadow-teal-950/5 lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
            Panel interno
          </p>
          <p className="mt-2 text-sm leading-6 text-teal-950">
            Gestion centralizada para ventas, eventos, salones, pagos y
            reportes.
          </p>
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  icon: Icon,
  name,
  group,
  active,
}: {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  group: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-ring/25",
        active
          ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0",
            active ? "text-teal-700" : "text-slate-400",
          )}
        />
        <span className="truncate">{name}</span>
      </span>
      <span
        className={cn(
          "hidden text-[10px] font-semibold uppercase tracking-[0.14em] sm:inline lg:hidden xl:inline",
          active ? "text-teal-700" : "text-slate-400",
        )}
      >
        {group}
      </span>
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
