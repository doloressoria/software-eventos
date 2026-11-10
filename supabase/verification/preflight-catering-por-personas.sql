-- Run in the Supabase SQL Editor as the owner that will apply the migration.
select current_user as rol_sql_editor, current_setting('server_version') as postgres,
  current_setting('server_version_num')::integer >= 150000 as version_admitida,
  to_regclass('public.v_catering_acreditado') is not null as existe_acreditacion,
  to_regclass('public.pago_imputaciones') is not null as existe_imputacion,
  to_regclass('public.catering_coberturas') is null as migracion_pendiente;

select p.oid::regprocedure as funcion, pg_get_userbyid(p.proowner) as propietario,
  pg_get_userbyid(p.proowner) = current_user as mismo_propietario,
  p.prosecdef as security_definer
from pg_proc p
where p.oid in (
  to_regprocedure('public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)'),
  to_regprocedure('public.crear_catering_con_precio(jsonb,numeric,text)'),
  to_regprocedure('software_eventos_private.catering_compute_totals()'),
  to_regprocedure('software_eventos_private.proteger_pago_distribuido()'),
  to_regprocedure('software_eventos_private.cobros_acreditados(uuid,uuid,date)')
)
order by p.oid::regprocedure::text;

select table_name, column_name, is_nullable, data_type, numeric_precision, numeric_scale, is_generated, generation_expression
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'pagos' and column_name in ('evento_id','catering_contrato_id','importe_en_pesos','tipo_cambio'))
    or (table_name = 'catering_contratos' and column_name in ('evento_id','saldo_pendiente','total_con_iva','total_pagado'))
    or (table_name = 'egresos' and column_name = 'evento_id')
    or (table_name = 'catering_precio_historial' and (column_name like 'precio_%' or column_name like 'pax_%'))
    or (table_name = 'catering_items' and column_name in ('pax','total','precio_unitario','categorias_pax')))
order by table_name, ordinal_position;

select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint where conrelid = 'public.pagos'::regclass and (contype = 'f' or conname = 'pago_destino_exclusivo')
order by conname;

select t.tgrelid::regclass as tabla, t.tgname, pg_get_triggerdef(t.oid) as definicion
from pg_trigger t
where t.tgrelid in ('public.pagos'::regclass, 'public.catering_contratos'::regclass, 'public.catering_items'::regclass,
  'public.catering_precio_historial'::regclass, 'public.pago_imputaciones'::regclass)
  and not t.tgisinternal
order by t.tgrelid::regclass::text, tgname;

select tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies where schemaname = 'public'
  and tablename in ('pagos','pago_imputaciones','catering_contratos','catering_items','catering_precio_historial')
order by tablename, policyname;

select count(*) filter (where c.deleted_at is null) as contratos_activos,
  count(*) filter (where c.deleted_at is null and c.evento_id is null) as catering_externo_activo,
  count(*) filter (where c.deleted_at is null and not exists (
    select 1 from public.catering_precio_historial h where h.catering_contrato_id = c.id)) as activos_sin_historial,
  (select count(*) from public.catering_items where pax is distinct from 1) as adicionales_con_pax_legado,
  (select count(*) from public.pagos where moneda = 'USD' and importe_en_pesos is null) as usd_historicos_sin_equivalente
from public.catering_contratos c;
