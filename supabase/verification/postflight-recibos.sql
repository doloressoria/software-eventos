-- Sólo lectura. SQL Editor, después de COMMIT de la migración.
select relname,relrowsecurity from pg_class where oid in ('public.recibos'::regclass,'public.recibo_emisores'::regclass);
select n.nspname,p.proname,p.prosecdef,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.proname in ('recibo_acceso','recibo_snapshot','recibo_fuente','emitir_recibo','previsualizar_recibo','recibo_registrar_modificacion','recibo_inmutable');
select count(*) as permisos_indebidos from information_schema.role_table_grants where table_schema='public' and table_name='recibos'
and grantee in ('anon','authenticated','PUBLIC') and (grantee<>'authenticated' or privilege_type<>'SELECT');
select tgname,tgdeferrable,tginitdeferred from pg_trigger where tgname like 'recibo_%' and not tgisinternal;
select count(*) as cadenas_invalidas from public.recibos r left join public.recibos a on a.id=r.anterior_id
where r.revision>1 and (a.id is null or a.pago_id<>r.pago_id or a.revision<>r.revision-1);
select count(*) as originales_invalidos from public.recibos where revision=1 and (tipo<>'recibo' or anterior_id is not null);
select count(*) as snapshots_desactualizados from (
  select distinct on (pago_id) * from public.recibos order by pago_id,revision desc
) r where r.fuente is distinct from software_eventos_private.recibo_fuente(r.pago_id);
select count(*) as desgloses_inconsistentes from public.catering_cobro_componentes d join public.pagos p on p.id=d.pago_id
where d.explicito and d.objetivo_ars-d.ajuste_ars<>p.importe_en_pesos;
select count(*) as pagos_despues from public.pagos;
select count(*) as coberturas_despues from public.catering_coberturas;
select count(*) as componentes_despues from public.catering_cobro_componentes;
-- Contadores de inconsistencias: cero. Conteos financieros: iguales al preflight.
-- No publicar frontend hasta validar emisión/descarga/RLS con sesiones de staging.
