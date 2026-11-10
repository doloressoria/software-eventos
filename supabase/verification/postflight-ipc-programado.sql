-- Read-only. Run after both migrations; use cron.job separately to verify scheduling.
select s.*, s.saldo_resultante = s.base_ajustada + s.incremento as resultado_consistente
from public.v_ipc_programaciones s order by s.fecha_vigencia, s.periodo;
select c.relname, c.relrowsecurity,
  not has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as sin_escritura_cliente
from pg_class c where c.oid in ('public.ipc_programaciones'::regclass,'public.ipc_aplicaciones'::regclass);
select not has_function_privilege('authenticated','software_eventos_private.ejecutar_ipc_programados()','EXECUTE') as worker_privado,
  not has_function_privilege('anon','public.programar_ipc(date,date,numeric)','EXECUTE') as anon_sin_rpc,
  has_function_privilege('authenticated','public.programar_ipc(date,date,numeric)','EXECUTE') as rpc_autenticada;
select tgrelid::regclass, tgname from pg_trigger where not tgisinternal and tgname='audit_row_change'
  and tgrelid in ('public.ipc_programaciones'::regclass,'public.ipc_aplicaciones'::regclass,'public.ipc_indices'::regclass);
select count(*) as inconsistencias_ledger from public.ipc_aplicaciones a
join public.ipc_programaciones s on s.id=a.programacion_id
join public.ipc_indices i on i.id=a.ipc_indice_id
where a.fecha_efectiva<>s.fecha_vigencia or a.porcentaje<>i.variacion_porcentual
  or a.incremento<>round(a.base_ajustada*a.porcentaje/100,2) or s.estado<>'aplicado';
select count(*) as inconsistencias_totales from (
 select s.id from public.evento_servicios s where s.ajuste_ipc is distinct from
   (select coalesce(sum(a.incremento),0) from public.ipc_aplicaciones a where a.evento_servicio_id=s.id)
 union all
 select c.id from public.catering_contratos c where c.ajuste_ipc is distinct from
   (select coalesce(sum(a.incremento),0) from public.ipc_aplicaciones a where a.catering_contrato_id=c.id)
) inconsistencias;
select c.relname,c.reloptions from pg_class c where c.oid in
 ('public.v_evento_servicios_acreditados'::regclass,'public.v_catering_acreditado'::regclass,'public.v_ipc_programaciones'::regclass);
-- Full stored-balance reconciliation; inspect pre-existing differences separately.
select s.id,s.saldo_pendiente,v.saldo_pendiente as saldo_vista from public.evento_servicios s
join public.v_evento_servicios_acreditados v using(id)
where round(s.saldo_pendiente,2) is distinct from round(v.saldo_pendiente,2);
select c.id,c.saldo_pendiente,v.saldo_pendiente as saldo_vista from public.catering_contratos c
join public.v_catering_acreditado v using(id)
where round(c.saldo_pendiente,2) is distinct from round(v.saldo_pendiente,2);
