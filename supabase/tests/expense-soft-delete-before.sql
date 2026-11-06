insert into egresos (id,evento_id,catering_contrato_id,categoria,concepto,fecha_egreso,moneda,importe_moneda_original,importe_en_pesos) values
  (pg_temp.id(800),pg_temp.id(30),null,'QA','Admin','2026-11-06','ARS',30,30),
  (pg_temp.id(801),pg_temp.id(30),null,'QA','Vendedor A','2026-11-06','ARS',20,20),
  (pg_temp.id(802),pg_temp.id(31),null,'QA','Vendedor B','2026-11-06','ARS',40,40),
  (pg_temp.id(803),null,pg_temp.id(61),'QA','Externo','2026-11-06','ARS',10,10);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
select pg_temp.expect_error('update egresos set deleted_at=now() where id=pg_temp.id(800) returning id',
  '42501','reproduce baja con RETURNING rechazada para admin');
select pg_temp.expect_error('update egresos set deleted_at=now() where id=pg_temp.id(800)',
  '42501','sin RETURNING también falla por la política SELECT');
reset role;
