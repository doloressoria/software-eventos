-- The old trigger credited a cheque even if fecha_pago was in the future.
insert into pagos (id, evento_id, evento_servicio_id, fecha_pago, forma_pago, importe_moneda_original)
values
  (pg_temp.id(190), pg_temp.id(31), pg_temp.id(51),
    (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date - 1, 'cheque', 100),
  (pg_temp.id(191), pg_temp.id(31), pg_temp.id(51),
    (statement_timestamp() at time zone 'America/Argentina/Buenos_Aires')::date + 1, 'cheque', 200);
create temporary table cheques_historicos as
  select * from pagos where id in (pg_temp.id(190), pg_temp.id(191));
select pg_temp.check_true((select total_pagado = 300 from evento_servicios where id = pg_temp.id(51)),
  'regla anterior: fecha futura no impedía acreditar');
