-- Sólo en el clúster efímero: el mismo caso combinado del ejemplo XLSX.
reset role;
set local eventos.test_dia = '2026-11-20';
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
insert into eventos(id,salon_id,vendedor_id,cliente_nombre,nombre_evento,fecha_evento)
values(pg_temp.id(400),pg_temp.id(20),pg_temp.id(2),'Cliente ficticio','Celebración ficticia','2027-03-06');
insert into evento_servicios(id,evento_id,servicio_id,precio_base,iva_base_imponible,iva_porcentaje)
values(pg_temp.id(401),pg_temp.id(400),pg_temp.id(40),10000,0,0);
insert into catering_contratos(id,evento_id,ejecutiva_id,pax_adultos,iva_porcentaje)
values(pg_temp.id(402),pg_temp.id(400),pg_temp.id(4),4,0);
insert into catering_precio_historial(catering_contrato_id,fecha,precio_unitario,pax_adultos)
values(pg_temp.id(402),'2026-11-01',500,4);
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select guardar_pago_por_personas(pg_temp.id(402),pg_temp.id(403),
  pg_temp.pax_cabecera(1000),pg_temp.cobertura('adultos',2,500),pg_temp.id(400));
reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
insert into catering_precio_historial(catering_contrato_id,fecha,precio_unitario,pax_adultos)
values(pg_temp.id(402),'2026-11-20',900,4);
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select guardar_pago_distribuido(pg_temp.id(400),pg_temp.id(404),false,
  jsonb_build_object('fecha_pago','2026-11-20','forma_pago','efectivo_dolares','moneda','USD',
    'tipo_cambio',1000,'importe_moneda_original',2,'es_garantia',false),
  jsonb_build_array(
    jsonb_build_object('evento_servicio_id',pg_temp.id(401),'importe_ars',1200),
    jsonb_build_object('catering_contrato_id',pg_temp.id(402),'importe_ars',800)));
select guardar_pago_por_personas(pg_temp.id(402),pg_temp.id(405),
  pg_temp.pax_cabecera(900,'2026-11-21','cheque') || '{"banco":"Banco ficticio","numero_cheque":"0000123"}',
  pg_temp.cobertura('adultos',1,900),pg_temp.id(400));
insert into pagos(id,evento_id,evento_servicio_id,fecha_pago,forma_pago,importe_moneda_original,es_garantia,registrado_por)
values(pg_temp.id(406),pg_temp.id(400),pg_temp.id(401),'2026-11-20','efectivo_pesos',300,true,auth.uid()),
  (pg_temp.id(407),pg_temp.id(400),pg_temp.id(401),'2026-11-20','efectivo_pesos',77,false,auth.uid());
update pagos set deleted_at = now() where id=pg_temp.id(407);
select pg_temp.check_true(
  (select count(*)=4 and sum(importe_en_pesos) filter(where not es_garantia and
    (forma_pago<>'cheque' or fecha_pago<='2026-11-20'))=3000
    from pagos where evento_id=pg_temp.id(400) and deleted_at is null)
  and (select importe_moneda_original=2 and tipo_cambio=1000 and importe_en_pesos=2000
    from pagos where id=pg_temp.id(404))
  and (select count(*)=2 and sum(importe_ars)=2000 from pago_imputaciones where pago_id=pg_temp.id(404)),
  'historial: USD histórico una sola vez, reparto completo y bajas excluidas');
select pg_temp.check_true(
  (select total_servicios+total_catering=13600 and ajuste_cobertura_catering=-800
    and total_servicios+total_catering+ajuste_cobertura_catering-3000=9800
    from v_resumen_evento where id=pg_temp.id(400))
  and (select cubiertos=2 and por_acreditar=1 and precio_aplicado=900 and cobertura_ars=1000
    from v_catering_tarifas where catering_contrato_id=pg_temp.id(402) and categoria='adultos')
  and (select precio_aplicado=500 and cantidad=2 and importe_historico=1000
    from catering_coberturas where pago_id=pg_temp.id(403)),
  'historial: saldo 9800, recotización conserva PAX históricos y cheque pendiente no acredita');
reset role;
-- Una descarga exige lectura del módulo eventos, no gestión ni permiso catering.
update role_permissions set can_manage=false where role_id=pg_temp.id(10) and screen='eventos';
delete from role_permissions where role_id=pg_temp.id(10) and screen='catering';
set local role authenticated;
select pg_temp.check_true(
  public.current_user_has_screen_permission(array['eventos'],false)
  and not public.current_user_has_screen_permission(array['eventos'],true)
  and not public.current_user_has_screen_permission(array['catering'],false)
  and exists(select 1 from eventos where id=pg_temp.id(400))
  and (select count(*)=4 from pagos where evento_id=pg_temp.id(400) and deleted_at is null),
  'historial: lectura autorizada del salón sin gestión ni permiso catering');
select set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
select pg_temp.check_true(not exists(select 1 from eventos where id=pg_temp.id(400))
  and not exists(select 1 from pagos where evento_id=pg_temp.id(400))
  and not exists(select 1 from v_resumen_evento where id=pg_temp.id(400)),
  'historial: otro salón no puede descargar evento ni saldo');
select set_config('request.jwt.claim.sub', pg_temp.id(6)::text, true);
select pg_temp.check_true(not exists(select 1 from eventos where id=pg_temp.id(400))
  and not exists(select 1 from pagos where evento_id=pg_temp.id(400)),
  'historial: usuario inactivo sin acceso');
reset role;
select pg_temp.check_true(exists(select 1 from audit_log where tabla='pagos'
  and registro_id=pg_temp.id(407)::text and accion='SOFT_DELETE'),
  'historial: baja lógica conserva auditoría');
