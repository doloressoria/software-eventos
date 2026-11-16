-- Escrituras exclusivamente ficticias en el clúster efímero.
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into recibo_emisores(marca) values ('Negocio ficticio');
insert into pagos(id,evento_id,evento_servicio_id,fecha_pago,forma_pago,moneda,tipo_cambio,importe_moneda_original,registrado_por)
values(pg_temp.id(1100),pg_temp.id(30),pg_temp.id(50),'2099-12-01','cheque','ARS',1,100,pg_temp.id(2));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.check_true((previsualizar_recibo(pg_temp.id(1100))->>'marca')='Salón A','emisor global externo no reemplaza la marca del salón');
select pg_temp.check_true((previsualizar_recibo(pg_temp.id(1100))->>'estado_acreditacion')='Recibido pendiente de acreditación','preview cheque no cancela deuda');
select emitir_recibo(pg_temp.id(1100));
select pg_temp.check_true(emitir_recibo(pg_temp.id(1100))=(select id from recibos where pago_id=pg_temp.id(1100)),'reintento devuelve original');
select pg_temp.check_true((select count(*)=1 from recibos where pago_id=pg_temp.id(1100)),'sin duplicados');
select pg_temp.expect_error('update recibos set numero=9999','42501','no se escribe directamente');
select pg_temp.expect_error('delete from recibos','42501','no se borran recibos');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.check_true((select count(*)=0 from recibos),'otro salón no ve comprobantes');
select pg_temp.expect_error(format('select emitir_recibo(%L)',pg_temp.id(1100)),'42501','otro salón no emite');
select set_config('request.jwt.claim.sub',pg_temp.id(6)::text,true);
select pg_temp.check_true((select count(*)=0 from recibos),'inactivo no lee');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
create temporary table recibo_original as select * from recibos where pago_id=pg_temp.id(1100);
update eventos set cliente_nombre='Cliente modificado' where id=pg_temp.id(30);
select pg_temp.check_true((select r.snapshot=o.snapshot from recibos r join recibo_original o using(id)),'cambio de cliente no reescribe original');
update pagos set importe_moneda_original=120 where id=pg_temp.id(1100);
set constraints all immediate;
set constraints all deferred;
select pg_temp.check_true((select count(*)=2 from recibos where pago_id=pg_temp.id(1100)),'corrección genera documento vinculado');
select pg_temp.check_true((select anterior_id=(select id from recibo_original) and tipo='modificacion' and snapshot#>>'{pago,importe_en_pesos}'='120.00' from recibos where pago_id=pg_temp.id(1100) and revision=2),'corrección contiene importe final');
update pagos set deleted_at=now() where id=pg_temp.id(1100);
set constraints all immediate;
set constraints all deferred;
select pg_temp.check_true((select count(*)=3 from recibos where pago_id=pg_temp.id(1100)),'baja conserva historia y anulación');
select pg_temp.check_true((select tipo='anulacion' and snapshot->>'estado_acreditacion'='Anulado' from recibos where pago_id=pg_temp.id(1100) and revision=3),'anulación explícita');
select pg_temp.check_true((select r.snapshot=o.snapshot from recibos r join recibo_original o using(id)),'original inmutable después de baja');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.check_true((select count(*)=3 from recibos where pago_id=pg_temp.id(1100)),'usuario original accede a historia anulada');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into pagos(id,catering_contrato_id,fecha_pago,forma_pago,moneda,tipo_cambio,importe_moneda_original,es_garantia,registrado_por)
values(pg_temp.id(1101),pg_temp.id(61),'2026-11-16','transferencia','USD',1200,83.33,true,pg_temp.id(4));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select emitir_recibo(pg_temp.id(1101));
select pg_temp.check_true((select snapshot->>'marca'='Negocio ficticio' from recibos where pago_id=pg_temp.id(1101)),'externo sin salón usa marca global configurada');
select pg_temp.check_true((select snapshot->>'garantia'='true' and snapshot#>>'{pago,importe_en_pesos}'='99996.00' from recibos where pago_id=pg_temp.id(1101)),'catering externo propio, USD histórico y garantía');
select pg_temp.expect_error(format('select emitir_recibo(%L)',pg_temp.id(1100)),'42501','acceso parcial no emite cabecera completa');
select set_config('request.jwt.claim.sub',pg_temp.id(5)::text,true);
select pg_temp.check_true((select count(*)=0 from recibos),'ejecutiva ajena no ve externo');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
-- Caso fresco para concurrencia y varias tarifas históricas seleccionadas.
insert into catering_contratos(id,evento_id,ejecutiva_id,pax_adultos,iva_porcentaje,version_calculo)
values(pg_temp.id(1110),pg_temp.id(30),pg_temp.id(4),100,0,2);
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos) values(pg_temp.id(1110),100,100);
select guardar_pago_por_personas(pg_temp.id(1110),pg_temp.id(1111),
'{"fecha_pago":"2026-11-16","forma_pago":"transferencia","moneda":"ARS","tipo_cambio":1,"importe_moneda_original":5000,"es_garantia":false,"capital_ars":5000,"iva_ars":0}',
'[{"categoria":"adultos","cantidad":50,"precio_aplicado":100}]');
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,fecha) values(pg_temp.id(1110),200,100,'2099-01-01');
select guardar_pago_por_personas(pg_temp.id(1110),pg_temp.id(1112),
'{"fecha_pago":"2026-11-16","forma_pago":"transferencia","moneda":"ARS","tipo_cambio":1,"importe_moneda_original":10000,"es_garantia":false,"capital_ars":10000,"iva_ars":0}',
'[{"categoria":"adultos","cantidad":50,"precio_aplicado":200}]');
update catering_contratos set pax_adultos=90 where id=pg_temp.id(1110);
select emitir_recibo(pg_temp.id(1112));
select pg_temp.check_true((select tarifas_historicas=2 from v_catering_tarifas where catering_contrato_id=pg_temp.id(1110) and categoria='adultos'),'dos tarifas históricas disponibles');
select pg_temp.expect_error(format('select reasignar_excedente_catering(%L,%L,%L,10,%L,false,0,1999)',pg_temp.id(1110),pg_temp.id(1112),'adultos',pg_temp.id(50)),'40001','rechaza preview desactualizado');
select reasignar_excedente_catering(pg_temp.id(1110),pg_temp.id(1112),'adultos',10,pg_temp.id(50),false,0,2000);
set constraints all immediate;
set constraints all deferred;
select pg_temp.check_true((select liberada=10 from catering_coberturas where pago_id=pg_temp.id(1112)),'libera origen explícito a tarifa 200');
select pg_temp.check_true((select liberada=0 from catering_coberturas where pago_id=pg_temp.id(1111)),'conserva origen no seleccionado');
select pg_temp.check_true((select sum(importe_en_pesos)=15000 from pagos where id in(pg_temp.id(1111),pg_temp.id(1112))),'reasignar no inventa ingreso');
select pg_temp.check_true((select count(*)=2 from recibos where pago_id=pg_temp.id(1112)),'reasignación genera un solo comprobante final');
select pg_temp.check_true((select sum((i->>'importe_ars')::numeric)=10000 from recibos r cross join lateral jsonb_array_elements(r.snapshot->'imputaciones') i where r.pago_id=pg_temp.id(1112) and r.revision=2),'comprobante corregido concilia repartos');
select pg_temp.expect_error(format('select reasignar_excedente_catering(%L,%L,%L,10,%L,false,0,2000)',pg_temp.id(1110),pg_temp.id(1112),'adultos',pg_temp.id(50)),'23514','reintento no libera otra vez');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.expect_error(format('select reasignar_excedente_catering(%L,%L,%L,1,%L,false,0,100)',pg_temp.id(1110),pg_temp.id(1111),'adultos',pg_temp.id(50)),'42501','selección explícita conserva autorización de autor/admin');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into pagos(id,evento_id,evento_servicio_id,fecha_pago,forma_pago,moneda,tipo_cambio,importe_moneda_original,registrado_por)
values(pg_temp.id(1190),pg_temp.id(30),pg_temp.id(50),'2026-11-16','transferencia','ARS',1,100,pg_temp.id(2));
update role_permissions set can_manage=false where role_id=pg_temp.id(10) and screen='eventos';
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select emitir_recibo(pg_temp.id(1190));
select pg_temp.check_true((select count(*)=1 from recibos where pago_id=pg_temp.id(1190)),'permiso de lectura sin gestión puede emitir y leer');
reset role;
update role_permissions set can_manage=true where role_id=pg_temp.id(10) and screen='eventos';
select pg_temp.check_true(not has_function_privilege('anon','public.emitir_recibo(uuid)','EXECUTE') and not has_function_privilege('anon','public.previsualizar_recibo(uuid)','EXECUTE'),'RPC no accesible anónimamente');
select pg_temp.check_true(not has_function_privilege('authenticated','software_eventos_private.recibo_snapshot(uuid)','EXECUTE') and not has_function_privilege('authenticated','software_eventos_private.recibo_fuente(uuid)','EXECUTE'),'helpers de instantánea no son API pública');
select pg_temp.check_true((select count(*)=0 from public.recibos r join public.recibos a on a.id=r.anterior_id where r.pago_id<>a.pago_id or r.revision<>a.revision+1),'cadena vinculada por el mismo cobro');
select pg_temp.expect_error('update public.recibos set numero=numero+10000','23514','inmutabilidad también protege escrituras del propietario');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.check_true((select count(*)=1 from v_pago_imputaciones where pago_id=pg_temp.id(1112) and catering_contrato_id=pg_temp.id(1110)),'ejecutiva ve su parte del cobro distribuido');
select pg_temp.check_true((select count(*)=0 from recibos where pago_id=pg_temp.id(1112)),'RLS no entrega snapshot completo a quien sólo ve una parte');
select pg_temp.expect_error(format('select previsualizar_recibo(%L)',pg_temp.id(1112)),'42501','preview rechaza alcance parcial distribuido');
select pg_temp.expect_error(format('select emitir_recibo(%L)',pg_temp.id(1112)),'42501','emisión rechaza alcance parcial distribuido');
reset role;
