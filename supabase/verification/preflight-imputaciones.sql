-- Read-only. Review this after verifying the cheque runbook, before installing
-- the split migration. Expected: PostgreSQL >=15 and no split objects yet.
select current_setting('server_version_num')::int >= 150000 as postgres_compatible,
  to_regclass('public.pago_imputaciones') as tabla_imputaciones_preexistente,
  to_regclass('public.v_pago_imputaciones') as vista_imputaciones_preexistente,
  to_regprocedure('software_eventos_private.sincronizar_cheques()') as sincronizador_cheques,
  to_regprocedure('public.audit_row_change()') as funcion_auditoria;

select c.relname, c.reloptions, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('pagos','eventos','evento_servicios','catering_contratos',
  'v_evento_servicios_acreditados','v_catering_acreditado','v_resumen_evento')
order by c.relname;

-- Check the existing single-destination constraint and generated ARS column.
select conname, convalidated, pg_get_constraintdef(oid) as definicion
from pg_constraint where conrelid = 'public.pagos'::regclass
order by conname;

select table_name, column_name, is_nullable, numeric_precision, numeric_scale,
  column_default, is_generated, generation_expression
from information_schema.columns where table_schema = 'public'
  and ((table_name in ('pagos','catering_contratos','egresos') and column_name = 'evento_id')
    or (table_name = 'pagos' and column_name in ('tipo_cambio','importe_moneda_original','importe_en_pesos')))
order by table_name, column_name;

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('pagos','catering_contratos')
order by tablename, policyname;

select tgname, tgenabled, pg_get_triggerdef(oid) as definicion
from pg_trigger where tgrelid = 'public.pagos'::regclass and not tgisinternal order by tgname;

select count(*) filter (where deleted_at is null and evento_id is null) as pagos_externos_activos,
  count(*) filter (where deleted_at is null and moneda = 'USD' and importe_en_pesos is null) as usd_activos_sin_equivalente,
  count(*) filter (where num_nonnulls(evento_servicio_id, catering_contrato_id) <> 1) as pagos_fuera_de_restriccion
from public.pagos;
