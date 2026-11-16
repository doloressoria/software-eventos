-- Read-only. Save results and current definitions before applying the migration.
select version();
select version, name from supabase_migrations.schema_migrations order by version;
select table_name,column_name,data_type,numeric_precision,numeric_scale,is_generated
from information_schema.columns where table_schema='public' and table_name in
 ('catering_contratos','catering_coberturas','catering_precio_historial','pagos','pago_imputaciones')
order by table_name,ordinal_position;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,p.proacl,pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','software_eventos_private') and p.proname in
 ('catering_costos','catering_tarifas','catering_compute_totals','crear_catering_con_precio',
  'guardar_pago_por_personas','guardar_pago_distribuido_api','proteger_pago_por_personas',
  'proteger_catering_con_cobertura','reasignar_excedente_catering','sincronizar_cheques');
select c.relname,c.reloptions,pg_get_viewdef(c.oid,true) from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('v_catering_acreditado','v_catering_tarifas','v_catering_costos','v_resumen_evento','v_pago_imputaciones');
select tgrelid::regclass,tgname,pg_get_triggerdef(oid) from pg_trigger where not tgisinternal
and tgrelid in ('public.catering_contratos'::regclass,'public.pagos'::regclass,'public.pago_imputaciones'::regclass,'public.catering_coberturas'::regclass);
-- Counts only: never infer a historical IVA breakdown from receipt medium or current prices.
select count(*) as contratos, count(*) filter(where deleted_at is null) as activos,
 count(*) filter(where exists(select 1 from public.catering_coberturas x where x.catering_contrato_id=c.id)) as con_cobertura_historica,
 count(*) filter(where exists(select 1 from public.pagos p where not p.es_garantia and
   (p.catering_contrato_id=c.id or exists(select 1 from public.pago_imputaciones i where i.pago_id=p.id and i.catering_contrato_id=c.id)))) as requieren_conciliacion_para_cambiar_modelo
from public.catering_contratos c;
