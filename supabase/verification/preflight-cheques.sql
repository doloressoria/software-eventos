-- Sólo lectura. Comparar contra el runbook antes de aplicar.
select current_setting('server_version') as postgres,
  current_database() as base,
  current_setting('cron.database_name', true) as base_cron,
  current_setting('shared_preload_libraries') as extensiones_precargadas,
  (select default_version from pg_available_extensions where name = 'pg_cron') as cron_disponible,
  (select installed_version from pg_available_extensions where name = 'pg_cron') as cron_instalado;

select version from supabase_migrations.schema_migrations
order by version;

select table_name, column_name, column_default, is_nullable, is_generated, generation_expression
from information_schema.columns where table_schema = 'public'
  and (table_name, column_name) in (
    ('pagos', 'fecha_pago'), ('pagos', 'created_at'), ('pagos', 'evento_id'),
    ('pagos', 'tipo_cambio'), ('pagos', 'importe_en_pesos'),
    ('evento_servicios', 'total_con_iva'), ('evento_servicios', 'saldo_pendiente'),
    ('catering_contratos', 'evento_id'), ('catering_contratos', 'saldo_pendiente'),
    ('egresos', 'evento_id')
  )
order by table_name, column_name;

select c.oid::regclass as vista, c.reloptions, pg_get_viewdef(c.oid) as definicion
from pg_class c where c.oid = to_regclass('public.v_resumen_evento');

select tgrelid::regclass as tabla, pg_get_triggerdef(oid) as definicion
from pg_trigger where not tgisinternal and tgname in (
  'catering_compute_totals', 'trg_validar_catering_contrato_write',
  'trg_actualizar_totales_pagos', 'validar_moneda_pago', 'recalcular_fecha_contrato_evento_on_pagos'
);
select oid::regprocedure as funcion, pg_get_functiondef(oid) as definicion from pg_proc
where oid in (
  to_regprocedure('public.validar_catering_contrato_write()'),
  to_regprocedure('public.recalcular_fecha_contrato_evento(uuid)'),
  to_regprocedure('public.fn_actualizar_totales_pagos()'),
  to_regprocedure('software_eventos_private.catering_compute_totals()')
);

select count(*) as cheques_activos,
  count(*) filter (where es_garantia) as garantias,
  count(*) filter (where not es_garantia
    and fecha_pago > (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date) as futuros_ordinarios
from public.pagos where forma_pago = 'cheque' and deleted_at is null;
