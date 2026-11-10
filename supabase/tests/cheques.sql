select pg_temp.check_true((select total_pagado = 100 from evento_servicios where id = pg_temp.id(51))
  and not exists (select 1 from pagos p join cheques_historicos h using(id)
    where (to_jsonb(p) - 'distribuido') is distinct from to_jsonb(h)),
  'migración conserva filas y fechas históricas; sólo excluye el cheque futuro del cobrado');

select pg_temp.check_true(
  software_eventos_private.dia_argentina('2026-11-11T02:59:59Z') = '2026-11-10'
  and software_eventos_private.dia_argentina('2026-11-11T03:00:00Z') = '2026-11-11',
  'medianoche argentina aunque el servidor esté en UTC'
);

-- Replace only the test clock. The same rows and views span three local dates.
create or replace function software_eventos_private.dia_argentina(p_instante timestamptz default statement_timestamp())
returns date language sql stable set search_path = '' as $$
  select current_setting('eventos.test_dia')::date
$$;
set local eventos.test_dia = '2026-11-10';
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
insert into pagos (id, evento_id, evento_servicio_id, fecha_pago, forma_pago,
  moneda, tipo_cambio, importe_moneda_original, registrado_por, es_garantia)
values (pg_temp.id(200), pg_temp.id(30), pg_temp.id(50), '2026-11-11', 'cheque',
  'ARS', 1, 726, pg_temp.id(2), false);
select pg_temp.check_true((select fecha_contrato = '2026-11-11' from eventos where id = pg_temp.id(30)),
  'fecha de contrato conserva el primer pago registrado, aunque sea un cheque pendiente');
insert into pagos (id, evento_id, evento_servicio_id, fecha_pago, forma_pago,
  moneda, tipo_cambio, importe_moneda_original, registrado_por, es_garantia) values
  (pg_temp.id(201), pg_temp.id(30), pg_temp.id(50), '2026-11-12', 'efectivo_dolares', 'USD', 100, .5, pg_temp.id(2), false),
  (pg_temp.id(202), pg_temp.id(30), pg_temp.id(50), '2026-11-11', 'cheque', 'ARS', 1, 1210, pg_temp.id(2), true);
select pg_temp.check_true((select total_pagado = 50 and iva_base_imponible = 500 and saldo_pendiente = 1055
  from evento_servicios where id = pg_temp.id(50)), 'antes: SQL guarda USD histórico y excluye cheque y garantía del cobrado e IVA');
select pg_temp.check_true((select total_pagado_servicios = 50 and saldo_servicios = 1055
  from v_resumen_evento where id = pg_temp.id(30)), 'antes: resumen coincide con LAB-006');
select pg_temp.check_true((select count(*) = 1 from v_evento_servicios_acreditados),
  'vendedor sólo lee su salón en la vista nueva');

select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,motivo,usuario_id) values
  (pg_temp.id(60),100,5,'Inicial',pg_temp.id(4)),
  (pg_temp.id(61),100,5,'Inicial',pg_temp.id(4));
insert into pagos (id, evento_id, catering_contrato_id, fecha_pago, forma_pago,
  importe_moneda_original, registrado_por)
values
  (pg_temp.id(203), pg_temp.id(30), pg_temp.id(60), '2026-11-11', 'cheque', 121, pg_temp.id(4)),
  (pg_temp.id(204), null, pg_temp.id(61), '2026-11-11', 'cheque', 90, pg_temp.id(4));
select pg_temp.check_true((select count(*) = 2 and sum(total_pagado) = 0
  from v_catering_acreditado), 'antes: ejecutiva sólo ve sus contratos; cheques pendientes en ambos flujos');
reset role;
create temporary table cheque_original as select * from pagos where id = pg_temp.id(200);
select set_config('request.jwt.claim.sub', '', true);
select software_eventos_private.sincronizar_cheques();
select pg_temp.check_true((select total_pagado = 50 from evento_servicios where id = pg_temp.id(50)),
  'la tarea no anticipa la acreditación');
set local eventos.test_dia = '2026-11-11';
select pg_temp.check_true((select total_pagado = 50 from evento_servicios where id = pg_temp.id(50)),
  'ninguna escritura entre el cambio de día y la lectura');
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.check_true((select total_pagado = 776 and iva_base_imponible = 600
    and total_con_iva = 1126 and saldo_pendiente = 350
  from v_evento_servicios_acreditados where id = pg_temp.id(50)), 'día indicado: vista acredita inmediatamente y aplica IVA parcial');
select pg_temp.check_true((select total_pagado_servicios = 776 and saldo_servicios = 350
    and total_pagado_catering = 121 from v_resumen_evento where id = pg_temp.id(30)),
  'día indicado: resumen aplica el mismo cobro de servicios y catering vinculado');
select pg_temp.check_true(not exists (select 1 from v_resumen_evento where id = pg_temp.id(31)),
  'resumen conserva aislamiento por salón');
select pg_temp.expect_error('select software_eventos_private.sincronizar_cheques()', '42501',
  'un vendedor no puede ejecutar la sincronización');
select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
select pg_temp.check_true((select total_pagado = 90 and saldo_pendiente = total_con_iva - 90
  from v_catering_acreditado where id = pg_temp.id(61)), 'día indicado: catering externo acredita sin evento');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select pg_temp.check_true(not exists (select 1 from v_resumen_evento)
  and not exists (select 1 from v_catering_acreditado)
  and not exists (select 1 from v_evento_servicios_acreditados), 'anon no ve balances');
reset role;

select set_config('request.jwt.claim.sub', '', true);
select software_eventos_private.sincronizar_cheques();
select pg_temp.check_true((select total_pagado = 776 and iva_base_imponible = 600
    and total_con_iva = 1126 and saldo_pendiente = 350 from evento_servicios where id = pg_temp.id(50)),
  'tarea sincroniza saldo persistido del servicio con IVA parcial');
select pg_temp.check_true((select sum(total_pagado) = 211 from catering_contratos where id in (pg_temp.id(60), pg_temp.id(61))),
  'tarea sincroniza ambos contratos de catering');
select pg_temp.check_true(exists (select 1 from audit_log where tabla = 'evento_servicios'
  and registro_id = pg_temp.id(50)::text and usuario_id is null and datos_nuevos->>'total_pagado' = '776.00'),
  'sincronización automática deja auditoría sin inventar un actor');
create temporary table audit_cheques as select count(*) as n from audit_log
where registro_id in (pg_temp.id(50)::text, pg_temp.id(60)::text, pg_temp.id(61)::text, pg_temp.id(200)::text);
set local eventos.test_dia = '2026-11-12';
select software_eventos_private.sincronizar_cheques();
select pg_temp.check_true((select total_pagado = 776 from evento_servicios where id = pg_temp.id(50))
  and (select n = (select count(*) from audit_log
    where registro_id in (pg_temp.id(50)::text, pg_temp.id(60)::text, pg_temp.id(61)::text, pg_temp.id(200)::text))
    from audit_cheques)
  and (select to_jsonb(p) = to_jsonb(o) from pagos p join cheque_original o using(id)),
  'día siguiente: sin doble cobro, auditoría duplicada ni cambios al pago original');

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
update pagos set fecha_pago = '2026-11-13' where id = pg_temp.id(200);
select pg_temp.check_true((select total_pagado = 50 and saldo_pendiente = 1076 from evento_servicios where id = pg_temp.id(50)),
  'editar fecha vuelve a pendiente y conserva base de IVA ya consolidada');
update pagos set fecha_pago = '2026-11-12', importe_moneda_original = 121 where id = pg_temp.id(200);
select pg_temp.check_true((select total_pagado = 171 from evento_servicios where id = pg_temp.id(50)),
  'editar un cheque acreditado aplica sólo el importe vigente');
update pagos set deleted_at = now() where id = pg_temp.id(200);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select software_eventos_private.sincronizar_cheques();
select pg_temp.check_true((select total_pagado = 50 and saldo_pendiente = 1076 from evento_servicios where id = pg_temp.id(50))
  and exists (select 1 from audit_log where tabla = 'pagos' and registro_id = pg_temp.id(200)::text
    and accion = 'SOFT_DELETE' and usuario_id = pg_temp.id(2)),
  'baja lógica no vuelve a sumar el cheque y conserva auditoría del vendedor');
