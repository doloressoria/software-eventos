export const minimumPasswordLength = 8;

export function validateNewPassword(password: unknown, confirmation: unknown) {
  if (typeof password !== "string" || password.length < minimumPasswordLength) {
    return "Elegí una contraseña de al menos 8 caracteres.";
  }
  if (new TextEncoder().encode(password).length > 72) {
    return "La contraseña es demasiado larga. Elegí una más corta.";
  }
  if (password !== confirmation) return "Las contraseñas nuevas no coinciden.";
  return null;
}
