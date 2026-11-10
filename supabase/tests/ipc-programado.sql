select pg_temp.check_true(not exists (
  select datos from ipc_servicios_antes except select to_jsonb(s)-'ajuste_ipc' from evento_servicios s
) and not exists (
  select datos from ipc_catering_antes except select to_jsonb(c)-'ajuste_ipc' from catering_contratos c
), 'migracion conserva todos los contratos y saldos anteriores sin backfill');
-- Fictional data only. The runner owns and destroys the entire PostgreSQL cluster.
reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
set local eventos.test_dia = '2026-11-19';
update eventos set estado='borrador';
insert into eventos(id,salon_id,vendedor_id,cliente_nombre,fecha_evento,estado) values
 (pg_temp.id(330),pg_temp.id(20),pg_temp.id(2),'IPC confirmado','2026-12-01','confirmado'),
 (pg_temp.id(331),pg_temp.id(20),pg_temp.id(2),'Confirma despues de preview','2026-12-01','borrador'),
 (pg_temp.id(332),pg_temp.id(20),pg_temp.id(2),'Baja logica','2026-12-01','confirmado'),
 (pg_temp.id(333),pg_temp.id(20),pg_temp.id(2),'Evento vencido','2026-11-18','confirmado'),
 (pg_temp.id(334),pg_temp.id(20),pg_temp.id(2),'Cancela despues de preview','2026-12-01','confirmado');
update eventos set deleted_at=now() where id=pg_temp.id(332);
insert into evento_servicios(id,evento_id,servicio_id,precio_base,iva_base_imponible,iva_porcentaje)
select pg_temp.id(n),pg_temp.id(case n when 357 then 331 when 358 then 332 when 359 then 333 when 356 then 334 else 330 end),
 pg_temp.id(40),82644.63,82644.63,.21 from generate_series(350,359) n;
insert into catering_contratos(id,evento_id,ejecutiva_id,pax_jovenes,iva_porcentaje) values
 (pg_temp.id(360),pg_temp.id(330),pg_temp.id(4),1,0),
 (pg_temp.id(361),pg_temp.id(330),pg_temp.id(4),15,0);
insert into catering_precio_historial(catering_contrato_id,precio_unitario,precio_jovenes,pax_jovenes,fecha,usuario_id) values
 (pg_temp.id(360),100000,100000,1,'2026-11-19',pg_temp.id(1)),
 (pg_temp.id(361),40000,40000,15,'2026-11-19',pg_temp.id(1));
insert into pagos(id,evento_id,evento_servicio_id,forma_pago,fecha_pago,importe_moneda_original,es_garantia)
select pg_temp.id(n+60),pg_temp.id(330),pg_temp.id(n),'efectivo_pesos','2026-11-19',60000,false
from unnest(array[350,351]) n;
insert into pagos(id,evento_id,evento_servicio_id,forma_pago,fecha_pago,importe_moneda_original,es_garantia) values
 (pg_temp.id(401),pg_temp.id(330),pg_temp.id(351),'cheque','2026-11-20',40000,false),
 (pg_temp.id(404),pg_temp.id(330),pg_temp.id(354),'cheque','2026-11-21',40000,false),
 (pg_temp.id(405),pg_temp.id(330),pg_temp.id(355),'efectivo_pesos','2026-11-19',60000,true),
 (pg_temp.id(406),pg_temp.id(330),pg_temp.id(355),'efectivo_pesos','2026-11-19',20000,false);
update pagos set deleted_at=now() where id=pg_temp.id(406);
insert into pagos(id,evento_id,evento_servicio_id,forma_pago,fecha_pago,moneda,tipo_cambio,importe_moneda_original)
values (pg_temp.id(403),pg_temp.id(330),pg_temp.id(353),'efectivo_dolares','2026-11-19','USD',100,600);
select guardar_pago_distribuido(pg_temp.id(330),pg_temp.id(402),false,
 jsonb_build_object('fecha_pago','2026-11-19','forma_pago','efectivo_pesos','moneda','ARS','tipo_cambio',1,'importe_moneda_original',90000,'es_garantia',false),
 jsonb_build_array(jsonb_build_object('evento_servicio_id',pg_temp.id(352),'importe_ars',60000),
 jsonb_build_object('catering_contrato_id',pg_temp.id(360),'importe_ars',30000)));
select guardar_pago_por_personas(pg_temp.id(361),pg_temp.id(407),
 jsonb_build_object('fecha_pago','2026-11-19','forma_pago','efectivo_pesos','moneda','ARS','tipo_cambio',1,'importe_moneda_original',400000,'es_garantia',false),
 jsonb_build_array(jsonb_build_object('categoria','jovenes','cantidad',10,'precio_aplicado',40000)),pg_temp.id(330));
create temporary table ipc_pagos_originales as select * from pagos;
create temporary table ipc_cobertura_original as select * from catering_coberturas;
create temporary table ipc_precios_originales as select * from catering_precio_historial;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.expect_error('select programar_ipc(''2026-10-01'',''2026-11-20'',10)', '42501','vendedor no programa IPC aunque pueda manejar pagos');
select pg_temp.expect_error('select * from previsualizar_ipc_programado(''2026-10-01'',''2026-11-20'',10)', '42501','vendedor no previsualiza todos los salones');
select pg_temp.expect_error('select software_eventos_private.ejecutar_ipc_programados()', '42501','worker no es ejecutable por cliente');
select set_config('request.jwt.claim.sub',pg_temp.id(6)::text,true);
select pg_temp.expect_error('select programar_ipc(''2026-10-01'',''2026-11-20'',10)', '42501','usuario inactivo no programa');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.expect_error('select programar_ipc(''infinity'',''infinity'',10)', '22023','RPC rechaza fechas infinitas');
select pg_temp.expect_error('select programar_ipc(''2026-10-01'',''2026-11-18'',10)', '22023','no permite retrodatacion');
select pg_temp.expect_error('select programar_ipc(''2026-10-01'',''2026-11-20'',''NaN''::numeric)', '22023','rechaza NaN');
select pg_temp.expect_error('select programar_ipc(''2026-10-01'',''2026-11-20'',''Infinity''::numeric)', '22023','rechaza infinito');
select pg_temp.expect_error('select programar_ipc(''2026-10-01'',''2026-11-20'',-100)', '22023','rechaza reduccion total');
select pg_temp.expect_error('select * from previsualizar_ipc_programado(''2026-10-01'',''2026-11-20'',null)', 'P0002','sin indice la preview muestra un motivo');
select programar_ipc('2026-10-01','2026-11-20',10);
select pg_temp.check_true(
 (select saldo_anterior=40000 and incremento=4000 and saldo_proyectado=44000
 from previsualizar_ipc_programado('2026-10-01','2026-11-20',10) where evento_servicio_id=pg_temp.id(350)),
 'preview de servicio parcialmente pagado: 40000, 4000, 44000');
select pg_temp.check_true(
 (select saldo_anterior=0 and incremento=0 and saldo_proyectado=0
 from previsualizar_ipc_programado('2026-10-01','2026-11-20',10) where evento_servicio_id=pg_temp.id(351)),
 'preview reconoce el cheque que acredita el mismo dia de vigencia');
select pg_temp.check_true(
 (select saldo_anterior=200000 and incremento=20000 and saldo_proyectado=220000
 from previsualizar_ipc_programado('2026-10-01','2026-11-20',10) where catering_contrato_id=pg_temp.id(361)),
 'preview catering con diez de quince jovenes cubiertos ajusta solo cinco');
select pg_temp.check_true(not exists(select 1 from ipc_aplicaciones), 'preview y programacion no escriben ajustes');
select programar_ipc('2026-11-01','2026-11-20',null);
reset role;
select set_config('request.jwt.claim.sub','',true);
select software_eventos_private.ejecutar_ipc_programados();
select pg_temp.check_true(not exists(select 1 from ipc_aplicaciones), 'no ejecuta antes de la vigencia');

-- Eligibility changes after preview, including a new target and a payment.
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
update eventos set estado='confirmado' where id=pg_temp.id(331);
update eventos set estado='cancelado' where id=pg_temp.id(334);
insert into evento_servicios(id,evento_id,servicio_id,precio_base,iva_porcentaje)
values (pg_temp.id(370),pg_temp.id(330),pg_temp.id(40),1000,0),
 (pg_temp.id(371),pg_temp.id(330),pg_temp.id(40),1000,0);
insert into pagos(evento_id,evento_servicio_id,forma_pago,fecha_pago,importe_moneda_original)
values (pg_temp.id(330),pg_temp.id(350),'efectivo_pesos','2026-11-19',10000);
set local eventos.test_dia='2026-11-20';
select set_config('request.jwt.claim.sub','',true);
select software_eventos_private.ejecutar_ipc_programados();
select pg_temp.check_true((select estado='aplicado' from ipc_programaciones where periodo='2026-10-01'), 'worker sin JWT ejecuta en vigencia argentina');
select pg_temp.check_true((select base_ajustada=30000 and incremento=3000 and saldo_resultante=33000
 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(350)), 'ejecucion recalcula pagos desde la preview');
select pg_temp.check_true((select incremento=0 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(351))
 and (select total_pagado=100000 and round(saldo_pendiente,2)=0 from evento_servicios where id=pg_temp.id(351)),
 'acredita cheque antes del IPC aunque el job de cheques no haya corrido');
select pg_temp.check_true((select base_ajustada=40000 and incremento=4000 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(352))
 and (select base_ajustada=70000 and incremento=7000 from ipc_aplicaciones where catering_contrato_id=pg_temp.id(360)),
 'pago repartido reduce cada destino exactamente una vez');
select pg_temp.check_true((select incremento=4000 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(353)), 'usa cotizacion historica USD');
select pg_temp.check_true((select incremento=10000 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(354)), 'cheque futuro no reduce base');
select pg_temp.check_true((select incremento=10000 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(355)), 'garantias y bajas no reducen base');
select pg_temp.check_true((select incremento=20000 and saldo_resultante=220000 from ipc_aplicaciones where catering_contrato_id=pg_temp.id(361))
 and (select ajuste_ipc=20000 and saldo_pendiente=220000 from catering_contratos where id=pg_temp.id(361))
 and (select saldo_pendiente=220000 from v_catering_acreditado where id=pg_temp.id(361)),
 'PAX: cinco pendientes mas cargo IPC; tabla y vista coinciden');
select pg_temp.check_true(exists(select 1 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(357))
 and exists(select 1 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(370))
 and not exists(select 1 from ipc_aplicaciones where evento_servicio_id in (pg_temp.id(356),pg_temp.id(358),pg_temp.id(359))),
 'recalcula confirmacion, cancelacion, bajas, fechas y destinos nuevos');
select pg_temp.check_true(not exists(select 1 from ipc_aplicaciones a join catering_contratos c on c.id=a.catering_contrato_id where c.evento_id is null),
 'catering externo no se ajusta');
select pg_temp.check_true(not exists(select 1 from catering_coberturas x join ipc_cobertura_original o using(pago_id,categoria) where to_jsonb(x)<>to_jsonb(o))
 and not exists(select 1 from catering_precio_historial x join ipc_precios_originales o using(id) where to_jsonb(x)<>to_jsonb(o))
 and not exists(select 1 from pagos x join ipc_pagos_originales o using(id) where to_jsonb(x)<>to_jsonb(o)),
 'IPC conserva cabeceras USD/ARS, bajas, coberturas y tarifas historicas');
select pg_temp.check_true((select estado='sin_indice' and motivo is not null from ipc_programaciones where periodo='2026-11-01'), 'sin indice no aplica y registra motivo');
create temporary table ipc_una_vez as select * from ipc_aplicaciones;
select software_eventos_private.ejecutar_ipc_programados();
select pg_temp.check_true((select count(*) from ipc_una_vez)=(select count(*) from ipc_aplicaciones), 'reintento no duplica aplicaciones');
select pg_temp.check_true(exists(select 1 from audit_log where tabla='ipc_aplicaciones' and accion='INSERT' and usuario_id is null)
 and exists(select 1 from audit_log where tabla='ipc_programaciones' and usuario_id=pg_temp.id(1)), 'auditoria distingue autor de programacion y ejecucion automatica');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.expect_error('insert into ipc_aplicaciones(programacion_id) values(gen_random_uuid())','42501','ledger no admite escritura directa');
select pg_temp.expect_error('update ipc_programaciones set estado=''aplicado''','42501','cliente no puede marcar ejecucion aplicada');
select pg_temp.expect_error('select registrar_y_aplicar_ipc(''2027-01-01'',10)','0A000','RPC anterior no puede evitar la vigencia');
select pg_temp.check_true(programar_ipc('2026-10-01','2026-11-20',10)=(select id from ipc_programaciones where periodo='2026-10-01'), 'reintento de programacion aplicada es idempotente');
select pg_temp.expect_error('select programar_ipc(''2026-10-01'',''2026-11-21'',10)','23505','periodo aplicado no admite nueva fecha');
update evento_servicios set ajuste_ipc=999999 where id=pg_temp.id(350);
update catering_contratos set ajuste_ipc=999999 where id=pg_temp.id(361);
select pg_temp.check_true((select ajuste_ipc=3000 from evento_servicios where id=pg_temp.id(350))
 and (select ajuste_ipc=20000 from catering_contratos where id=pg_temp.id(361)), 'columnas derivadas ignoran manipulacion cliente');
-- Missing-index schedule can be completed on its effective date.
select programar_ipc('2026-11-01','2026-11-20',0);
reset role;
select set_config('request.jwt.claim.sub','',true);
select software_eventos_private.ejecutar_ipc_programados();
select pg_temp.check_true((select estado='aplicado' from ipc_programaciones where periodo='2026-11-01')
 and not exists(select 1 from ipc_aplicaciones a join ipc_programaciones s on s.id=a.programacion_id
 where s.periodo='2026-11-01' and incremento<>0), 'carga tardia del indice cero durante la vigencia se ejecuta sin duplicados');

select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select programar_ipc('2026-12-01','2026-11-20',10);
set local eventos.test_dia='2026-11-21';
select set_config('request.jwt.claim.sub','',true);
select software_eventos_private.ejecutar_ipc_programados();
select pg_temp.check_true((select estado='revision' and motivo is not null and ejecutado_at is null from ipc_programaciones where periodo='2026-12-01')
 and not exists(select 1 from ipc_aplicaciones a join ipc_programaciones s on s.id=a.programacion_id where s.periodo='2026-12-01'), 'ejecucion demorada no inventa saldo historico');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.check_true(programar_ipc('2026-10-01','2026-11-20',10)=(select id from ipc_programaciones where periodo='2026-10-01'),
 'reintento de un periodo aplicado devuelve la misma identidad incluso despues de su vigencia');
set local eventos.test_dia='2026-11-20';
-- Force an internal failure after the first target; everything must roll back.
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select programar_ipc('2027-01-01','2026-11-20',-10);
create temporary table ipc_antes_error as select id,ajuste_ipc,saldo_pendiente from evento_servicios;
create function pg_temp.fallar_ipc() returns trigger language plpgsql as $$
begin
  if new.evento_servicio_id=pg_temp.id(351) then raise exception 'Fallo ficticio' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger prueba_fallo before insert on ipc_aplicaciones for each row execute function pg_temp.fallar_ipc();
select set_config('request.jwt.claim.sub','',true);
select software_eventos_private.ejecutar_ipc_programados();
select pg_temp.check_true((select estado='error' and motivo like '%23514%' from ipc_programaciones where periodo='2027-01-01')
 and not exists(select 1 from ipc_aplicaciones a join ipc_programaciones s on s.id=a.programacion_id where s.periodo='2027-01-01')
 and not exists(select 1 from evento_servicios x join ipc_antes_error o using(id)
 where x.ajuste_ipc<>o.ajuste_ipc or x.saldo_pendiente<>o.saldo_pendiente), 'fallo interno revierte todos los destinos y registra error sin datos sensibles');
drop trigger prueba_fallo on ipc_aplicaciones;
select software_eventos_private.ejecutar_ipc_programados();
select pg_temp.check_true((select estado='aplicado' from ipc_programaciones where periodo='2027-01-01')
 and (select bool_and(incremento=round(base_ajustada*-.1,2)) from ipc_aplicaciones a
 join ipc_programaciones s on s.id=a.programacion_id where s.periodo='2027-01-01'), 'reintento tras fallo aplica una unica reduccion valida');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.check_true(not exists(select 1 from ipc_programaciones) and not exists(select 1 from ipc_aplicaciones), 'roles operativos no leen ejecuciones globales');
select pg_temp.check_true(not exists(select 1 from v_evento_servicios_acreditados where evento_id=pg_temp.id(330)), 'se conserva aislamiento por salon tras el ajuste');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
delete from evento_servicios where id=pg_temp.id(371);
select pg_temp.check_true(exists(select 1 from ipc_aplicaciones where evento_servicio_id=pg_temp.id(371)),
 'el flujo existente puede eliminar un servicio sin pagos y conserva el registro IPC historico');
