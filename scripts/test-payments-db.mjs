import assert from "node:assert/strict";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Always owns a temporary cluster; never accepts a remote database URL.
const bin = process.env.PG_BIN || "";
const pg = (name) => bin ? join(bin, name) : name;
const dir = mkdtempSync(join(tmpdir(), "eventos-pg-"));
let started = false;
const usd = process.argv.includes("--usd");
const contactos = process.argv.includes("--contactos");
try {
  execFileSync(pg("initdb"), ["-D", join(dir, "data"), "-U", "postgres",
    "-A", "trust", "-E", "UTF8", "--no-locale"], { stdio: "pipe" });
  execFileSync(pg("pg_ctl"), ["-D", join(dir, "data"), "-l", join(dir, "server.log"),
    "-o", `-h '' -p 5432 -k '${dir}'`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const sql = [
    "begin;",
    readFileSync("supabase/tests/fixtures/payments-schema.sql", "utf8"),
    readFileSync("supabase/tests/payments-setup.sql", "utf8"),
    ...(usd ? [
      readFileSync("supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql", "utf8"),
      readFileSync("supabase/migrations/20261021152307_evento_contactos.sql", "utf8"),
      `insert into pagos (id, evento_id, evento_servicio_id, fecha_pago, forma_pago, moneda, tipo_cambio, importe_moneda_original)
        values (pg_temp.id(199),pg_temp.id(30),pg_temp.id(50),'2026-10-01','efectivo_dolares','USD',null,10);
       create temporary table usd_legacy_before as select * from pagos where id=pg_temp.id(199);`,
      readFileSync("supabase/migrations/20261021155412_payments_manual_usd.sql", "utf8"),
      readFileSync("supabase/tests/fixtures/ipc-preview.sql", "utf8"),
      readFileSync("supabase/tests/payments-usd.sql", "utf8"),
      "rollback;",
    ] : contactos ? [
      "update public.eventos set cliente_contacto = E'  Texto anterior\\nSIN interpretar  ' where id = pg_temp.id(30);",
      readFileSync("supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql", "utf8"),
      readFileSync("supabase/migrations/20261021152307_evento_contactos.sql", "utf8"),
      readFileSync("supabase/tests/contactos.sql", "utf8"),
      "commit;",
    ] : [
    readFileSync("supabase/verification/preflight-payments.sql", "utf8"),
    `create temporary table original_functions as
      select oid, pg_get_functiondef(oid) as definition from pg_proc
      where oid in ('public.fn_validar_pago_evento()'::regprocedure,
        'public.fn_actualizar_totales_pagos()'::regprocedure);`,
    readFileSync("supabase/tests/payments-before.sql", "utf8"),
    readFileSync("supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql", "utf8"),
    readFileSync("supabase/tests/payments-after.sql", "utf8"),
    readFileSync("supabase/verification/identify-payment-discrepancies.sql", "utf8"),
    readFileSync("supabase/verification/recover-payment-ddl.sql", "utf8"),
    `select pg_temp.check_true(not exists (
      select 1 from original_functions where definition <> pg_get_functiondef(oid)
    ), 'recuperación repone las dos funciones previas');
    select pg_temp.check_true((select count(*) = 4 from pg_trigger
      where tgname in ('trg_audit_pagos', 'trg_audit_catering_contratos',
        'trg_audit_evento_servicios', 'trg_audit_eventos')),
      'recuperación repone los triggers de auditoría previos');
    select pg_temp.check_true((select reloptions @> array['security_invoker=true']
      from pg_class where oid = 'public.v_resumen_evento'::regclass),
      'recuperación conserva la vista segura');`,
    "rollback;",
    ]),
  ].join("\n");
  writeFileSync(join(dir, "suite.sql"), sql);
  const result = spawnSync(pg("psql"), ["-X", "-q", "-v", "ON_ERROR_STOP=1",
    "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres", "-f", join(dir, "suite.sql")],
  { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  console.log(`${(result.stderr.match(/PASS:/g) || []).length} comprobaciones SQL aprobadas.`);
  if (contactos) await checkConcurrentPrincipals();
  console.log("PostgreSQL: pruebas aprobadas; el cluster efímero se elimina al terminar.");
} catch (error) {
  console.error(error.message);
  if (error.code === "ENOENT") {
    console.error("Requiere PostgreSQL 17 local (initdb, pg_ctl, psql); configurar PG_BIN si no están en PATH.");
  }
  process.exitCode = 1;
} finally {
  if (started) execFileSync(pg("pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
  rmSync(resolve(dir), { recursive: true, force: true });
}

async function checkConcurrentPrincipals() {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres"];
  const id = "00000000-0000-0000-0000-000000000030";
  const actor = "00000000-0000-0000-0000-000000000002";
  const auth = `set role authenticated; select set_config('request.jwt.claim.sub','${actor}',false);`;
  const query = (sql) => execFileSync(pg("psql"), [...args, "-c", sql], { encoding: "utf8" }).trim().split("\n").at(-1);
  const context = JSON.parse(query(`${auth} select row_to_json(c) from public.evento_contactos_contexto('${id}') c;`));
  assert.equal(context.contactos.length, 2);
  assert.equal(context.contactos.filter((c) => c.es_principal).length, 1);
  const quoted = (s) => "'" + s.replaceAll("'", "''") + "'";
  const statements = [0, 1].map((principal) => {
    const rows = context.contactos.map((c, i) => ({
      id: c.id, nombre: c.nombre, telefono: c.telefono, correo: c.correo,
      relacion: c.relacion, observaciones: c.observaciones, es_principal: i === principal,
    }));
    return `begin; ${auth}
      select pg_advisory_xact_lock(hashtextextended('${id}',0));
      select pg_sleep(.2);
      select public.guardar_contactos_evento('${id}',${quoted(JSON.stringify(rows))}::jsonb,'${context.version}');
      commit;`;
  });
  const results = await Promise.all(statements.map((sql) => new Promise((resolve, reject) => {
    const child = spawn(pg("psql"), [...args, "-v", "VERBOSITY=verbose", "-c", sql]);
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr }));
  })));
  assert.equal(results.filter((r) => r.status === 0).length, 1);
  assert.ok(results.find((r) => r.status !== 0)?.stderr.includes("40001"));
  assert.equal(query(`select count(*) from public.evento_contactos where evento_id='${id}' and es_principal and deleted_at is null;`), "1");
  console.log("Concurrencia real: un guardado confirmado, otro rechazado por versión obsoleta y un único principal.");
}
