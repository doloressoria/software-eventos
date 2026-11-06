set local role authenticated;
update catering_contratos set notas='Recalcular' where id=pg_temp.id(60);
select pg_temp.check_true((select total_con_iva=1815 and total_sin_iva=1500
  from catering_contratos where id=pg_temp.id(60)), 'misma formula comercial sin recálculo HTTP');
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,motivo,created_at)
values(pg_temp.id(60),110,13,'Recotizar',now()+interval '1 second');
select pg_temp.check_true((select pax_adultos=13 and total_con_iva=2093.30
  from catering_contratos where id=pg_temp.id(60)), 'precio, PAX y total persisten juntos');
update catering_contratos set pax_adultos=12, total_con_iva=1 where id=pg_temp.id(60);
select pg_temp.check_true((select total_con_iva=1960.20 from catering_contratos where id=pg_temp.id(60)),
  'editar PAX recalcula; un total enviado por cliente no reemplaza origen');
reset role;
create function pg_temp.reject_pax() returns trigger language plpgsql as $$
begin
  if new.pax_adultos=14 then raise exception 'Falla simulada' using errcode='23514'; end if;
  return new;
end;
$$;
create trigger zz_test_reject_pax before update on catering_contratos
for each row execute function pg_temp.reject_pax();
set local role authenticated;
select pg_temp.expect_error($s$insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,motivo)
  values(pg_temp.id(60),120,14,'Falla')$s$, '23514', 'falla de PAX rechaza la recotización completa');
select pg_temp.check_true((select count(*)=2 from catering_precio_historial where catering_contrato_id=pg_temp.id(60))
  and (select pax_adultos=12 and total_con_iva=1960.20 from catering_contratos where id=pg_temp.id(60)),
  'falla conserva historial, PAX y total anteriores');
insert into pagos(catering_contrato_id,evento_id,fecha_pago,forma_pago,moneda,tipo_cambio,importe_moneda_original)
values(pg_temp.id(60),pg_temp.id(30),'2026-12-01','efectivo_dolares','USD',100,2);
insert into pagos(catering_contrato_id,evento_id,fecha_pago,forma_pago,importe_moneda_original,es_garantia)
values(pg_temp.id(60),pg_temp.id(30),'2026-12-01','efectivo_pesos',50,true);
select pg_temp.check_true((select total_pagado=200 and saldo_pendiente=1760.20 and total_con_iva=1960.20
  from catering_contratos where id=pg_temp.id(60)), 'pago USD y garantía mantienen total y saldo en transacción');
update pagos set deleted_at=now() where catering_contrato_id=pg_temp.id(60);
select pg_temp.check_true((select total_pagado=0 and saldo_pendiente=1960.20 from catering_contratos where id=pg_temp.id(60)),
  'baja de pagos actualiza saldo sin solicitud adicional');
delete from catering_items where catering_contrato_id=pg_temp.id(60);
select pg_temp.check_true((select total_con_iva=1839.20 from catering_contratos where id=pg_temp.id(60)),
  'baja de adicional conserva precio y comisión');

select pg_temp.expect_error($s$select crear_catering_con_precio(
  jsonb_build_object('cliente_nombre','Falla inicial','lugar_evento','LAB','fecha_evento','2026-12-03','ejecutiva_id',pg_temp.id(4)),10,'')$s$,
  '23514', 'precio inicial rechazado revierte alta de contrato');
select pg_temp.check_true(not exists(select 1 from catering_contratos where cliente_nombre='Falla inicial'),
  'no queda alta parcial para reintentar');
select crear_catering_con_precio(jsonb_build_object('cliente_nombre','Alta atómica','lugar_evento','LAB','fecha_evento','2026-12-03',
  'ejecutiva_id',pg_temp.id(4),'pax_adultos',2,'iva_porcentaje',.21,'total_con_iva',999,'deleted_at',now()),10,'Inicial');
select pg_temp.check_true((select total_con_iva=24.20 and deleted_at is null and
  (select count(*)=1 from catering_precio_historial where catering_contrato_id=c.id)
  from catering_contratos c where cliente_nombre='Alta atómica'), 'alta y precio juntos; ignora totales y baja inyectados');

select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.expect_error($s$insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos)
  values(pg_temp.id(63),110,3)$s$, '42501', 'vendedor no recotiza salón ajeno');
select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(30),'ejecutiva_id',pg_temp.id(4),
  'cliente_nombre','Propio vendedor','pax_adultos',1,'iva_porcentaje',.21),100,'Inicial');
select pg_temp.check_true((select total_con_iva=121 from catering_contratos where cliente_nombre='Propio vendedor'),
  'vendedor crea en salón asignado con RLS');
select pg_temp.expect_error($s$select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(31),
  'ejecutiva_id',pg_temp.id(4)),100,'Inicial')$s$, '42501', 'RPC no permite alta en salón ajeno');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select crear_catering_con_precio(jsonb_build_object('ejecutiva_id',pg_temp.id(4),
  'cliente_nombre','Externo ejecutiva','lugar_evento','LAB','fecha_evento','2026-12-03','pax_adultos',2,'iva_porcentaje',.21),10,'Inicial');
select pg_temp.check_true((select total_con_iva=24.20 from catering_contratos where cliente_nombre='Externo ejecutiva'),
  'ejecutiva crea externo propio');
select set_config('request.jwt.claim.sub',pg_temp.id(6)::text,true);
select pg_temp.expect_error($s$select crear_catering_con_precio('{}',10,'Inicial')$s$,'42501','inactivo rechazado');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error($s$select crear_catering_con_precio('{}',10,'Inicial')$s$,'42501','anon sin RPC');
reset role;
select pg_temp.check_true(not has_function_privilege('authenticated','software_eventos_private.catering_compute_totals()','execute'),
  'función privilegiada del trigger no es ejecutable por cliente');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into auth.users values(pg_temp.id(7));
insert into usuarios(id,full_name,email,rol) values(pg_temp.id(7),'Lectura','r@example.invalid','vendedor');
insert into roles(id,nombre) values(pg_temp.id(12),'Lectura catering');
insert into role_permissions values(pg_temp.id(12),'catering',false);
insert into usuario_roles values(pg_temp.id(7),pg_temp.id(12),now());
insert into usuario_salon values(pg_temp.id(7),pg_temp.id(20),now());
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(7)::text,true);
select pg_temp.expect_error($s$select crear_catering_con_precio('{}',10,'Inicial')$s$,'42501','sólo lectura sin alta');
select pg_temp.expect_error($s$insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos)
  values(pg_temp.id(60),110,3)$s$,'42501','sólo lectura sin recotización');
reset role;
