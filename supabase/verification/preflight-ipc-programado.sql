-- Read-only. Run BEFORE the IPC migrations as the existing functions' owner.
select current_user, current_setting('server_version') as postgres_version;
select c.relname, c.relrowsecurity from pg_class c where c.oid in
  ('public.ipc_indices'::regclass, 'public.actualizaciones_ipc'::regclass,
   'public.evento_servicios'::regclass, 'public.catering_contratos'::regclass);
select table_name, column_name, is_generated, generation_expression
from information_schema.columns where table_schema='public' and
  (table_name='evento_servicios' and column_name in ('total_con_iva','saldo_pendiente')
    or table_name='catering_contratos' and column_name='saldo_pendiente');
select n.nspname, p.proname, pg_get_userbyid(p.proowner) as owner, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('registrar_y_aplicar_ipc','validar_catering_contrato_write'))
 or (n.nspname='software_eventos_private' and p.proname in ('sincronizar_cheques','catering_costos','catering_compute_totals'));
select tgrelid::regclass, tgname, pg_get_triggerdef(oid) from pg_trigger
where not tgisinternal and tgrelid in ('public.ipc_indices'::regclass, 'public.catering_contratos'::regclass);
select periodo, count(*) from public.ipc_indices group by periodo having count(*)>1;
select 'indices' as entidad, count(*) from public.ipc_indices union all
select 'actualizaciones', count(*) from public.actualizaciones_ipc union all
select 'pagos', count(*) from public.pagos union all
select 'coberturas', count(*) from public.catering_coberturas;
select exists(select 1 from pg_extension where extname='pg_cron') as cron_instalado;
select policyname, tablename, cmd, qual, with_check from pg_policies
where schemaname='public' and tablename in ('ipc_indices','actualizaciones_ipc','evento_servicios','catering_contratos');
select conrelid::regclass,conname,pg_get_constraintdef(oid) from pg_constraint
where conrelid in ('public.ipc_indices'::regclass,'public.actualizaciones_ipc'::regclass);
select count(*) as indices_invalidos from public.ipc_indices
where not (variacion_porcentual > -100 and variacion_porcentual < 100000000) or not isfinite(periodo);
select c.relname,c.reloptions from pg_class c where c.oid in
 ('public.v_evento_servicios_acreditados'::regclass,'public.v_catering_acreditado'::regclass);
