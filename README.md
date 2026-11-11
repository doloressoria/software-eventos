# Software Eventos

Production-ready web application foundation for managing events, venues,
catering operations, sellers, payments, balances, debtors, audit logs and
financial reports.

The app has configurable operational roles:

- `Administrador`: manages users, roles, venues, events, payments, audit logs
  and reports.
- Roles operativos: choose whether each module can be viewed or managed.
  Users retain their own venue assignments, which limit event access.

## Tech Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth, PostgreSQL and Row Level Security
- Supabase migrations
- Vercel deployment
- pnpm

## Local Setup

Install dependencies:

```bash
pnpm install
```

Copy environment variables:

```bash
cp .env.example .env.local
```

Fill in `.env.local` with the Supabase project values.

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anonymous key for browser and server clients using RLS.
- `SUPABASE_SERVICE_ROLE_KEY`: Server-only key required by administrative user
  creation and Auth synchronization.
- `APP_URL`: Public application origin used in welcome emails. Use the HTTPS
  production URL or `http://localhost:3000` for local development.
- `GMAIL_APP_PASSWORD`: Server-only Google app password for the sending account.
- `USUARIOS_EMAIL_FROM`: Gmail address used as both the sender and SMTP login.

Never expose `SUPABASE_SERVICE_ROLE_KEY` in client components, browser bundles or
public logs.

## Administrative User Management

Administrators manage users at `/admin/usuarios` and configure roles at
`/admin/roles`. A role enables modules; venue access remains assigned per user,
so two users with the same role can work on different venues. Creating an active
user emails a one-time link to **Elegí tu contraseña**. The recipient chooses a
password directly and then signs in. Signed-in users can open **Cambiar contraseña**
from the account menu at the bottom of the sidebar.

To enable welcome emails, configure `APP_URL` and `USUARIOS_EMAIL_FROM` in the
deployment environment. Enable 2-Step Verification on the sending account and
store its Google app password as `GMAIL_APP_PASSWORD` in the deployment's secrets.
Redeploy to apply the settings. If sending fails or a link expires, open the
user's edit page and choose **Enviar enlace para definir contraseña**. For an
inactive user, activate the account before sending the link.

Apply the user-management migration before deploying the application:

```bash
supabase db push
```

The migration adds transactional RPCs for profiles and salon assignments,
protects the last active administrator, records user changes in the existing
audit log, and removes direct authenticated writes to `usuarios` and
`usuario_salon`. Inactive users are also banned through Supabase Auth; the
middleware checks `usuarios.activo` on every application request as the primary
application-level control. Administrators do not need salon assignments; any
legacy assignments are removed when an administrator profile is saved.

## Administrative Audit Log

Administrators can inspect the immutable audit history at `/admin/auditoria`.
The screen applies date, user, action, entity and record filters in Supabase,
uses 25-row server-side pages, and renders field-level before/after comparisons.

Apply `supabase/migrations/20260713110000_harden_audit_log.sql` before deploying
this screen. The migration makes `audit_log` read-only for active administrators
and records changes with PostgreSQL triggers on events, event services, payments,
expenses, catering, users, venue assignments, venues, the service catalog and
monthly service prices. The trigger obtains the actor from `auth.uid()`, ignores
updates that only change `updated_at`, and recursively strips password, token,
secret, credential and session-like fields.

The repository has unit coverage for audit presentation, combined filter parsing
and pagination. Database/RLS verification requires the local Supabase stack:

1. Start Docker and run `pnpm supabase:start` followed by `pnpm supabase:reset`.
2. As an administrator, create and edit an event, soft-delete it, change a user
   role/status and add/remove a venue assignment; confirm each entry and actor in
   `/admin/auditoria`.
3. Sign in as a seller and confirm the route redirects to `/dashboard` and a
   direct `select` from `audit_log` returns no rows/permission denied.
4. As an authenticated user, confirm direct insert, update and delete operations
   on `audit_log` are denied, while trigger-generated entries still succeed.
5. Update only `updated_at` and confirm no entry is created; write a test row with
   a token/password-like JSON key in an audited table and confirm it is stripped.

## Start Next.js

```bash
pnpm dev
```

Open `http://localhost:3000`.

After signing in, open the account menu at the bottom of the sidebar and choose
**Cerrar sesión** to return to the login screen.

## Start Supabase Locally

The local Supabase stack requires Docker.

```bash
pnpm supabase:start
```

Stop it with:

```bash
pnpm supabase:stop
```

## Reset Local Database

```bash
pnpm supabase:reset
```

This reapplies migrations and runs `supabase/seed.sql`.

## Add Migrations

Create SQL migration files in `supabase/migrations/` with ordered names, for
example:

```bash
supabase migration new create_events_tables
```

Do not edit migrations that have already been applied to shared environments.
Add a new migration instead.

## Generate Supabase Types

After starting Supabase locally and applying migrations:

```bash
pnpm supabase:types
```

The generated types are written to `src/types/database.types.ts`.

The command replaces the type file only after successful generation.

## Focused Payment Verification

In **Eventos → Ingresos**, **Descargar detalle de pagos** exports the complete
active payment history as an email-ready XLSX, with separate guarantees,
destination allocations, historical USD amounts and catering PAX coverage.
See [payment history export and manual release checks](docs/detalle-pagos-excel.md).
Run `pnpm test:detalle-pagos:db` for the combined fictional-data scenario in an
isolated PostgreSQL cluster. This feature requires no new migration.

See [verification findings and application procedure](docs/verificacion-bloqueos.md)
before applying the payment/security migration. The reference schema is not a
replacement for the live database, and this checkout lacks the historical baseline
needed for a full local reset.

`pnpm test` runs unit tests. `pnpm test:db` runs the focused payment suite in a
temporary PostgreSQL 17 cluster with fictional records, real RLS and triggers.
It requires `initdb`, `pg_ctl` and `psql` in PATH, or `PG_BIN` pointing to their
directory. It never connects to the shared database and needs neither Docker nor
a full schema rebuild.

## Event Contacts

See [contacts and staging verification](docs/contactos-y-staging.md) for the
separate contacts migration, permissions, legacy-text transition and deployment
order. Apply the database migrations before deploying this UI.

`pnpm test:contactos:db` uses the same temporary PostgreSQL runner to test contacts,
including rollback and concurrent changes of the primary contact. It requires
PostgreSQL 17 binaries in PATH or the `PG_BIN` directory, and never connects to
the shared database.

## Commercial Detail Excel Export

Event and catering details include **Exportar a Excel**. Downloads use the saved
commercial detail and independent screen/record permissions. Services and catering
remain separate when their charges cannot be proven independent. Differences
between stored totals and the current breakdown are labeled explicitly.

See [mapping, financial sources and verification](docs/exportacion-comercial-excel.md).
Run `pnpm excel:examples` to regenerate the five fictional examples in
`outputs/commercial-excel/`. Private templates under `resources/commercial-excel/`
are included by the Next.js server trace; the original customer workbooks must
remain outside the repository and `public`.

## Monthly Service Prices Excel

Admins can import monthly service prices from `/admin/precios-servicios`.
The first worksheet must use these columns:

| mes | año | salon | servicio | precio_base | iva_porcentaje | moneda |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | 2026 | Salon Central | Salon | 1200000 | 21 | ARS |
| 6 | 2026 |  | Tecnica Pack | 350000 | 21 | ARS |

Required columns are `mes`, `año`, `servicio` and `precio_base`. `salon` is
required for the `Salon` service and optional for packs. Supported currencies
are `ARS`, `USD` and `EUR`; empty `moneda` defaults to `ARS`, and empty
`iva_porcentaje` defaults to `0`.

## Connect To Vercel

1. Push this repository to GitHub.
2. Import the GitHub repository in Vercel.
3. Set the framework preset to Next.js.
4. Add the required Supabase environment variables in Vercel Project Settings.
5. Deploy from the main production branch.

## Deployment Notes

- Keep database changes versioned in Supabase migrations.
- Use Supabase RLS for authorization rules.
- Do not hardcode credentials or service role keys.
- Run `pnpm lint`, `pnpm typecheck` and `pnpm build` before merging.
- Generate fresh Supabase types after schema changes.

## Current Status

Events, contacts, event payments/expenses, catering, venue management, configurable
roles, audit, reports and commercial Excel exports are implemented. The general
`/pagos` screen remains a placeholder; use event/catering income screens.

## Hands-on lab verification

See [QA results, limitations and pending release work](docs/qa-lab-20261106.md)
and the [participant script](docs/guion-hands-on-lab.md). Local frontend execution
uses the database configured in `.env.local`; it does not isolate production data.
This checkout lacks the complete Supabase baseline, `config.toml` and seed, so
the local start/reset instructions above require that baseline first. Do not use
a global reset or migration push against the shared project.

Three corrections were applied to the shared database on 2026-11-06:
`20261106190930_align_service_balance_with_partial_vat.sql` aligns generated
service balances with partial VAT; `20261106190931_allow_authorized_expense_soft_delete.sql`
unblocks expense soft deletion while retaining venue, role and active-user limits;
`20261106191328_atomic_catering_totals.sql` keeps catering totals and price/PAX
changes in the source transaction, and creates contracts with their initial price
through an invoker RPC protected by the existing RLS policies.
See the [release verification](docs/publicacion-lab-20261106.md) for deployment status.
The first rewrites existing generated balances; column types and generated/write
restrictions remain unchanged. The second permits scoped reads of deleted expenses
needed by PostgreSQL UPDATE checks; application listings still filter active rows.
The third preserves the existing commercial formula and does not backfill old
contracts. Catering actions no longer perform a second HTTP recalculation.

```bash
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:balances:db
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:egresos:db
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:catering:db
```

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

### Pagos en dólares con cotización manual

Los ingresos de eventos y catering admiten efectivo y transferencia en ARS/USD;
los saldos y reportes siguen en ARS. Cada pago conserva su cotización histórica.
La implementación requiere la migración `20261021155412_payments_manual_usd.sql`
después de las correcciones previas de pagos y contactos. Consultar
[orden de SQL, verificación y pruebas de interfaz](docs/pagos-usd.md) antes de
aplicar cambios; no usar push/reset global con el baseline incompleto.

```bash
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:usd:db
```

El comando prueba datos ficticios en PostgreSQL efímero y no acepta una conexión
remota. No sustituye el recorrido HTTP con Auth real en staging.

### Publicación del 2026-10-21

Ver [registro de aplicación y verificaciones](docs/publicacion-20261021.md).
Las tres migraciones de pagos/contactos/USD fueron aplicadas al proyecto configurado
antes de publicar la UI. Los tipos de `public` se regeneraron contra la base final
con la herramienta oficial MCP, comprobando que el resultado fuera completo.
Conservar las anotaciones de columnas generadas como `never` y el argumento nullable
de creación de roles al regenerarlos: esas restricciones no las expresa el generador.

### Acreditación automática de cheques

El [runbook de cheques](docs/acreditacion-cheques.md) explica la fecha local,
la diferencia con la fecha de contrato, las pruebas aisladas y el orden de
aplicación en Supabase SQL Editor.

### Imputaciones de cobros del evento

El [runbook de imputaciones](docs/imputaciones-cobros.md) describe la
compatibilidad con pagos históricos, el orden de publicación en SQL Editor
y la prueba aislada `pnpm test:imputaciones:db`.

Los [cobros de catering por personas](docs/catering-por-personas.md) tienen un
runbook de publicación manual y la prueba aislada `pnpm test:cobertura:db`.

### IPC programado por fecha de vigencia

El módulo permite separar el período del índice de su vigencia, previsualizar
saldos y programar la ejecución automática en fecha argentina. Incluye saldos
parcialmente pagados y catering PAX de eventos confirmados. Los externos quedan
excluidos. Ver [SQL en orden, compatibilidad y límites históricos](docs/ipc-programado.md)
antes de publicar. No recuperar una vigencia pasada usando el saldo actual.

```sh
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:ipc:db
```
