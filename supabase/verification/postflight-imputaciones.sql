-- Read-only. All inconsistency counts should be zero.
select
  count(*) filter (where p.distribuido and (
    i.lineas = 0 or i.total is distinct from p.importe_en_pesos
    or p.evento_id is null or num_nonnulls(p.evento_servicio_id, p.catering_contrato_id) <> 0
  )) as cabeceras_distribuidas_inconsistentes,
  count(*) filter (where not p.distribuido and i.lineas <> 0) as legados_con_detalle,
  count(*) filter (where not p.distribuido and not exists (
    select 1 from public.v_pago_imputaciones v where v.id = p.id and v.pago_id = p.id
  )) as legados_fuera_de_vista
from public.pagos p cross join lateral (
  select count(*) as lineas, sum(importe_ars) as total from public.pago_imputaciones where pago_id = p.id
) i;

select count(*) as destinos_activos_invalidos
from public.pago_imputaciones i join public.pagos p on p.id = i.pago_id
left join public.evento_servicios s on s.id = i.evento_servicio_id and s.evento_id = p.evento_id
left join public.catering_contratos c on c.id = i.catering_contrato_id and c.evento_id = p.evento_id and c.deleted_at is null
where p.deleted_at is null and s.id is null and c.id is null;

select
  (select relrowsecurity from pg_class where oid = 'public.pago_imputaciones'::regclass) as rls_activa,
  (select reloptions @> array['security_invoker=true'] from pg_class
    where oid = 'public.v_pago_imputaciones'::regclass) as vista_invoker,
  exists (select 1 from pg_trigger where tgrelid = 'public.pago_imputaciones'::regclass
    and tgname = 'audit_row_change' and tgenabled = 'O') as detalle_auditado,
  has_function_privilege('authenticated','public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)','EXECUTE') as rpc_autenticados,
  not has_function_privilege('anon','public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)','EXECUTE') as rpc_anon_bloqueada,
  not has_table_privilege('authenticated','public.pago_imputaciones','INSERT, UPDATE, DELETE') as detalle_sin_escritura_directa;

-- Check current credited split amounts without treating guarantees or future cheques as income.
select coalesce(sum(importe_en_pesos) filter (
    where forma_pago <> 'cheque' or fecha_pago <= software_eventos_private.dia_argentina()
  ), 0) as imputado_ordinario_acreditado_ars,
  coalesce(sum(importe_en_pesos) filter (
    where forma_pago = 'cheque' and fecha_pago > software_eventos_private.dia_argentina()
  ), 0) as imputado_ordinario_pendiente_ars
from public.v_pago_imputaciones where distribuido and deleted_at is null and not es_garantia;
