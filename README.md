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

Never expose `SUPABASE_SERVICE_ROLE_KEY` in client components, browser bundles or
public logs.

## Administrative User Management

Administrators manage users at `/admin/usuarios` and configure roles at
`/admin/roles`. A role enables modules; venue access remains assigned per user,
so two users with the same role can work on different venues. Creating a user uses the
server-only Supabase Admin API and generates a strong temporary password. The
password is displayed once after creation, is never stored in `public.usuarios`
or `audit_log`, and must be communicated through a secure channel.

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

This repository contains only the initial application shell, Supabase helpers,
route placeholders and migration scaffolding. The production schema and business
logic still need validation before implementation.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
