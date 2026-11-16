reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
set local eventos.test_dia = '2026-11-20';
create temporary table fiscal_legacy_antes as select id,total_con_iva,total_pagado,saldo_pendiente from v_catering_acreditado;
-- A two-decimal USD receipt cannot satisfy the old exact-equality RPC.
insert into catering_contratos(id,evento_id,ejecutiva_id,pax_adultos,iva_porcentaje)
values(pg_temp.id(900),pg_temp.id(30),pg_temp.id(4),1,0);
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,fecha)
values(pg_temp.id(900),100000,1,'2026-11-20');
select pg_temp.check_true(round(83.33 * 1200,2) = 99996, 'reproducción USD: dinero real 99996 frente a PAX 100000');
select pg_temp.expect_error('select guardar_pago_por_personas(pg_temp.id(900),pg_temp.id(901),
 pg_temp.pax_cabecera(83.33) || ''{"moneda":"USD","tipo_cambio":1200}'', pg_temp.cobertura(''adultos'',1,100000))',
 '23514','reproducción: RPC anterior rechaza USD 83.33 a 1200 para PAX 100000');
