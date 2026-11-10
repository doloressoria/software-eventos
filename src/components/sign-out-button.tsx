"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);

    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });

    if (error) {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (data.session || sessionError) {
        setFailed(true);
        setPending(false);
        return;
      }
    }

    window.location.replace("/login");
  }

  return (
    <div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut} disabled={pending}>
        <LogOut aria-hidden="true" />
        {pending ? "Cerrando sesión…" : "Cerrar sesión"}
      </Button>
      {failed && (
        <p role="alert" className="px-3.5 py-1 text-xs text-red-700">
          No se pudo cerrar la sesión. Volvé a intentar.
        </p>
      )}
    </div>
  );
}
