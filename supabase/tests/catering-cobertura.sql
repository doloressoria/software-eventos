update role_permissions set can_manage = true where role_id = pg_temp.id(10) and screen = 'eventos';
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
set local eventos.test_dia = '2026-11-20';
insert into catering_contratos (id, evento_id, ejecutiva_id, pax_adultos, pax_jovenes, iva_porcentaje)
values (pg_temp.id(65), pg_temp.id(32), pg_temp.id(4), 5, 15, 0);
insert into catering_precio_historial(catering_contrato_id, fecha, precio_unitario, precio_adultos, precio_jovenes, pax_adultos, pax_jovenes)
values (pg_temp.id(65), '2026-11-10', 30000, 60000, 39000, 5, 15);
insert into catering_items (catering_contrato_id, categoria, descripcion, precio_unitario, pax, categorias_pax)
values
  (pg_temp.id(65), 'adicional_otros', 'Sólo adultos', 2000, 1, array['adultos']),
  (pg_temp.id(65), 'adicional_otros', 'Sólo jóvenes', 1000, 1, array['jovenes']),
  (pg_temp.id(65), 'adicional_otros', 'Fijo nuevo', 10000, 1, null),
  (pg_temp.id(65), 'adicional_otros', 'Fijo legado', 1000, 7, null);
select pg_temp.check_true(
  (select pax_subtotal = 885000 and extras = 36000 and total_con_iva = 921000
    from v_catering_costos where catering_contrato_id = pg_temp.id(65))
  and (select total_con_iva = 921000 and saldo_pendiente = 921000 from catering_contratos where id = pg_temp.id(65)),
  'adultos y jóvenes a precios distintos, extras por categoría y fijos históricos una sola vez');

create function pg_temp.pax_cabecera(monto numeric, fecha date default '2026-11-20', forma text default 'transferencia')
returns jsonb language sql as $$
  select jsonb_build_object('fecha_pago', fecha, 'forma_pago', forma, 'moneda', 'ARS',
    'tipo_cambio', 1, 'importe_moneda_original', monto, 'es_garantia', false)
$$;
create function pg_temp.cobertura(categoria text, cantidad int, precio numeric) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('categoria', categoria, 'cantidad', cantidad, 'precio_aplicado', precio))
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
select pg_temp.expect_error(
  'select guardar_pago_por_personas(pg_temp.id(65), pg_temp.id(220), pg_temp.pax_cabecera(400000), pg_temp.cobertura(''jovenes'',10,40000), pg_temp.id(32))',
  '42501', 'un vendedor de otro salón no puede cubrir PAX');
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.expect_error(
  'select guardar_pago_por_personas(pg_temp.id(65), pg_temp.id(220), pg_temp.pax_cabecera(390000), pg_temp.cobertura(''jovenes'',10,39000), pg_temp.id(32))',
  '23514', 'el servidor rechaza un precio de vista previa desactualizado');

select guardar_pago_por_personas(pg_temp.id(65), pg_temp.id(220), pg_temp.pax_cabecera(400000), pg_temp.cobertura('jovenes',10,40000), pg_temp.id(32));
select pg_temp.check_true(
  guardar_pago_por_personas(pg_temp.id(65), pg_temp.id(220), pg_temp.pax_cabecera(400000), pg_temp.cobertura('jovenes',10,40000), pg_temp.id(32)) = pg_temp.id(220),
  'reintento conserva el mismo cobro por personas');
select pg_temp.check_true((select importe_historico = 400000 and liberada = 0 and cantidad = 10
  from catering_coberturas where pago_id = pg_temp.id(220)), 'historial conserva el precio y el importe originales');

select guardar_pago_por_personas(pg_temp.id(65), pg_temp.id(221), pg_temp.pax_cabecera(124000, '2026-11-21', 'cheque'), pg_temp.cobertura('adultos',2,62000), pg_temp.id(32));
select pg_temp.check_true(
  (select cubiertos = 0 and por_acreditar = 2 and pendientes = 5 from v_catering_tarifas
    where catering_contrato_id = pg_temp.id(65) and categoria = 'adultos')
  and (select total_pagado = 400000 from v_catering_acreditado where id = pg_temp.id(65)),
  'cheque reserva cantidades pero recién cubre y reduce saldo al acreditarse');
select pg_temp.expect_error(
  'select guardar_pago_por_personas(pg_temp.id(65), pg_temp.id(222), pg_temp.pax_cabecera(248000), pg_temp.cobertura(''adultos'',4,62000), pg_temp.id(32))',
  '23514', 'no se admite pagar por encima del PAX disponible descontando los cheques pendientes');

reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
insert into catering_precio_historial(catering_contrato_id, fecha, precio_unitario, precio_adultos, precio_jovenes, pax_adultos, pax_jovenes)
values (pg_temp.id(65), '2026-11-20', 30000, 61000, 44000, 5, 15);
select pg_temp.check_true(
  (select precio_aplicado = 45000 and cubiertos = 10 and pendientes = 5 and saldo_categoria = 225000 and cobertura_ars = 400000
    from v_catering_tarifas where catering_contrato_id = pg_temp.id(65) and categoria = 'jovenes')
  and (select total_pagado = 400000 and saldo_pendiente = 551000 from catering_contratos where id = pg_temp.id(65)),
  'recotización conserva lo cobrado, cobra los cinco pendientes a tarifa nueva y no vuelve a descontar la cobertura');
insert into public.pagos (id, evento_id, catering_contrato_id, forma_pago, fecha_pago, importe_moneda_original, es_garantia)
values (pg_temp.id(225), pg_temp.id(32), pg_temp.id(65), 'transferencia', '2026-11-20', 100, false),
  (pg_temp.id(226), pg_temp.id(32), pg_temp.id(65), 'transferencia', '2026-11-20', 200, true);
select pg_temp.check_true((select total_pagado = 400100 and saldo_pendiente = 550900 from v_catering_acreditado where id = pg_temp.id(65)),
  'un cobro ordinario por importe reduce el saldo una vez y una garantía queda separada');
update public.pagos set deleted_at = now() where id in (pg_temp.id(225), pg_temp.id(226));

set local eventos.test_dia = '2026-11-21';
select pg_temp.check_true((select cubiertos = 2 and por_acreditar = 0 and saldo_categoria = 189000
  from v_catering_tarifas where catering_contrato_id = pg_temp.id(65) and categoria = 'adultos')
  and (select total_pagado = 524000 and saldo_pendiente = 425000 from v_catering_acreditado where id = pg_temp.id(65)),
  'al comenzar el día de acreditación se actualiza la vista antes del Cron');
select set_config('request.jwt.claim.sub', '', true);
select software_eventos_private.sincronizar_cheques();
select pg_temp.check_true((select total_pagado = 524000 and saldo_pendiente = 425000 from catering_contratos where id = pg_temp.id(65)),
  'el Cron sin sesión sincroniza el saldo almacenado');

select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
update catering_contratos set pax_jovenes = 8 where id = pg_temp.id(65);
select pg_temp.check_true((select cubiertos = 10 and excedente = 2 and saldo_categoria = 0
  from v_catering_tarifas where catering_contrato_id = pg_temp.id(65) and categoria = 'jovenes'),
  'la baja de PAX deja dos excedentes explícitos');
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.expect_error(
  'select reasignar_excedente_catering(pg_temp.id(65), pg_temp.id(220), ''jovenes'', 2, pg_temp.id(51), false, 0)',
  '23514', 'un destino ajeno se rechaza de forma atómica');
select pg_temp.check_true((select liberada = 0 from catering_coberturas where pago_id = pg_temp.id(220)),
  'la reasignación fallida conserva la cobertura');
select reasignar_excedente_catering(pg_temp.id(65), pg_temp.id(220), 'jovenes', 2, pg_temp.id(52), false, 0);
select pg_temp.check_true(
  (select count(*) = 1 and sum(importe_en_pesos) = 400000 from pagos where id = pg_temp.id(220))
  and (select importe_en_pesos = 80000 from v_pago_imputaciones where pago_id = pg_temp.id(220) and evento_servicio_id = pg_temp.id(52))
  and (select importe_en_pesos = 320000 from v_pago_imputaciones where pago_id = pg_temp.id(220) and catering_contrato_id = pg_temp.id(65))
  and (select importe_historico = 400000 and liberada = 2 from catering_coberturas where pago_id = pg_temp.id(220))
  and (select cubiertos = 8 and excedente = 0 from v_catering_tarifas where catering_contrato_id = pg_temp.id(65) and categoria = 'jovenes'),
  'libera al precio histórico, mueve la imputación y conserva el único ingreso');
select pg_temp.expect_error(
  'select reasignar_excedente_catering(pg_temp.id(65), pg_temp.id(220), ''jovenes'', 2, pg_temp.id(52), false, 0)',
  '23514', 'un reintento de liberación no vuelve a mover el importe');
update catering_contratos set pax_jovenes = 7 where id = pg_temp.id(65);
select reasignar_excedente_catering(pg_temp.id(65), pg_temp.id(220), 'jovenes', 1, pg_temp.id(64), true, 2);
select pg_temp.check_true(
  (select importe_en_pesos = 400000 from pagos where id = pg_temp.id(220))
  and (select count(*) = 3 and sum(importe_ars) = 400000 from pago_imputaciones where pago_id = pg_temp.id(220))
  and (select importe_ars = 40000 from pago_imputaciones where pago_id = pg_temp.id(220) and catering_contrato_id = pg_temp.id(64))
  and (select liberada = 3 from catering_coberturas where pago_id = pg_temp.id(220)),
  'un cobro ya distribuido puede reasignar otro excedente a un catering del mismo evento');
select pg_temp.expect_error('update pagos set importe_moneda_original = 1 where id = pg_temp.id(221)', '42501',
  'la escritura directa no puede cambiar un cobro por personas');
select pg_temp.expect_error('update catering_coberturas set liberada = 1 where pago_id = pg_temp.id(221)', '42501',
  'la escritura directa no puede alterar coberturas');
select pg_temp.expect_error(
  'select guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(220), true, pg_temp.cabecera(), pg_temp.reparto())',
  '23514', 'la edición ordinaria no puede alterar una cobertura');

select guardar_pago_por_personas(pg_temp.id(65), pg_temp.id(222), pg_temp.pax_cabecera(63000), pg_temp.cobertura('adultos',1,63000), pg_temp.id(32));
reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
update catering_contratos set pax_adultos = 1 where id = pg_temp.id(65);
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.expect_error(
  'select reasignar_excedente_catering(pg_temp.id(65), pg_temp.id(221), ''adultos'', 1, pg_temp.id(52), false, 0)',
  '23514', 'queda pendiente la prioridad de liberación cuando hay tarifas distintas');
update pagos set deleted_at = now() where id = pg_temp.id(220);
select pg_temp.check_true(
  (select importe_historico = 400000 and liberada = 3 from catering_coberturas where pago_id = pg_temp.id(220))
  and (select cubiertos = 0 from v_catering_tarifas where catering_contrato_id = pg_temp.id(65) and categoria = 'jovenes'),
  'la baja lógica cancela la cobertura activa sin borrar su historial');

reset role;
select pg_temp.check_true(exists (select 1 from audit_log where tabla = 'catering_coberturas'
  and accion = 'UPDATE' and usuario_id = pg_temp.id(2) and datos_nuevos->>'liberada' = '2')
  and exists (select 1 from audit_log where tabla = 'pago_imputaciones' and accion = 'INSERT'
    and usuario_id = pg_temp.id(2) and datos_nuevos->>'importe_ars' = '80000.00'),
  'la cobertura y la imputación reasignadas tienen auditoría con actor');

select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
set local role authenticated;
select crear_catering_con_precio(
  '{"cliente_nombre":"Prueba externa","fecha_evento":"2026-12-03","lugar_evento":"Lugar de prueba","pax_adultos":4,"pax_jovenes":2,"precio_adultos":1000,"precio_jovenes":500,"iva_porcentaje":0}'::jsonb
    || jsonb_build_object('ejecutiva_id', pg_temp.id(4)), 900, 'Inicial') as externo \gset
select guardar_pago_por_personas(:'externo', pg_temp.id(223),
  pg_temp.pax_cabecera(15) || '{"moneda":"USD","tipo_cambio":100}'::jsonb,
  pg_temp.cobertura('adultos',1,1000) || pg_temp.cobertura('jovenes',1,500));
select pg_temp.check_true((select evento_id is null and moneda = 'USD' and tipo_cambio = 100 and importe_en_pesos = 1500 from pagos where id = pg_temp.id(223))
  and (select total_pagado = 1500 and saldo_pendiente = 3500 from v_catering_acreditado where id = :'externo'),
  'la ejecutiva cobra PAX en catering externo y conserva cotización USD');
update catering_contratos set iva_porcentaje = 0.21 where id = :'externo';
select pg_temp.check_true(
  (select precio_aplicado = 1210 and cubiertos = 1 and saldo_categoria = 3630 from v_catering_tarifas
    where catering_contrato_id = :'externo' and categoria = 'adultos')
  and (select total_pagado = 1500 and saldo_pendiente = 4235 from v_catering_acreditado where id = :'externo'),
  'el IVA vigente aplica a PAX pendientes y conserva el importe USD histórico ya acreditado');
reset role;
