-- Expected: all permissions/invariants true, monetary inconsistencies zero.
select c.relname as vista, c.reloptions @> array['security_invoker=true'] as security_invoker
from pg_class c
where c.oid in ('public.v_catering_tarifas'::regclass, 'public.v_catering_costos'::regclass,
  'public.v_catering_acreditado'::regclass, 'public.v_resumen_evento'::regclass)
order by c.relname;

select c.relrowsecurity as rls_activa,
  not has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE') as sin_escritura_directa,
  not has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE') as anon_sin_escritura,
  exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'audit_row_change' and t.tgenabled <> 'D') as auditado,
  not has_function_privilege('authenticated',
    'software_eventos_private.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)', 'EXECUTE') as sin_bypass_de_reasignacion
from pg_class c where c.oid = 'public.catering_coberturas'::regclass;

select p.proname as rpc, not p.prosecdef as invoker,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and not has_function_privilege('anon', p.oid, 'EXECUTE') as solo_autenticados
from pg_proc p where p.oid in (
  'public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)'::regprocedure,
  'public.guardar_pago_por_personas(uuid,uuid,jsonb,jsonb,uuid)'::regprocedure,
  'public.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer)'::regprocedure
) order by rpc;

with por_pago as (
  select x.pago_id, x.catering_contrato_id, sum(x.importe_historico) as historico,
    sum((x.cantidad - x.liberada) * x.precio_aplicado) as remanente
  from public.catering_coberturas x group by x.pago_id, x.catering_contrato_id
)
select count(*) filter (where x.historico is distinct from p.importe_en_pesos or p.es_garantia) as cabeceras_inconsistentes,
  count(*) filter (where p.deleted_at is null and x.remanente is distinct from coalesce(i.importe_en_pesos, 0)) as coberturas_desalineadas,
  count(*) filter (where p.deleted_at is null and x.remanente > 0 and c.evento_id is distinct from p.evento_id) as vinculos_inconsistentes
from por_pago x
join public.pagos p on p.id = x.pago_id
join public.catering_contratos c on c.id = x.catering_contrato_id
left join public.v_pago_imputaciones i on i.pago_id = p.id and i.catering_contrato_id = c.id;

select count(*) filter (where v.total_pagado is distinct from c.total_pagado
  or v.saldo_pendiente is distinct from c.saldo_pendiente) as saldos_por_sincronizar,
  count(*) filter (where v.total_con_iva is distinct from k.total_con_iva) as totales_historicos_distintos_del_desglose
from public.v_catering_acreditado v
join public.catering_contratos c on c.id = v.id
join public.v_catering_costos k on k.catering_contrato_id = c.id
where c.deleted_at is null;

-- These counts describe operational cases and may be greater than zero.
select count(*) filter (where excedente > 0) as categorias_con_excedente,
  count(*) filter (where excedente > 0 and tarifas_historicas > 1) as requieren_regla_de_prioridad,
  count(*) filter (where por_acreditar > 0) as categorias_con_cheques_pendientes
from public.v_catering_tarifas;
