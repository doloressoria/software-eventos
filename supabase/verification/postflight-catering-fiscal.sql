-- Read-only checks. Also repeat the preflight inventory and compare saved legacy balances.
select version_calculo,porcentaje_facturado,count(*) from public.catering_contratos group by 1,2 order by 1,2;
select c.relname,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
and c.relname in ('v_catering_acreditado','v_catering_costos','v_catering_tarifas','v_resumen_evento');
select relname,relrowsecurity from pg_class where oid='public.catering_cobro_componentes'::regclass;
select n.nspname,p.proname,p.prosecdef,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='software_eventos_private' and p.proname in ('catering_fiscal','catering_sync_componentes','catering_validar_modelo','guardar_pago_por_personas');
-- Must be zero: actual header = target - rounding; source allocations remain real cash after reassignment.
select count(*) as desgloses_inconsistentes from public.catering_cobro_componentes d join public.pagos p on p.id=d.pago_id
where d.explicito and d.objetivo_ars - d.ajuste_ars <> p.importe_en_pesos;
select count(*) as saldos_v2_inconsistentes from public.v_catering_acreditado v
join public.catering_contratos c on c.id=v.id where v.version_calculo=2 and v.deleted_at is null
and v.saldo_pendiente <> v.total_con_iva + v.ajuste_cobertura - v.total_pagado;
-- Audit records have actor and primary key; don't export customer/payment contents as logs.
select tabla,accion,count(*) from public.audit_log where tabla='catering_cobro_componentes' group by 1,2;
