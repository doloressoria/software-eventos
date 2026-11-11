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
const balances = process.argv.includes("--balances");
const catering = process.argv.includes("--catering");
const ipcCron = process.argv.includes("--ipc-cron");
const ipc = ipcCron || process.argv.includes("--ipc");
const detallePagos = process.argv.includes("--detalle-pagos");
const cobertura = detallePagos || ipc || process.argv.includes("--cobertura");
const imputaciones = cobertura || process.argv.includes("--imputaciones");
const cheques = process.argv.includes("--cheques");
const expenses = process.argv.includes("--expenses");
try {
  execFileSync(pg("initdb"), ["-D", join(dir, "data"), "-U", "postgres",
    "-A", "trust", "-E", "UTF8", "--no-locale"], { stdio: "pipe" });
  execFileSync(pg("pg_ctl"), ["-D", join(dir, "data"), "-l", join(dir, "server.log"),
    "-o", `-h '' -p 5432 -k '${dir}'${ipcCron ? " -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c cron.use_background_workers=on" : ""}`, "-w", "start"], { stdio: "pipe" });
  started = true;
  const sql = [
    "begin;",
    readFileSync("supabase/tests/fixtures/payments-schema.sql", "utf8"),
    readFileSync("supabase/tests/payments-setup.sql", "utf8"),
    ...(cheques || imputaciones ? [
      "create role service_role nologin;",
      ...[
        "20261021145259_unblock_payments_and_summary_access",
        "20261021152307_evento_contactos",
        "20261021155412_payments_manual_usd",
        "20261106190930_align_service_balance_with_partial_vat",
        "20261106191328_atomic_catering_totals",
      ].map((name) => readFileSync(`supabase/migrations/${name}.sql`, "utf8")),
      readFileSync("supabase/tests/cheques-before.sql", "utf8"),
      readFileSync("supabase/migrations/20261110211110_acreditacion_cheques.sql", "utf8"),
      ...(imputaciones ? [
        readFileSync("supabase/migrations/20261110211132_imputaciones_cobros.sql", "utf8"),
      ] : []),
      readFileSync("supabase/tests/cheques.sql", "utf8"),
      ...(imputaciones ? [readFileSync("supabase/tests/imputaciones.sql", "utf8")] : []),
      ...(cobertura ? [
        readFileSync("supabase/verification/preflight-catering-por-personas.sql", "utf8"),
        readFileSync("supabase/migrations/20261110215027_catering_por_personas.sql", "utf8")
          .replace(/^begin;\n|\ncommit;\n$/g, ""),
        readFileSync("supabase/tests/catering-cobertura.sql", "utf8"),
        ...(detallePagos ? [readFileSync("supabase/tests/detalle-pagos.sql", "utf8")] : []),
        readFileSync("supabase/verification/postflight-catering-por-personas.sql", "utf8"),
      ] : []),
      ...(ipc ? [
        readFileSync("supabase/tests/fixtures/ipc-baseline.sql", "utf8"),
        readFileSync("supabase/verification/preflight-ipc-programado.sql", "utf8"),
        "create temporary table ipc_servicios_antes as select to_jsonb(s) as datos from public.evento_servicios s;",
        "create temporary table ipc_catering_antes as select to_jsonb(c) as datos from public.catering_contratos c;",
        readFileSync("supabase/migrations/20261110224729_ipc_vigencia_programada.sql", "utf8")
          .replace(/^begin;\n|\ncommit;\n$/g, ""),
        readFileSync("supabase/tests/ipc-programado.sql", "utf8"),
        ...(ipcCron ? [
          "create extension pg_cron;",
          readFileSync("supabase/migrations/20261110224738_programar_ipc_cron.sql", "utf8")
            .replace(/^begin;\n|\ncommit;\n$/g, ""),
        ] : []),
        readFileSync("supabase/verification/postflight-ipc-programado.sql", "utf8"),
        ...(ipcCron ? [readFileSync("supabase/verification/postflight-ipc-cron.sql", "utf8")] : []),
        "commit;",
      ] : ["rollback;"]),
    ] : catering ? [
      readFileSync("supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql", "utf8"),
      readFileSync("supabase/migrations/20261021152307_evento_contactos.sql", "utf8"),
      readFileSync("supabase/migrations/20261021155412_payments_manual_usd.sql", "utf8"),
      readFileSync("supabase/tests/catering-atomic-before.sql", "utf8"),
      readFileSync("supabase/migrations/20261106191328_atomic_catering_totals.sql", "utf8"),
      readFileSync("supabase/tests/catering-atomic-after.sql", "utf8"),
      "commit;",
    ] : expenses ? [
      readFileSync("supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql", "utf8"),
      readFileSync("supabase/migrations/20261021152307_evento_contactos.sql", "utf8"),
      readFileSync("supabase/migrations/20261021155412_payments_manual_usd.sql", "utf8"),
      readFileSync("supabase/tests/fixtures/expenses-schema.sql", "utf8"),
      readFileSync("supabase/tests/expense-soft-delete-before.sql", "utf8"),
      readFileSync("supabase/migrations/20261106190931_allow_authorized_expense_soft_delete.sql", "utf8"),
      readFileSync("supabase/tests/expense-soft-delete-after.sql", "utf8"),
      "rollback;",
    ] : balances ? [
      readFileSync("supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql", "utf8"),
      readFileSync("supabase/migrations/20261021152307_evento_contactos.sql", "utf8"),
      readFileSync("supabase/migrations/20261021155412_payments_manual_usd.sql", "utf8"),
      readFileSync("supabase/tests/service-balance-before.sql", "utf8"),
      readFileSync("supabase/migrations/20261106190930_align_service_balance_with_partial_vat.sql", "utf8"),
      readFileSync("supabase/tests/service-balance-after.sql", "utf8"),
      "rollback;",
    ] : usd ? [
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
  if (catering) await checkConcurrentCatering();
  if (ipc) { checkIpcTypes(); await checkConcurrentIpc(); }
  if (ipcCron) await checkIpcCron();
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

async function checkConcurrentCatering() {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres"];
  const id = "00000000-0000-0000-0000-000000000060";
  const eventId = "00000000-0000-0000-0000-000000000030";
  const actor = "00000000-0000-0000-0000-000000000001";
  const statements = [10, 20].map((amount) => `insert into catering_items
    (catering_contrato_id,categoria,descripcion,precio_unitario,pax)
    values('${id}','adicional_otros','Concurrente',${amount},1);`);
  statements.push(...[100, 200].map((amount) => `insert into pagos
    (catering_contrato_id,evento_id,fecha_pago,forma_pago,importe_moneda_original)
    values('${id}','${eventId}','2026-12-01','efectivo_pesos',${amount});`));
  await Promise.all(statements.map((statement) => new Promise((resolve, reject) => {
    const child = spawn(pg("psql"), [...args, "-c", `begin; set local role authenticated;
      select set_config('request.jwt.claim.sub','${actor}',true);
      ${statement} select pg_sleep(.2); commit;`]);
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve() : reject(new Error(stderr)));
  })));
  const row = execFileSync(pg("psql"), [...args, "-c", `select total_con_iva,total_pagado,saldo_pendiente
    from catering_contratos where id='${id}';`], { encoding: "utf8" }).trim();
  assert.equal(row, "1875.50|300.00|1575.50");
  console.log("Concurrencia real: dos adicionales y dos pagos conservan total, cobrado y saldo.");
}

async function checkConcurrentIpc() {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres"];
  const run = (sql) => execFileSync(pg("psql"), [...args, "-c", sql], { encoding: "utf8" }).trim();
  run(`set eventos.test_dia = '2026-11-20';
    select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
    select public.programar_ipc('2027-02-01','2026-11-20',10);`);
  await Promise.all([1, 2].map(() => new Promise((resolve, reject) => {
    const child = spawn(pg("psql"), [...args, "-c", `begin; set local eventos.test_dia = '2026-11-20';
      select software_eventos_private.ejecutar_ipc_programados(); select pg_sleep(.2); commit;`]);
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve() : reject(new Error(stderr)));
  })));
  assert.equal(run(`select count(*) from public.ipc_programaciones where periodo='2027-02-01' and estado='aplicado'`), "1");
  assert.equal(run(`select count(*) from (select evento_servicio_id,catering_contrato_id from public.ipc_aplicaciones
    where programacion_id=(select id from public.ipc_programaciones where periodo='2027-02-01')
    group by evento_servicio_id,catering_contrato_id having count(*)<>1) duplicados`), "0");
  assert.equal(run(`select count(*) > 0 and bool_and(incremento=round(base_ajustada*.1,2)) from public.ipc_aplicaciones
    where programacion_id=(select id from public.ipc_programaciones where periodo='2027-02-01')`), "t");
  console.log("Concurrencia real: dos workers aplican una sola vez cada destino del período.");
  run(`set eventos.test_dia='2026-11-20';
    select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
    select programar_ipc('2027-03-01','2026-11-20',10);`);
  let ready;
  const paymentReady = new Promise((resolve) => { ready = resolve; });
  const payment = new Promise((resolve, reject) => {
    const child = spawn(pg("psql"), [...args, "-c", `begin; set local eventos.test_dia='2026-11-20';
      select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
      insert into pagos(evento_id,evento_servicio_id,forma_pago,fecha_pago,importe_moneda_original)
        select evento_id,id,'efectivo_pesos','2026-11-20',round(saldo_pendiente,2)
        from evento_servicios where id='00000000-0000-0000-0000-000000000370';
      select 'ipc-payment-ready'; select pg_sleep(.5); commit;`]);
    let stderr = "";
    child.stdout.on("data", (data) => { if (data.toString().includes("ipc-payment-ready")) ready(); });
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", (error) => { ready(); reject(error); });
    child.on("close", (status) => {
      ready();
      if (status === 0) resolve();
      else reject(new Error(stderr));
    });
  });
  await paymentReady;
  const worker = new Promise((resolve, reject) => {
    const child = spawn(pg("psql"), [...args, "-c", `set eventos.test_dia='2026-11-20'; select software_eventos_private.ejecutar_ipc_programados();`]);
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", (data) => { stderr += data; });
    child.on("error", reject);
    child.on("close", (status) => status === 0 ? resolve() : reject(new Error(stderr)));
  });
  await Promise.all([payment, worker]);
  assert.equal(run(`select base_ajustada=0 and incremento=0 from ipc_aplicaciones
    where evento_servicio_id='00000000-0000-0000-0000-000000000370'
    and programacion_id=(select id from ipc_programaciones where periodo='2027-03-01')`), "t");
  console.log("Concurrencia real: IPC espera un cobro en curso y ajusta el saldo confirmado al obtener el bloqueo.");
}

async function checkIpcCron() {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres"];
  const query = (sql) => execFileSync(pg("psql"), [...args, "-c", sql], { encoding: "utf8" }).trim();
  assert.equal(query("select schedule || '|' || command from cron.job where jobname='software-eventos-aplicar-ipc'"),
    "* * * * *|select software_eventos_private.ejecutar_ipc_programados()");
  query(`create or replace function software_eventos_private.dia_argentina(p_instante timestamptz default statement_timestamp())
    returns date language sql stable set search_path='' as $$select '2026-11-20'::date$$;
    select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
    select public.programar_ipc('2027-04-01','2026-11-20',10);
    select cron.alter_job(jobid, schedule => '1 second') from cron.job where jobname='software-eventos-aplicar-ipc';`);
  const deadline = Date.now() + 15000;
  while (query("select estado from ipc_programaciones where periodo='2027-04-01'") !== "aplicado") {
    assert.ok(Date.now() < deadline, "Cron no ejecuto el IPC dentro de 15 segundos");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(query(`select count(*)>0 from cron.job_run_details r join cron.job j using(jobid)
    where j.jobname='software-eventos-aplicar-ipc' and r.status='succeeded'`), "t");
  console.log("Cron real: migracion registra la tarea y pg_cron ejecuta IPC sin JWT.");
}

function checkIpcTypes() {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
    "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres"];
  const rows = JSON.parse(execFileSync(pg("psql"), [...args, "-c", `select json_agg(c) from (
    select table_name, array_agg(column_name order by column_name) as columns
    from information_schema.columns where table_schema='public' and table_name in
      ('ipc_programaciones','ipc_aplicaciones','v_ipc_programaciones','evento_servicios','catering_contratos',
       'v_evento_servicios_acreditados','v_catering_acreditado') group by table_name) c`], { encoding: "utf8" }));
  const source = readFileSync("src/types/database.types.ts", "utf8");
  for (const row of rows) {
    const start = source.indexOf(`      ${row.table_name}: {`);
    assert.ok(start >= 0, row.table_name);
    const block = source.slice(start).split("        Row: {")[1].split("        }")[0];
    const names = [...block.matchAll(/^          (\w+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(names, row.columns, `${row.table_name}: tipos y catalogo deben tener las mismas columnas`);
  }
  console.log("Contratos TypeScript: columnas de IPC, tablas y vistas coinciden con el catalogo aislado.");
}
