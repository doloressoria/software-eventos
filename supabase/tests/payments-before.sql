set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.check_true((select count(*) = 1 from eventos), 'antes: RLS de eventos limita al salón A');
select pg_temp.check_true((select count(*) = 2 from v_resumen_evento), 'reproduce exposición: vista muestra ambos salones');
reset role;
set local role anon;
select pg_temp.check_true((select count(*) = 2 from v_resumen_evento), 'reproduce exposición anónima de la vista');
reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
insert into pagos (id, evento_id, evento_servicio_id, fecha_pago, forma_pago, importe_moneda_original, es_garantia)
values (pg_temp.id(70), pg_temp.id(30), pg_temp.id(50), '2026-10-21', 'efectivo_pesos', 100, true);
select pg_temp.check_true((select total_pagado = 100 from evento_servicios where id = pg_temp.id(50)), 'reproduce garantía contada como cobro SQL');
select pg_temp.check_true((select count(*) = 2 from audit_log where tabla = 'pagos' and registro_id = pg_temp.id(70)::text), 'reproduce auditoría duplicada');
delete from pagos where id = pg_temp.id(70);
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
insert into pagos (id, evento_id, evento_servicio_id, fecha_pago, forma_pago, importe_moneda_original, registrado_por)
values (pg_temp.id(69), pg_temp.id(30), pg_temp.id(50), '2026-10-21', 'efectivo_pesos', 1, pg_temp.id(2));
select pg_temp.expect_error('update pagos set deleted_at = now() where id = pg_temp.id(69)', '42501', 'reproduce bloqueo RLS de baja lógica de servicio');
reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
delete from pagos where id = pg_temp.id(69);
select pg_temp.expect_error($q$
  insert into pagos (catering_contrato_id, fecha_pago, forma_pago, importe_moneda_original)
  values (pg_temp.id(61), '2026-10-21', 'efectivo_pesos', 100)
$q$, '23514', 'reproduce rechazo antiguo de pago externo');
select pg_temp.expect_error($q$
  insert into catering_items (catering_contrato_id, categoria, descripcion, precio_unitario, total)
  values (pg_temp.id(60), 'adicional_otros', 'Prueba', 100, 100)
$q$, '428C9', 'reproduce escritura de total generado');
select pg_temp.expect_error($q$
  update catering_contratos set saldo_pendiente = 0 where id = pg_temp.id(60)
$q$, '428C9', 'reproduce escritura de saldo generado');

create temporary table migration_data_before as
select 'servicios' as kind, jsonb_agg(to_jsonb(es) order by id) as rows from evento_servicios es
union all select 'catering', jsonb_agg(to_jsonb(cc) order by id) from catering_contratos cc
union all select 'pagos', jsonb_agg(to_jsonb(p) order by id) from pagos p
union all select 'auditoria', jsonb_agg(to_jsonb(a) order by id) from audit_log a;
