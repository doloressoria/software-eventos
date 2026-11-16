import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:net";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
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
const recibos = process.argv.includes("--recibos");
const detallePagos = process.argv.includes("--detalle-pagos");
const cobertura = recibos || detallePagos || ipc || process.argv.includes("--cobertura");
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
      ...(cobertura ? [
        readFileSync("supabase/tests/fixtures/ipc-baseline.sql", "utf8"),
        readFileSync("supabase/verification/preflight-ipc-programado.sql", "utf8"),
        "create temporary table ipc_servicios_antes as select to_jsonb(s) as datos from public.evento_servicios s;",
        "create temporary table ipc_catering_antes as select to_jsonb(c) as datos from public.catering_contratos c;",
        readFileSync("supabase/migrations/20261110224729_ipc_vigencia_programada.sql", "utf8")
          .replace(/^begin;\n|\ncommit;\n$/g, ""),
        ...(ipc ? [readFileSync("supabase/tests/ipc-programado.sql", "utf8")] : []),
        ...(ipcCron ? [
          "create extension pg_cron;",
          readFileSync("supabase/migrations/20261110224738_programar_ipc_cron.sql", "utf8")
            .replace(/^begin;\n|\ncommit;\n$/g, ""),
        ] : []),
        readFileSync("supabase/verification/postflight-ipc-programado.sql", "utf8"),
        ...(ipcCron ? [readFileSync("supabase/verification/postflight-ipc-cron.sql", "utf8")] : []),
        ...(cobertura ? [
          readFileSync("supabase/tests/catering-fiscal-before.sql", "utf8"),
          readFileSync("supabase/migrations/20261115231648_catering_iva_separado_usd.sql", "utf8")
            .replace(/^begin;\n|\ncommit;\n$/g, ""),
          readFileSync("supabase/tests/catering-fiscal.sql", "utf8"),
        ] : []),
        ...(recibos ? [
          "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text,name text);",
          readFileSync("supabase/verification/preflight-recibos.sql", "utf8"),
          readFileSync("supabase/migrations/20261116222142_recibos_persistentes_y_excedentes.sql", "utf8").replace(/^begin;\n|\ncommit;\n$/g, ""),
          readFileSync("supabase/tests/recibos.sql", "utf8"),
          "create temporary table recibos_v1_antes as select id,snapshot,fuente from public.recibos;",
          readFileSync("supabase/migrations/20261116230238_recibo_formato_talonario.sql", "utf8").replace(/^begin;\n|^commit;\n/gm, ""),
          readFileSync("supabase/tests/recibo-talonario.sql", "utf8"),
          readFileSync("supabase/verification/postflight-recibos.sql", "utf8"),
        ] : []),
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
  if (cobertura) { checkIpcTypes(); await checkConcurrentFiscal(); }
  if (ipc) await checkConcurrentIpc();
  if (ipcCron) await checkIpcCron();
  if (recibos) { await checkConcurrentRecibos(); checkReciboTypes(); }
  if (recibos && process.argv.includes("--http")) await checkRecibosHttp();
  console.log("PostgreSQL: pruebas aprobadas; el cluster efímero se elimina al terminar.");
} catch (error) {
  console.error(error.message);
  if (!started && existsSync(join(dir,"server.log"))) console.error(readFileSync(join(dir,"server.log"),"utf8").trim());
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
       'v_evento_servicios_acreditados','v_catering_acreditado','catering_cobro_componentes','v_catering_tarifas','v_catering_costos') group by table_name) c`], { encoding: "utf8" }));
  const source = readFileSync("src/types/database.types.ts", "utf8");
  for (const row of rows) {
    const start = source.indexOf(`      ${row.table_name}: {`);
    assert.ok(start >= 0, row.table_name);
    const block = source.slice(start).split("        Row: {")[1].split("        }")[0];
    const names = [...block.matchAll(/^          (\w+):/gm)].map((m) => m[1]).sort();
    assert.deepEqual(names, row.columns, `${row.table_name}: tipos y catalogo deben tener las mismas columnas`);
  }
  console.log("Contratos TypeScript: columnas de IPC y catering coinciden con el catálogo aislado.");
}

async function checkConcurrentFiscal() {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose",
    "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres"];
  const run = (sql) => execFileSync(pg("psql"), [...args, "-c", sql], { encoding: "utf8" }).trim().split("\n").at(-1);
  const contract = run("select catering from public.fiscal_concurrencia_prueba");
  const auth = "set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);";
  const race = async (base, capital, iva, lines, expectedError) => {
    const statements = [1,2].map((n) => `begin; ${auth}
      set local eventos.test_dia='2026-11-21';
      select guardar_pago_por_personas('${contract}','00000000-0000-0000-0000-${String(base+n).padStart(12,"0")}',
        '{"fecha_pago":"2026-11-21","forma_pago":"transferencia","moneda":"ARS","tipo_cambio":1,"importe_moneda_original":${capital+iva},"es_garantia":false,"capital_ars":${capital},"iva_ars":${iva}}', '${lines}');
      select pg_sleep(.15); commit;`);
    const results = await Promise.all(statements.map((sql) => new Promise((resolve,reject) => {
      const child = spawn(pg("psql"),[...args,"-c",sql]);
      let stderr = "";
      child.stdout.resume();
      child.stderr.on("data", data => { stderr += data; });
      child.on("error",reject);
      child.on("close",status => resolve({status,stderr}));
    })));
    assert.equal(results.filter(r => r.status === 0).length,1,JSON.stringify(results));
    assert.ok(results.find(r => r.status !== 0)?.stderr.includes(expectedError),JSON.stringify(results));
  };
  await race(950,0,21000,"[]","P2004");
  await race(960,100000,0,'[{"categoria":"adultos","cantidad":1,"precio_aplicado":100000}]',"P2003");
  assert.equal(run(`set eventos.test_dia='2026-11-21'; select total_pagado||'|'||saldo_pendiente||'|'||iva_pendiente from v_catering_acreditado where id='${contract}'`),"121000.00|0.00|0.00");
  assert.equal(run(`select count(*) from pagos where catering_contrato_id='${contract}'`),"2");
  console.log("Concurrencia real: un único cobro de IVA y una única cobertura PAX; los intentos simultáneos duplicados se rechazan.");
}

async function checkConcurrentRecibos() {
  const args = ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-h", dir, "-p", "5432", "-U", "postgres", "-d", "postgres"];
  const sql = `begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
    select public.emitir_recibo('00000000-0000-0000-0000-000000001111'); select pg_sleep(.1); commit;`;
  const results = await Promise.all([0,1].map(() => new Promise((resolve,reject) => {
    const child = spawn(pg("psql"),[...args,"-c",sql]);
    let stdout="", stderr="";
    child.stdout.on("data",d=>stdout+=d); child.stderr.on("data",d=>stderr+=d);
    child.on("error",reject); child.on("close",status=>status===0 ? resolve(stdout) : reject(new Error(stderr)));
  })));
  assert.equal(results[0],results[1]);
  assert.equal(execFileSync(pg("psql"),[...args,"-c",`select count(*) from public.recibos where pago_id='00000000-0000-0000-0000-000000001111'`],{encoding:"utf8"}).trim(),"1");
  console.log("Concurrencia real: dos emisiones devuelven el mismo recibo y una sola numeración.");
}

function checkReciboTypes() {
  const args = ["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h",dir,"-p","5432","-U","postgres","-d","postgres"];
  const tables = JSON.parse(execFileSync(pg("psql"), [...args,"-c", `select json_agg(t) from (select table_name,array_agg(column_name order by column_name) as columns from information_schema.columns where table_schema='public' and table_name in ('recibos','recibo_emisores') group by table_name) t`],{encoding:"utf8"}));
  const source=readFileSync("src/types/database.types.ts","utf8");
  for (const table of tables) {
    const block=source.split(`      ${table.table_name}: {`)[1].split("Row: {")[1].split("}")[0];
    const names=[...block.matchAll(/(\w+):/g)].map(m=>m[1]).sort();
    assert.deepEqual(names,table.columns,`${table.table_name}: tipos coinciden con catálogo aislado`);
  }
  console.log("Tipos de recibos/emisores: todas las columnas coinciden con el catálogo aislado.");
}

async function checkRecibosHttp() {
  assert.ok(process.env.POSTGREST_BIN, "Configurar POSTGREST_BIN con PostgREST 14.5 o superior");
  const args=["-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-h",dir,"-p","5432","-U","postgres","-d","postgres"];
  const query=sql=>execFileSync(pg("psql"),[...args,"-c",`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false); ${sql}`],{encoding:"utf8"}).trim();
  query(`select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
    create or replace function software_eventos_private.dia_argentina(p_instante timestamptz default statement_timestamp())
    returns date language sql stable set search_path='' as $$select '2026-11-21'::date$$;
    create or replace function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub',nullif(current_setting('request.jwt.claim.sub',true),''))::uuid $$;
    insert into pagos(id,evento_id,evento_servicio_id,fecha_pago,forma_pago,moneda,tipo_cambio,importe_moneda_original,registrado_por)
    values('00000000-0000-0000-0000-000000001191','00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000050','2026-11-16','transferencia','ARS',1,500,'00000000-0000-0000-0000-000000000002');`);
  const gate=createServer();
  await new Promise(resolve=>gate.listen(0,"127.0.0.1",resolve));
  const port=gate.address().port;
  await new Promise(resolve=>gate.close(resolve));
  const secret="isolated-fictional-receipts-jwt-secret-at-least-32-bytes";
  const jwt=actor=>{
    const part=value=>Buffer.from(JSON.stringify(value)).toString("base64url");
    const body=part({alg:"HS256",typ:"JWT"})+"."+part({role:"authenticated",sub:`00000000-0000-0000-0000-${String(actor).padStart(12,"0")}`,exp:Math.floor(Date.now()/1000)+300});
    return body+"."+createHmac("sha256",secret).update(body).digest("base64url");
  };
  let logs="";
  const api=spawn(process.env.POSTGREST_BIN,[],{env:{...process.env,PGRST_DB_URI:`postgresql://postgres@/postgres?host=${encodeURIComponent(dir)}&port=5432`,PGRST_DB_SCHEMAS:"public",PGRST_DB_ANON_ROLE:"anon",PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:"127.0.0.1",PGRST_SERVER_PORT:String(port)},stdio:["ignore","ignore","pipe"]});
  api.stderr.on("data",d=>logs+=d);
  api.on("error",error=>logs+=error.message);
  const url=`http://127.0.0.1:${port}`;
  const call=(path,actor,method="GET",body)=>fetch(url+path,{method,headers:{...(actor?{Authorization:`Bearer ${jwt(actor)}`}:{}) ,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
  try {
    const deadline=Date.now()+10000;
    while(true) {
      try { const response=await call("/",1); if(response.ok) break; } catch { /* Aún está iniciando el servidor local. */ }
      assert.ok(Date.now()<deadline,`PostgREST no inició: ${logs}`);
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal((await call("/recibos")).status,401);
    assert.deepEqual(await (await call("/recibos",3)).json(),[]);
    const partial="/recibos?pago_id=eq.00000000-0000-0000-0000-000000001112";
    assert.deepEqual(await (await call(partial,4)).json(),[]);
    assert.equal((await call("/rpc/previsualizar_recibo",4,"POST",{p_pago:"00000000-0000-0000-0000-000000001112"})).status,403);
    const id="00000000-0000-0000-0000-000000001191";
    const preview=await call("/rpc/previsualizar_recibo",2,"POST",{p_pago:id});
    assert.equal(preview.status,200); assert.equal((await preview.json()).version,2);
    const issued=await Promise.all([0,1].map(async()=>{
      const response=await call("/rpc/emitir_recibo",2,"POST",{p_pago:id});
      assert.equal(response.status,200); return response.json();
    }));
    assert.equal(issued[0],issued[1]);
    let docs=await (await call(`/recibos?pago_id=eq.${id}&order=revision`,2)).json();
    assert.equal(docs.length,1);
    const original=docs[0].snapshot;
    const changed=await call(`/pagos?id=eq.${id}`,2,"PATCH",{importe_moneda_original:600});
    assert.equal(changed.status,204);
    docs=await (await call(`/recibos?pago_id=eq.${id}&order=revision`,2)).json();
    assert.equal(docs.length,2); assert.deepEqual(docs[0].snapshot,original);
    assert.equal(docs[1].anterior_id,docs[0].id); assert.equal(docs[1].snapshot.pago.importe_en_pesos,600);
    query(`update catering_contratos set pax_adultos=89 where id='00000000-0000-0000-0000-000000001110'`);
    const reassigned=await call("/rpc/reasignar_excedente_catering",1,"POST",{
      p_catering:"00000000-0000-0000-0000-000000001110",p_pago:"00000000-0000-0000-0000-000000001112",p_categoria:"adultos",p_cantidad:1,
      p_destino:"00000000-0000-0000-0000-000000000050",p_es_catering:false,p_liberada_esperada:10,p_importe_esperado:200,
    });
    assert.equal(reassigned.status,204,await reassigned.text());
    const revisions=await (await call(partial+"&order=revision",1)).json();
    assert.equal(revisions.length,3); assert.equal(revisions[2].tipo,"modificacion");
    console.log("HTTP real PostgREST: JWT firmado ficticio, RLS, preview, emisión concurrente, corrección y sobrecarga de reasignación aprobados; Supabase Auth no está incluido en esta prueba.");
  } finally {
    if (api.pid && api.exitCode === null && api.signalCode === null) {
      const closed = new Promise(resolve=>api.once("close",resolve));
      api.kill("SIGTERM"); await closed;
    }
  }
}
