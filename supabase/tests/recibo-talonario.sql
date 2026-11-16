reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.check_true(not exists(select 1 from recibos_v1_antes a join recibos r using(id) where a.snapshot<>r.snapshot or a.fuente<>r.fuente),'rediseño conserva todas las instantáneas y fuentes emitidas');
select pg_temp.check_true((select bool_and((snapshot->>'version')::int=1) from recibos_v1_antes),'recibos anteriores siguen en formato 1');
insert into pagos(id,evento_id,evento_servicio_id,fecha_pago,forma_pago,moneda,tipo_cambio,importe_moneda_original,registrado_por)
values(pg_temp.id(1200),pg_temp.id(30),pg_temp.id(50),'2026-11-16','transferencia','ARS',1,100,pg_temp.id(2));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.check_true((previsualizar_recibo(pg_temp.id(1200))->>'version')::int=2,'preview nuevo usa formato talonario');
select emitir_recibo(pg_temp.id(1200));
select pg_temp.check_true((select (snapshot->>'version')::int=2 and snapshot#>>'{imputaciones,0,categoria}'='salon' from recibos where pago_id=pg_temp.id(1200)),'emisión nueva guarda versión 2 y categoría real del servicio');
select pg_temp.check_true(emitir_recibo(pg_temp.id(1190))=(select id from recibos where pago_id=pg_temp.id(1190) and revision=1),'reemitir un recibo previo conserva su identidad');
update pagos set importe_moneda_original=150 where id=pg_temp.id(1190);
set constraints all immediate;
set constraints all deferred;
select pg_temp.check_true((select (snapshot->>'version')::int=1 from recibos where pago_id=pg_temp.id(1190) and revision=1),'corrección mantiene formato original');
select pg_temp.check_true((select (snapshot->>'version')::int=2 and anterior_id is not null from recibos where pago_id=pg_temp.id(1190) and revision=2),'corrección vinculada adopta formato nuevo');
reset role;
select pg_temp.check_true(not exists(select 1 from recibos_v1_antes a join recibos r using(id) where a.snapshot<>r.snapshot or a.fuente<>r.fuente),'ni emitir ni corregir reescribe recibos antiguos');
