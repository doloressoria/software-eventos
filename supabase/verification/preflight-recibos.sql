-- Sólo lectura. SQL Editor, antes de aplicar recibos_persistentes_y_excedentes.
select current_user, current_setting('server_version') as version;
select version,name from supabase_migrations.schema_migrations order by version;
do $$
begin
  if to_regclass('public.recibos') is not null then raise exception 'Recibos ya existe: verificar historial, no reaplicar'; end if;
  if to_regclass('public.catering_cobro_componentes') is null
    or to_regprocedure('public.guardar_pago_por_personas(uuid,uuid,jsonb,jsonb,uuid)') is null
    or to_regprocedure('software_eventos_private.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer)') is null
    or to_regprocedure('public.audit_row_change()') is null then
    raise exception 'Faltan dependencias. Aplicar y verificar catering_iva_separado_usd y sus prerrequisitos';
  end if;
  if exists(select 1 from pg_proc where oid in (
    'software_eventos_private.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer)'::regprocedure,
    'public.audit_row_change()'::regprocedure) and pg_get_userbyid(proowner)<>current_user) then
    raise exception 'Ejecutar como propietario de las funciones existentes';
  end if;
end $$;
select c.relname,c.relrowsecurity,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('pagos','pago_imputaciones','catering_coberturas','catering_cobro_componentes','v_catering_tarifas','v_catering_acreditado');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('pagos','eventos','catering_contratos');
select count(*) as pagos_antes from public.pagos;
select count(*) as coberturas_antes from public.catering_coberturas;
select count(*) as componentes_antes from public.catering_cobro_componentes;
-- Guardar conteos y exportar inventario/saldos con el preflight fiscal ya documentado.
