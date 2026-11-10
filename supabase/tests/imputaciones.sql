select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
insert into eventos (id, salon_id, vendedor_id, cliente_nombre, fecha_evento)
values (pg_temp.id(32), pg_temp.id(20), pg_temp.id(2), 'Evento de reparto', '2026-12-03');
insert into evento_servicios (id, evento_id, servicio_id, precio_base)
values (pg_temp.id(52), pg_temp.id(32), pg_temp.id(40), 600000),
  (pg_temp.id(53), pg_temp.id(32), pg_temp.id(40), 200000);
insert into catering_contratos (id, evento_id, ejecutiva_id, pax_adultos)
values (pg_temp.id(64), pg_temp.id(32), pg_temp.id(4), 100);
insert into catering_precio_historial(catering_contrato_id, precio_unitario, pax_adultos, motivo, usuario_id)
values (pg_temp.id(64), 10000, 100, 'Inicial', pg_temp.id(1));

create function pg_temp.cabecera(p_dia date default '2026-11-21') returns jsonb language sql as $$
  select jsonb_build_object('fecha_pago', p_dia, 'forma_pago', 'cheque',
    'moneda', 'ARS', 'tipo_cambio', 1, 'importe_moneda_original', 1000000, 'es_garantia', false)
$$;
create function pg_temp.reparto(p_servicio int default 52, p_catering int default 64, p_importe numeric default 300000)
returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('evento_servicio_id', pg_temp.id(p_servicio), 'importe_ars', p_importe),
    jsonb_build_object('catering_contrato_id', pg_temp.id(p_catering), 'importe_ars', 700000))
$$;

set local eventos.test_dia = '2026-11-20';
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.check_true(
  public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), false, pg_temp.cabecera(), pg_temp.reparto()) = pg_temp.id(210),
  'alta en el salón asignado');
select pg_temp.check_true(
  public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), false, pg_temp.cabecera(), pg_temp.reparto()) = pg_temp.id(210),
  'reintento de alta devuelve la misma cabecera');
select pg_temp.check_true(
  (select count(*) = 1 and sum(importe_en_pesos) = 1000000 from pagos where evento_id = pg_temp.id(32) and deleted_at is null)
  and (select count(*) = 2 and sum(importe_en_pesos) = 1000000 and count(distinct fecha_pago) = 1
    from v_pago_imputaciones where pago_id = pg_temp.id(210)),
  'una sola cabecera y dos destinos con la misma fecha');
select pg_temp.check_true((select total_pagado_servicios = 0 and total_pagado_catering = 0
  and saldo_servicios = total_servicios and saldo_catering = total_catering
  from v_resumen_evento where id = pg_temp.id(32)), 'cheque pendiente conserva los saldos');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(211), false, pg_temp.cabecera(), pg_temp.reparto(51))',
  '23514', 'rechaza un servicio de otro evento');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(211), false, pg_temp.cabecera(), pg_temp.reparto(52, 61))',
  '23514', 'rechaza imputar catering externo');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(211), false, pg_temp.cabecera(), pg_temp.reparto(52, 64, 299999.99))',
  '23514', 'rechaza diferencia de un centavo');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(211), false, pg_temp.cabecera(), pg_temp.reparto(52, 64, 300000.001))',
  '23514', 'rechaza fracciones de centavo');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), false, pg_temp.cabecera(), pg_temp.reparto(53))',
  '23505', 'una solicitud no se puede reutilizar para otro reparto');
select pg_temp.check_true(not exists (select 1 from pagos where id = pg_temp.id(211))
  and not exists (select 1 from pago_imputaciones where pago_id = pg_temp.id(211)),
  'una validación fallida no deja cabecera ni detalle');
select pg_temp.expect_error('update pagos set importe_moneda_original = 1 where id = pg_temp.id(210)',
  '42501', 'la API directa no puede desalinear cabecera y detalle');
select pg_temp.expect_error('update pago_imputaciones set importe_ars = 1 where pago_id = pg_temp.id(210)',
  '42501', 'la API directa no puede escribir el detalle');
select set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
select pg_temp.check_true(not exists (select 1 from pagos where id = pg_temp.id(210))
  and not exists (select 1 from v_pago_imputaciones where pago_id = pg_temp.id(210)), 'otro salón no ve cabecera ni reparto');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), true, pg_temp.cabecera(), pg_temp.reparto())',
  '42501', 'otro salón no puede editar el cobro');

set local eventos.test_dia = '2026-11-21';
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.check_true((select total_pagado_servicios = 300000 and total_pagado_catering = 700000
  and saldo_servicios = total_servicios - 300000 and saldo_catering = total_catering - 700000
  from v_resumen_evento where id = pg_temp.id(32)), 'día de acreditación: saldos reflejan ambos importes');
select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
select pg_temp.check_true(
  (select count(*) = 1 and sum(importe_en_pesos) = 700000 and bool_and(importe_moneda_original is null)
    from v_pago_imputaciones where pago_id = pg_temp.id(210))
  and not exists (select 1 from pagos where id = pg_temp.id(210))
  and (select total_pagado = 700000 from v_catering_acreditado where id = pg_temp.id(64)),
  'ejecutiva asignada sin salón ve sólo la imputación de su contrato');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), true, pg_temp.cabecera(), pg_temp.reparto())',
  '42501', 'acceso al catering no habilita editar un cobro del evento completo');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select software_eventos_private.sincronizar_cheques();
select pg_temp.check_true((select total_pagado = 300000 from evento_servicios where id = pg_temp.id(52))
  and (select total_pagado = 700000 from catering_contratos where id = pg_temp.id(64)),
  'sincronización sin JWT acredita sólo la parte de cada destino');

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), true, pg_temp.cabecera(), pg_temp.reparto(51))',
  '23514', 'una edición inválida conserva el reparto original');
select pg_temp.check_true((select importe_en_pesos = 300000 from v_pago_imputaciones
  where pago_id = pg_temp.id(210) and evento_servicio_id = pg_temp.id(52)), 'el reparto original sigue intacto');
select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), true, pg_temp.cabecera(),
  jsonb_build_array(jsonb_build_object('evento_servicio_id', pg_temp.id(53), 'importe_ars', 400000),
    jsonb_build_object('catering_contrato_id', pg_temp.id(64), 'importe_ars', 600000)));
select pg_temp.check_true((select total_pagado = 0 from evento_servicios where id = pg_temp.id(52))
  and (select total_pagado = 400000 from evento_servicios where id = pg_temp.id(53))
  and (select total_pagado = 600000 from catering_contratos where id = pg_temp.id(64)),
  'edición mueve el saldo del destino anterior y recalcula los importes');
select pg_temp.expect_error('update catering_contratos set evento_id = pg_temp.id(30) where id = pg_temp.id(64)',
  '23514', 'un destino activo no puede cambiar de evento');

update pagos set deleted_at = now() where id = pg_temp.id(210);
select pg_temp.check_true((select total_pagado_servicios = 0 and total_pagado_catering = 0
  and saldo_servicios = total_servicios and saldo_catering = total_catering
  from v_resumen_evento where id = pg_temp.id(32))
  and (select count(*) = 2 from pago_imputaciones where pago_id = pg_temp.id(210)),
  'baja lógica resta ambas imputaciones y conserva el detalle');
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(210), false, pg_temp.cabecera(), pg_temp.reparto())',
  '42501', 'el reintento no resucita un cobro dado de baja');

reset role;
select pg_temp.check_true(exists (select 1 from audit_log where tabla = 'pagos' and registro_id = pg_temp.id(210)::text
  and accion = 'SOFT_DELETE' and usuario_id = pg_temp.id(2))
  and exists (select 1 from audit_log where tabla = 'pago_imputaciones' and accion = 'UPDATE'
    and usuario_id = pg_temp.id(2) and datos_nuevos->>'importe_ars' = '600000.00'),
  'auditoría registra tanto cambios de reparto como baja con actor');

-- A historical linked payment stays readable before conversion. Its USD
-- amount and rate remain on the same header when adding a second destination.
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
insert into pagos (id, evento_id, catering_contrato_id, fecha_pago, forma_pago, moneda,
  tipo_cambio, importe_moneda_original, registrado_por)
values (pg_temp.id(212), pg_temp.id(32), pg_temp.id(64), '2026-11-20', 'transferencia',
  'USD', 1234.5678, 3.33, pg_temp.id(2));
select pg_temp.check_true((select not distribuido and importe_moneda_original = 3.33 and importe_en_pesos = 4111.11
  from v_pago_imputaciones where pago_id = pg_temp.id(212)), 'catering vinculado histórico conserva destino y cotización');
select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(212), true,
  jsonb_build_object('fecha_pago', '2026-11-20', 'forma_pago', 'transferencia', 'moneda', 'USD',
    'tipo_cambio', 1234.5678, 'importe_moneda_original', 3.33, 'es_garantia', false),
  jsonb_build_array(jsonb_build_object('evento_servicio_id', pg_temp.id(52), 'importe_ars', 1111),
    jsonb_build_object('catering_contrato_id', pg_temp.id(64), 'importe_ars', 3000.11)));
select pg_temp.check_true((select count(*) = 1 and sum(importe_en_pesos) = 4111.11 and min(tipo_cambio) = 1234.5678
  from pagos where evento_id = pg_temp.id(32) and deleted_at is null)
  and (select total_pagado = 3000.11 from catering_contratos where id = pg_temp.id(64)),
  'convertir un legado USD mantiene la cabecera y reparte el equivalente exacto');
select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(213), false,
  pg_temp.cabecera('2026-11-21') || '{"es_garantia":true}'::jsonb, pg_temp.reparto());
select pg_temp.check_true((select count(*) = 2 and bool_and(es_garantia) from v_pago_imputaciones
    where pago_id = pg_temp.id(213))
  and (select total_pagado_servicios = 1111 and total_pagado_catering = 3000.11
    from v_resumen_evento where id = pg_temp.id(32)), 'las garantías imputadas nunca reducen los saldos ordinarios');
reset role;
update role_permissions set can_manage = false where role_id = pg_temp.id(10) and screen = 'eventos';
set local role authenticated;
select pg_temp.expect_error(
  'select public.guardar_pago_distribuido(pg_temp.id(32), pg_temp.id(214), false, pg_temp.cabecera(), pg_temp.reparto())',
  '42501', 'el rol de lectura de eventos no puede distribuir un cobro');
reset role;
