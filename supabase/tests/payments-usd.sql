select pg_temp.check_true((select to_jsonb(p) = to_jsonb(b) from pagos p join usd_legacy_before b using(id)), 'migración USD conserva el legado exacto, sin inventar cotización');
update pagos set deleted_at=now() where id=pg_temp.id(199);
select pg_temp.check_true((select deleted_at is not null and tipo_cambio is null from pagos where id=pg_temp.id(199)), 'legado sin tasa admite baja lógica sin rellenar cotización');

create function pg_temp.usd_pay(n int, ev int, es int, cc int, amount numeric default 100, rate numeric default 1200, currency moneda default 'USD', method forma_pago default 'efectivo_dolares', guarantee boolean default false)
returns void language sql as $$
  insert into pagos (id, evento_id, evento_servicio_id, catering_contrato_id,fecha_pago,forma_pago,moneda,tipo_cambio,importe_moneda_original,es_garantia,banco,registrado_por)
  values (pg_temp.id(n),pg_temp.id(ev),pg_temp.id(es),pg_temp.id(cc),'2026-10-21',method,currency,rate,amount,guarantee,'Referencia bancaria',auth.uid());
$$;

-- Mismo recorrido real de trigger para servicios, catering asociado y externo.
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.usd_pay(200,30,50,null);
select pg_temp.usd_pay(201,30,50,null,100,1300,'USD','transferencia');
select pg_temp.check_true((select total_pagado=250000 from evento_servicios where id=pg_temp.id(50)), 'evento: 100x1200 + 100x1300 = ARS 250000');
select pg_temp.usd_pay(202,30,50,null,500,1,'ARS','efectivo_pesos');
select pg_temp.usd_pay(203,30,50,null,50,1200,'USD','transferencia',true);
select pg_temp.check_true((select total_pagado=250500 and saldo_pendiente<0 from evento_servicios where id=pg_temp.id(50)), 'evento: mezcla ARS/USD, garantía excluida y sobrepago/saldo SQL negativo preservado');
update pagos set tipo_cambio=1400 where id=pg_temp.id(200);
select pg_temp.check_true((select total_pagado=270500 from evento_servicios where id=pg_temp.id(50)), 'evento: editar tasa recalcula acumulado');
select pg_temp.check_true((select tipo_cambio=1300 and importe_en_pesos=130000 and banco='Referencia bancaria' from pagos where id=pg_temp.id(201)), 'editar otro pago preserva cotización histórica y banco');
update pagos set deleted_at=now() where id=pg_temp.id(201);
select pg_temp.check_true((select total_pagado=140500 from evento_servicios where id=pg_temp.id(50)), 'evento: baja lógica USD recalcula');
select pg_temp.expect_error('select pg_temp.usd_pay(299,31,51,null)', '42501','USD: salón ajeno rechazado');
select pg_temp.expect_error('select pg_temp.usd_pay(299,30,51,null)', '23514','USD: servicio de otro evento rechazado');
select pg_temp.expect_error('select pg_temp.usd_pay(299,null,50,61)', '23514','USD: servicio incompatible con catering externo');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
select pg_temp.usd_pay(210,30,null,60);
select pg_temp.usd_pay(211,30,null,60,100,1300,'USD','transferencia');
select pg_temp.usd_pay(212,30,null,60,500,1,'ARS','transferencia');
select pg_temp.usd_pay(213,30,null,60,50,1200,'USD','efectivo_dolares',true);
select pg_temp.check_true((select total_pagado=250500 and saldo_pendiente=total_con_iva-250500 from catering_contratos where id=pg_temp.id(60)), 'catering asociado: cotizaciones históricas, ARS y garantía');
update pagos set importe_moneda_original=150 where id=pg_temp.id(210);
select pg_temp.check_true((select total_pagado=310500 from catering_contratos where id=pg_temp.id(60)), 'catering asociado: edición recalcula');
update pagos set deleted_at=now() where id=pg_temp.id(211);
select pg_temp.check_true((select total_pagado=180500 from catering_contratos where id=pg_temp.id(60)), 'catering asociado: baja recalcula');
select pg_temp.usd_pay(220,null,null,61);
select pg_temp.usd_pay(221,null,null,61,100,1300,'USD','transferencia');
select pg_temp.usd_pay(222,null,null,61,500,1,'ARS','efectivo_pesos');
select pg_temp.usd_pay(223,null,null,61,50,1200,'USD','transferencia',true);
select pg_temp.check_true((select total_pagado=250500 from catering_contratos where id=pg_temp.id(61)), 'catering externo: efectivo/transferencia USD, mezcla y garantía');
update pagos set tipo_cambio=1400 where id=pg_temp.id(220);
update pagos set deleted_at=now() where id=pg_temp.id(221);
select pg_temp.check_true((select total_pagado=140500 from catering_contratos where id=pg_temp.id(61)), 'catering externo: edición y baja recalculan');
select pg_temp.expect_error('select pg_temp.usd_pay(299,null,null,62)', '42501','USD: contrato externo ajeno rechazado');
select pg_temp.expect_error('select pg_temp.usd_pay(299,30,null,61)', '23514','USD: contrato externo con evento incompatible rechazado');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(5)::text,true);
with changed as (update pagos set tipo_cambio=999 where id=pg_temp.id(220) returning id)
select pg_temp.check_true(count(*)=0,'USD: edición de pago ajeno afecta cero filas') from changed;
with changed as (update pagos set deleted_at=now() where id=pg_temp.id(220) returning id)
select pg_temp.check_true(count(*)=0,'USD: baja de pago ajeno afecta cero filas') from changed;
reset role;

select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.expect_error('select pg_temp.usd_pay(299,30,50,null,100,null)', '23514','USD: tasa nula rechazada');
select pg_temp.expect_error('select pg_temp.usd_pay(299,30,50,null,100,0)', '23514','USD: tasa cero rechazada');
select pg_temp.expect_error('select pg_temp.usd_pay(299,30,50,null,100,-1)', '23514','USD: tasa negativa rechazada');
select pg_temp.expect_error($q$select pg_temp.usd_pay(299,30,50,null,100,'NaN')$q$, '23514','USD: tasa NaN rechazada');
select pg_temp.expect_error($q$insert into pagos(evento_id,evento_servicio_id,fecha_pago,forma_pago,moneda,importe_moneda_original) values(pg_temp.id(30),pg_temp.id(50),'2026-10-21','transferencia','USD',100)$q$, '23514','USD: tasa omitida no hereda 1');
select pg_temp.expect_error($q$select pg_temp.usd_pay(299,30,50,null,100,1200,'USD','efectivo_pesos')$q$, '23514','USD incompatible con efectivo pesos');
select pg_temp.expect_error($q$select pg_temp.usd_pay(299,30,50,null,100,1,'ARS','efectivo_dolares')$q$, '23514','ARS incompatible con efectivo dólares');
select pg_temp.expect_error($q$select pg_temp.usd_pay(299,30,50,null,100,2,'ARS','transferencia')$q$, '23514','ARS exige tasa 1');
select pg_temp.expect_error($q$select pg_temp.usd_pay(299,30,50,null,100,1200,'USD','cheque')$q$, '23514','USD incompatible con cheque');
select pg_temp.expect_error('update pagos set tipo_cambio=null where id=pg_temp.id(200)', '23514','edición USD rechaza tasa nula');
select pg_temp.usd_pay(230,30,50,null,1.01,1.5);
select pg_temp.check_true((select importe_en_pesos=1.52 from pagos where id=pg_temp.id(230)), 'PostgreSQL: 1.01x1.5 redondea empate a 1.52');
select pg_temp.usd_pay(231,30,50,null,100.25,1200.1234);
select pg_temp.check_true((select importe_en_pesos=120312.37 from pagos where id=pg_temp.id(231)), 'PostgreSQL: importe y tasa decimales');
select pg_temp.usd_pay(232,30,50,null,100,null,'ARS','efectivo_pesos');
select pg_temp.check_true((select tipo_cambio=1 and importe_en_pesos=100 from pagos where id=pg_temp.id(232)), 'cliente ARS anterior sin tasa sigue funcionando');
select pg_temp.expect_error('update pagos set importe_en_pesos=1 where id=pg_temp.id(230)', '428C9','importe_en_pesos sigue generado');
select pg_temp.check_true((select count(*)=1 from audit_log where tabla='pagos' and registro_id=pg_temp.id(221)::text and accion='SOFT_DELETE' and usuario_id=pg_temp.id(4)), 'USD: auditoría única con actor y baja lógica');

-- Paridad de IVA en servicios nuevos con base inicial 0; no se elige fórmula de catering.
insert into evento_servicios(id,evento_id,servicio_id,precio_base,iva_base_imponible)
select pg_temp.id(n),pg_temp.id(30),pg_temp.id(40),1000000,0 from generate_series(52,55) n;
select pg_temp.usd_pay(240,30,52,null,121000,1,'ARS','efectivo_pesos');
select pg_temp.usd_pay(241,30,53,null,100,1210,'USD','efectivo_dolares');
select pg_temp.usd_pay(242,30,54,null,121000,1,'ARS','transferencia');
select pg_temp.usd_pay(243,30,55,null,100,1210,'USD','transferencia');
select pg_temp.check_true((select count(*)=2 from evento_servicios where id in(pg_temp.id(52),pg_temp.id(53)) and iva_base_imponible=0 and total_pagado=121000), 'SQL: efectivo ARS/USD mismo cobro y base IVA 0');
select pg_temp.check_true((select count(*)=2 from evento_servicios where id in(pg_temp.id(54),pg_temp.id(55)) and iva_base_imponible=100000 and total_pagado=121000), 'SQL: transferencia ARS/USD mismo cobro y base IVA');
update pagos set deleted_at=now() where id=pg_temp.id(243);
select pg_temp.check_true((select iva_base_imponible=100000 and total_pagado=0 from evento_servicios where id=pg_temp.id(55)), 'SQL: baja no reduce base IVA histórica, como TS');

-- Ejecuta la RPC real de preview sobre el fixture mínimo de su tabla de índices.
update eventos set estado='confirmado',fecha_evento=current_date+30 where id=pg_temp.id(30);
select pg_temp.usd_pay(244,30,55,null,1,1200,'USD','transferencia',true);
select pg_temp.check_true((select cantidad_servicios=1 from previsualizar_actualizacion_ipc(current_date,10)), 'IPC: garantía USD no bloquea, ordinarios activos USD/ARS sí');
select pg_temp.usd_pay(245,30,55,null,0.01,0.0001);
select pg_temp.check_true((select cantidad_servicios=0 from previsualizar_actualizacion_ipc(current_date,10)), 'IPC: efectivo USD ordinario bloquea incluso si su equivalente redondea a cero');
update pagos set deleted_at=now() where id=pg_temp.id(245);
select pg_temp.check_true((select cantidad_servicios=1 from previsualizar_actualizacion_ipc(current_date,10)), 'IPC: baja del ordinario vuelve a permitir ajuste');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error('select pg_temp.usd_pay(299,30,50,null)', '42501','anónimo: alta USD rechazada');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(6)::text,true);
select pg_temp.expect_error('select pg_temp.usd_pay(299,30,50,null)', '42501','inactivo: alta USD rechazada');
reset role;

select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
insert into catering_contratos(id,evento_id,ejecutiva_id,total_con_iva,lugar_evento,cliente_nombre,fecha_evento)
select pg_temp.id(n),null,pg_temp.id(4),2000,'Lugar de prueba','Catering paridad',current_date+30 from generate_series(64,67) n;
select pg_temp.usd_pay(250,null,null,64,1210,1,'ARS','efectivo_pesos');
select pg_temp.usd_pay(251,null,null,65,1,1210,'USD','efectivo_dolares');
select pg_temp.usd_pay(252,null,null,66,1210,1,'ARS','transferencia');
select pg_temp.usd_pay(253,null,null,67,1,1210,'USD','transferencia');
select pg_temp.check_true((select count(*)=4 from catering_contratos where id in(pg_temp.id(64),pg_temp.id(65),pg_temp.id(66),pg_temp.id(67)) and total_con_iva=2000 and total_pagado=1210 and saldo_pendiente=790), 'catering SQL: igual equivalente conserva IVA/total exigible y saldo para efectivo y transferencia ARS/USD');
