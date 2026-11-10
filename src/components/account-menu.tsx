import { ChevronsUpDown, KeyRound } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { buttonVariants } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/utils/cn";

export function AccountMenu({ name, email }: { name: string | null; email: string }) {
  const displayName = name?.trim() || email.split("@")[0] || "Mi cuenta";
  const [first, ...otherNames] = displayName.split(/[.\s_-]+/).filter(Boolean);
  const last = otherNames.at(-1);
  const initials = last ? [...first][0] + [...last][0] : [...(first || displayName)].slice(0, 2).join("");

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "w-full min-w-0 justify-start gap-3 px-2 text-left data-[state=open]:bg-slate-100",
        )}
      >
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100 font-semibold text-teal-800 uppercase">
          {initials}
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-semibold text-slate-950">{displayName}</span>
          <span className="truncate text-xs font-normal text-slate-600">{email}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="text-slate-500" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" aria-label="Mi cuenta" className="w-64 max-w-[var(--radix-popover-trigger-width)] p-1.5">
        <PopoverClose asChild>
          <Link
            href="/cambiar-contrasena"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "w-full justify-start" })}
          >
            <KeyRound aria-hidden="true" />
            Cambiar contraseña
          </Link>
        </PopoverClose>
        <SignOutButton />
      </PopoverContent>
    </Popover>
  );
}
