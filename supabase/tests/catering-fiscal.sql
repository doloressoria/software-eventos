reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
select pg_temp.check_true(not exists(select 1 from fiscal_legacy_antes a join v_catering_acreditado b using(id)
 where row(a.total_con_iva,a.total_pagado,a.saldo_pendiente) is distinct from row(b.total_con_iva,b.total_pagado,b.saldo_pendiente)),
 'migración no modifica totales ni saldos de contratos legacy');
select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(30),'ejecutiva_id',pg_temp.id(4),
 'pax_adultos',200,'iva_porcentaje',.21,'porcentaje_facturado',30,'version_calculo',2),100000,'Fiscal ficticio') as fiscal \gset
select pg_temp.check_true((select neto_vigente=20000000 and base_imponible=6000000 and iva_calculado=1260000
 and total_con_iva=21260000 and saldo_pendiente=21260000 from v_catering_acreditado where id=:'fiscal'), '20M netos, 30% facturado, IVA 21%');
select guardar_pago_por_personas(:'fiscal',pg_temp.id(910),pg_temp.pax_cabecera(2260000)||'{"capital_ars":1000000,"iva_ars":1260000}',pg_temp.cobertura('adultos',10,100000));
select pg_temp.check_true((select total_pagado=2260000 and iva_cobrado=1260000 and iva_pendiente=0 and saldo_pendiente=19000000 from v_catering_acreditado where id=:'fiscal')
 and (select pendientes=190 from v_catering_tarifas where catering_contrato_id=:'fiscal' and categoria='adultos'), 'primer cobro: 10 personas más todo el IVA, 190 pendientes');
select guardar_pago_por_personas(:'fiscal',pg_temp.id(911),pg_temp.pax_cabecera(1000000)||'{"capital_ars":1000000,"iva_ars":0}',pg_temp.cobertura('adultos',10,100000));
select pg_temp.check_true((select saldo_pendiente=18000000 and iva_pendiente=0 and total_pagado=3260000 from v_catering_acreditado where id=:'fiscal'), 'segundo cobro no cobra IVA nuevamente');
select pg_temp.check_true(guardar_pago_por_personas(:'fiscal',pg_temp.id(911),pg_temp.pax_cabecera(1000000)||'{"capital_ars":1000000,"iva_ars":0}',pg_temp.cobertura('adultos',10,100000))=pg_temp.id(911),'reintento idempotente');
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,fecha) values(:'fiscal',110000,200,'2026-11-21');
select pg_temp.check_true((select neto_exigible=21800000 and iva_exigible=1373400 and iva_pendiente=113400 and saldo_pendiente=19913400 from v_catering_acreditado where id=:'fiscal'), 'recotización congela capital cubierto y sólo exige diferencia de IVA');
select guardar_pago_por_personas(:'fiscal',pg_temp.id(912),pg_temp.pax_cabecera(113400)||'{"capital_ars":0,"iva_ars":113400}','[]');
select pg_temp.check_true((select pendientes=180 from v_catering_tarifas where catering_contrato_id=:'fiscal' and categoria='adultos') and (select iva_pendiente=0 from v_catering_acreditado where id=:'fiscal'),'solo IVA no cubre PAX');
update catering_contratos set porcentaje_facturado=0 where id=:'fiscal';
select pg_temp.check_true((select iva_pendiente=-1373400 and saldo_pendiente=18426600 from v_catering_acreditado where id=:'fiscal'),'cambio a 0% conserva IVA histórico y expone crédito');
-- The originally impossible USD payment now uses an explicit adjustment, including legacy VAT-inclusive coverage.
select guardar_pago_por_personas(pg_temp.id(900),pg_temp.id(901),pg_temp.pax_cabecera(83.33)||'{"moneda":"USD","tipo_cambio":1200}',pg_temp.cobertura('adultos',1,100000));
select pg_temp.check_true((select importe_en_pesos=99996 from pagos where id=pg_temp.id(901)) and (select ajuste_ars=4 and capital_ars is null from catering_cobro_componentes where pago_id=pg_temp.id(901))
 and (select saldo_pendiente=0 from v_catering_acreditado where id=pg_temp.id(900)), 'USD legacy: caja real y ajuste explícito sin inventar capital/IVA');
-- New model: capital only, IVA partial, commission, category extras and fixed charges.
select crear_catering_con_precio(jsonb_build_object('ejecutiva_id',pg_temp.id(4),'cliente_nombre','Fiscal externo',
 'fecha_evento','2026-12-03','lugar_evento','Prueba aislada','pax_adultos',2,'iva_porcentaje',.21,
 'porcentaje_facturado',30,'version_calculo',2,'comision_organizador_monto',1000,'iva_comision',.21),100000,'Externo') as externo_fiscal \gset
insert into catering_items(catering_contrato_id,categoria,descripcion,precio_unitario,pax,categorias_pax)
values(:'externo_fiscal','adicional_otros','Por persona',1000,1,array['adultos']),(:'externo_fiscal','adicional_otros','Fijo',5000,9,null);
select pg_temp.check_true((select neto_vigente=207000 and base_imponible=62100 and iva_calculado=13041 and total_con_iva=221251
 from v_catering_acreditado where id=:'externo_fiscal'), 'adicionales gravados, fijo una vez, comisión y su IVA separados del 30%');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select guardar_pago_por_personas(:'externo_fiscal',pg_temp.id(920),pg_temp.pax_cabecera(101000)||'{"capital_ars":101000,"iva_ars":0}',pg_temp.cobertura('adultos',1,101000));
select guardar_pago_por_personas(:'externo_fiscal',pg_temp.id(921),pg_temp.pax_cabecera(1000)||'{"capital_ars":0,"iva_ars":1000}','[]');
select pg_temp.check_true((select iva_pendiente=12041 and iva_cobrado=1000 and saldo_pendiente=119251 from v_catering_acreditado where id=:'externo_fiscal'), 'ejecutiva: capital solo mantiene IVA, cobro parcial de IVA externo');
select guardar_pago_por_personas(:'externo_fiscal',pg_temp.id(922),pg_temp.pax_cabecera(5000,'2026-11-21','cheque')||'{"capital_ars":0,"iva_ars":5000}','[]');
select pg_temp.check_true((select iva_reservado=5000 and iva_cobrado=1000 and iva_pendiente=12041 and total_pagado=102000 from v_catering_acreditado where id=:'externo_fiscal'), 'cheque IVA reserva sin cancelar deuda');
select pg_temp.expect_error(format('select guardar_pago_por_personas(%L,pg_temp.id(923),pg_temp.pax_cabecera(8000)||''{"capital_ars":0,"iva_ars":8000}'',''[]'')',:'externo_fiscal'), 'P2004','no permite cobrar IVA reservado por un cheque');
update pagos set deleted_at=now() where id=pg_temp.id(922);
select pg_temp.check_true((select iva_reservado=0 from v_catering_acreditado where id=:'externo_fiscal'),'baja del cheque libera IVA reservado');
select guardar_pago_por_personas(:'externo_fiscal',pg_temp.id(924),pg_temp.pax_cabecera(5000,'2026-11-21','cheque')||'{"capital_ars":0,"iva_ars":5000}','[]');
set local eventos.test_dia='2026-11-21';
select pg_temp.check_true((select iva_reservado=0 and iva_cobrado=6000 and iva_pendiente=7041 from v_catering_acreditado where id=:'externo_fiscal'),'acreditación por día cancela sólo IVA, sin PAX');
select pg_temp.expect_error('update pagos set importe_moneda_original=6000 where id=pg_temp.id(924)','42501','IVA sin PAX también es inmutable');
select pg_temp.expect_error('update catering_cobro_componentes set iva_ars=0 where pago_id=pg_temp.id(924)','42501','RLS/grants bloquean edición directa del desglose');
update pagos set deleted_at=now() where id=pg_temp.id(924);
select pg_temp.check_true((select iva_cobrado=1000 and iva_pendiente=12041 from v_catering_acreditado where id=:'externo_fiscal'),'baja acreditada revierte IVA una vez');
insert into pagos(catering_contrato_id,fecha_pago,forma_pago,importe_moneda_original,es_garantia) values(:'externo_fiscal','2026-11-21','transferencia',3000,true);
select pg_temp.check_true((select total_pagado=102000 and iva_pendiente=12041 from v_catering_acreditado where id=:'externo_fiscal'),'garantía no cancela capital ni IVA');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
update catering_contratos set porcentaje_facturado=100 where id=:'externo_fiscal';
select pg_temp.check_true((select iva_calculado=43470 and total_con_iva=251680 from v_catering_acreditado where id=:'externo_fiscal'),'100% facturado conserva IVA de comisión');
update catering_contratos set iva_porcentaje=0 where id=:'externo_fiscal';
select pg_temp.check_true((select iva_calculado=0 and total_con_iva=208210 and iva_pendiente=-1000 from v_catering_acreditado where id=:'externo_fiscal'),'IVA cero no borra crédito histórico ni IVA de comisión');
select pg_temp.expect_error(format('update catering_contratos set porcentaje_facturado=101 where id=%L',:'externo_fiscal'),'23514','SQL rechaza porcentaje superior a 100');
select pg_temp.expect_error(format('update catering_contratos set porcentaje_facturado=-1 where id=%L',:'externo_fiscal'),'23514','SQL rechaza porcentaje negativo');
select pg_temp.expect_error('update catering_contratos set version_calculo=2 where id=pg_temp.id(65)','23514','no se reinterpretan coberturas legacy ni pagos dados de baja');
-- New-model USD policy, both signs and exact rates with four decimal places.
select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(30),'ejecutiva_id',pg_temp.id(4),'pax_adultos',10,
 'iva_porcentaje',0,'porcentaje_facturado',100,'version_calculo',2),100000,'USD') as usd_fiscal \gset
select guardar_pago_por_personas(:'usd_fiscal',pg_temp.id(930),pg_temp.pax_cabecera(83.33)||'{"moneda":"USD","tipo_cambio":1200,"capital_ars":100000,"iva_ars":0}',pg_temp.cobertura('adultos',1,100000));
select pg_temp.check_true((select capital_ars=100000 and ajuste_ars=4 from catering_cobro_componentes where pago_id=pg_temp.id(930))
 and (select importe_en_pesos=99996 from pagos where id=pg_temp.id(930)) and (select saldo_pendiente=900000 from v_catering_acreditado where id=:'usd_fiscal'),'nuevo USD cubre PAX con caja real y ajuste positivo');
select pg_temp.expect_error(format('select guardar_pago_por_personas(%L,pg_temp.id(931),pg_temp.pax_cabecera(83.34)||''{"moneda":"USD","tipo_cambio":1200,"capital_ars":100000,"iva_ars":0}'',pg_temp.cobertura(''adultos'',1,100000))',:'usd_fiscal'), 'P2001','SQL rechaza otro centavo USD, aunque el importe sea cercano');
select pg_temp.expect_error(format('select guardar_pago_por_personas(%L,pg_temp.id(931),pg_temp.pax_cabecera(100000)||''{"capital_ars":100000,"iva_ars":0}'',pg_temp.cobertura(''adultos'',1,99999))',:'usd_fiscal'), 'P2002','distingue precio desactualizado');
select pg_temp.expect_error(format('select guardar_pago_por_personas(%L,pg_temp.id(931),pg_temp.pax_cabecera(1000000)||''{"capital_ars":1000000,"iva_ars":0}'',pg_temp.cobertura(''adultos'',10,100000))',:'usd_fiscal'), 'P2003','distingue PAX insuficientes');
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,fecha) values(:'usd_fiscal',100004,10,'2026-11-22');
select guardar_pago_por_personas(:'usd_fiscal',pg_temp.id(931),pg_temp.pax_cabecera(83.34)||'{"moneda":"USD","tipo_cambio":1200,"capital_ars":100004,"iva_ars":0}',pg_temp.cobertura('adultos',1,100004));
select pg_temp.check_true((select ajuste_ars=-4 from catering_cobro_componentes where pago_id=pg_temp.id(931)) and (select saldo_pendiente=800032 and ajuste_redondeo=0 from v_catering_acreditado where id=:'usd_fiscal'),'ajuste negativo se contabiliza sin alterar caja');
select guardar_pago_por_personas(:'usd_fiscal',pg_temp.id(932),pg_temp.pax_cabecera(100.25)||'{"moneda":"USD","tipo_cambio":1200.1234,"capital_ars":120312.37,"iva_ars":0}','[]');
select pg_temp.check_true((select importe_en_pesos=120312.37 and tipo_cambio=1200.1234 from pagos where id=pg_temp.id(932)) and (select ajuste_ars=0 from catering_cobro_componentes where pago_id=pg_temp.id(932)),'cotización de 4 decimales, USD exacto y capital por importe');
-- Reassignment moves actual capital only, keeping IVA at the original contract.
update pagos set deleted_at=now() where id=pg_temp.id(931);
update catering_contratos set pax_adultos=0 where id=:'usd_fiscal';
select reasignar_excedente_catering(:'usd_fiscal',pg_temp.id(930),'adultos',1,pg_temp.id(50),false,0);
select pg_temp.check_true((select importe_ars=99996 from pago_imputaciones where pago_id=pg_temp.id(930) and evento_servicio_id=pg_temp.id(50))
 and (select capital_reasignado_ars=99996 and ajuste_ars=4 from catering_cobro_componentes where pago_id=pg_temp.id(930)), 'reasignación USD positiva transfiere sólo capital efectivamente cobrado');
select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(30),'ejecutiva_id',pg_temp.id(4),'pax_adultos',1,
 'iva_porcentaje',0,'version_calculo',2),100004,'USD negativo') as negativo_fiscal \gset
select guardar_pago_por_personas(:'negativo_fiscal',pg_temp.id(933),pg_temp.pax_cabecera(83.34)||'{"moneda":"USD","tipo_cambio":1200,"capital_ars":100004,"iva_ars":0}',pg_temp.cobertura('adultos',1,100004));
update catering_contratos set pax_adultos=0 where id=:'negativo_fiscal';
select reasignar_excedente_catering(:'negativo_fiscal',pg_temp.id(933),'adultos',1,pg_temp.id(50),false,0);
select pg_temp.check_true((select importe_ars=100004 from pago_imputaciones where pago_id=pg_temp.id(933) and evento_servicio_id=pg_temp.id(50))
 and (select ajuste_ars=-4 and capital_reasignado_ars=100004 from catering_cobro_componentes where pago_id=pg_temp.id(933)), 'reasignación negativa conserva excedente real y trazabilidad');
-- Concurrent workers use this fixture in separate database sessions.
select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(30),'ejecutiva_id',pg_temp.id(4),'pax_adultos',1,
 'iva_porcentaje',.21,'porcentaje_facturado',100,'version_calculo',2),100000,'Concurrente') as concurrente \gset
create table public.fiscal_concurrencia_prueba as select :'concurrente'::uuid as catering;
grant select on public.fiscal_concurrencia_prueba to authenticated;
select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(30),'ejecutiva_id',pg_temp.id(4),'pax_adultos',10,
 'iva_porcentaje',.21,'porcentaje_facturado',100,'version_calculo',2),60000,'Desglose USD') as combinado_fiscal \gset
select guardar_pago_por_personas(:'combinado_fiscal',pg_temp.id(940),pg_temp.pax_cabecera(83.33)||'{"moneda":"USD","tipo_cambio":1200,"capital_ars":60000,"iva_ars":40000}',pg_temp.cobertura('adultos',1,60000));
select pg_temp.check_true((select ajuste_ars=4 and ajuste_iva_ars=1.60 and capital_ars=60000 and iva_ars=40000 from catering_cobro_componentes where pago_id=pg_temp.id(940))
 and (select iva_cobrado=39998.40 and iva_cancelado=40000 and iva_pendiente=86000 from v_catering_acreditado where id=:'combinado_fiscal'), 'ajuste una vez por operación, distribuido proporcionalmente entre capital e IVA');
select crear_catering_con_precio(jsonb_build_object('evento_id',pg_temp.id(30),'ejecutiva_id',pg_temp.id(4),'pax_adultos',10,
 'iva_porcentaje',.21,'porcentaje_facturado',30,'version_calculo',2),100000,'Reasignación IVA') as reasignable_fiscal \gset
select guardar_pago_por_personas(:'reasignable_fiscal',pg_temp.id(941),pg_temp.pax_cabecera(1063000)||'{"capital_ars":1000000,"iva_ars":63000}',pg_temp.cobertura('adultos',10,100000));
update catering_contratos set pax_adultos=5 where id=:'reasignable_fiscal';
select reasignar_excedente_catering(:'reasignable_fiscal',pg_temp.id(941),'adultos',5,pg_temp.id(50),false,0);
select pg_temp.check_true((select importe_ars=500000 from pago_imputaciones where pago_id=pg_temp.id(941) and evento_servicio_id=pg_temp.id(50))
 and (select iva_ars=63000 and capital_reasignado_ars=500000 from catering_cobro_componentes where pago_id=pg_temp.id(941))
 and (select iva_cobrado=63000 and iva_pendiente=-31500 and saldo_pendiente=-31500 from v_catering_acreditado where id=:'reasignable_fiscal'), 'reasignación nunca transfiere IVA como capital y expone crédito fiscal');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.check_true((select iva_cobrado=63000 and iva_pendiente=-31500 and saldo_pendiente=-31500 from v_catering_acreditado where id=:'reasignable_fiscal')
 and (select iva_ars=63000 from catering_cobro_componentes where pago_id=pg_temp.id(941) and catering_contrato_id=:'reasignable_fiscal'), 'ejecutiva asignada ve sólo su desglose y saldo después de distribuir el pago');
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
update pagos set deleted_at=now() where id=pg_temp.id(941);
select pg_temp.check_true((select total_pagado=0 and saldo_pendiente=531500 and iva_cobrado=0 from v_catering_acreditado where id=:'reasignable_fiscal')
 and (select count(*)=1 and importe_en_pesos=1063000 from pagos where id=pg_temp.id(941) group by importe_en_pesos), 'baja distribuida libera cobertura y componentes sin devolución ficticia');
select pg_temp.expect_error('select guardar_pago_distribuido(pg_temp.id(30),pg_temp.id(940),true,pg_temp.pax_cabecera(100000),jsonb_build_array(jsonb_build_object(''evento_servicio_id'',pg_temp.id(50),''importe_ars'',100000)))','23514','edición distribuida no puede desviar capital e IVA explícitos');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.check_true(not exists(select 1 from catering_cobro_componentes where pago_id in (pg_temp.id(940),pg_temp.id(941))), 'vendedor de otro salón no ve componentes');
select pg_temp.expect_error(format('select guardar_pago_por_personas(%L,pg_temp.id(942),pg_temp.pax_cabecera(60000),pg_temp.cobertura(''adultos'',1,60000))',:'combinado_fiscal'),'42501','vendedor de otro salón no cobra capital ni IVA');
reset role;
select pg_temp.check_true(not has_function_privilege('anon','public.guardar_pago_por_personas(uuid,uuid,jsonb,jsonb,uuid)','execute')
 and not has_function_privilege('authenticated','software_eventos_private.catering_sync_componentes()','execute')
 and not has_schema_privilege('authenticated','software_eventos_private','usage'), 'sin grants implícitos en RPC privilegiadas ni uso del esquema privado');
select pg_temp.check_true(exists(select 1 from audit_log where tabla='catering_cobro_componentes' and accion='INSERT' and usuario_id=pg_temp.id(1))
 and exists(select 1 from audit_log where tabla='catering_cobro_componentes' and accion='UPDATE' and datos_nuevos->>'capital_reasignado_ars'='500000.00'), 'auditoría identifica alta y reasignación real del desglose');

select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.expect_error(format('select guardar_pago_por_personas(%L,pg_temp.id(912),pg_temp.pax_cabecera(113400)||''{"capital_ars":0,"iva_ars":113400}'',''[]'')',:'usd_fiscal'),'23505','reintento de sólo IVA no puede reutilizar una solicitud de otro contrato');
