import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendPasswordSetupEmail(userId: string, email: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.USUARIOS_EMAIL_FROM;
  const siteUrl = process.env.APP_URL;
  if (!apiKey || !from || !siteUrl) return false;

  try {
    const changePasswordUrl = new URL("/definir-contrasena", siteUrl);
    if (
      changePasswordUrl.username || changePasswordUrl.password ||
      (changePasswordUrl.protocol !== "https:" && changePasswordUrl.origin !== "http://localhost:3000")
    ) {
      return false;
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error || data.user?.id !== userId || !data.properties?.hashed_token) return false;

    changePasswordUrl.hash = new URLSearchParams({ token_hash: data.properties.hashed_token }).toString();

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Elegí tu contraseña de Software Eventos",
        text: [
          "Abrí este enlace para elegir tu contraseña de Software Eventos.",
          changePasswordUrl.toString(),
          "El enlace vence y se puede usar una sola vez. Si recibiste varios, usá el más reciente.",
        ].join("\n\n"),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
