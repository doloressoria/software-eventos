import "server-only";
import { createTransport } from "nodemailer";
import { createAdminClient } from "@/lib/supabase/admin";

export async function sendPasswordSetupEmail(userId: string, email: string) {
  const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  const from = process.env.USUARIOS_EMAIL_FROM?.trim();
  const siteUrl = process.env.APP_URL;
  if (!password || !from || !siteUrl) return false;

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

    const mailer = createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: from, pass: password },
    });
    const result = await mailer.sendMail({
      signal: AbortSignal.timeout(20_000),
      from: { name: "Software Eventos", address: from },
      to: { name: "", address: email },
      subject: "Elegí tu contraseña de Software Eventos",
      text: [
        "Abrí este enlace para elegir tu contraseña de Software Eventos.",
        changePasswordUrl.toString(),
        "El enlace vence y se puede usar una sola vez. Si recibiste varios, usá el más reciente.",
      ].join("\n\n"),
    });
    return result.accepted.length === 1;
  } catch {
    return false;
  }
}
