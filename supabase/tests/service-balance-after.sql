select pg_temp.check_true((select saldo_pendiente=1105 from evento_servicios
  where id=pg_temp.id(50)), 'corrige saldos existentes con la base parcial');
select pg_temp.check_true(not exists (
  select 1 from evento_servicios es join service_balance_before b using(id)
  where to_jsonb(es)-'saldo_pendiente' is distinct from b.origins
), 'conserva importes de origen y metadatos al reescribir la columna');
select pg_temp.check_true(not exists (
  (select policyname, qual, with_check from pg_policies where schemaname='public' and tablename='evento_servicios'
   except select * from service_balance_security_before)
  union all
  (select * from service_balance_security_before except
   select policyname, qual, with_check from pg_policies where schemaname='public' and tablename='evento_servicios')
), 'conserva políticas RLS del servicio');
update evento_servicios set precio_base=1000, adicionales_monto=100,
  iva_base_imponible=500, total_pagado=200 where id=pg_temp.id(50);
select pg_temp.check_true((select total_con_iva=1205 and saldo_pendiente=1005
  from evento_servicios where id=pg_temp.id(50)), 'caso de navegador: 1100 + 105 - 200 = 1005');
update evento_servicios set iva_base_imponible=0 where id=pg_temp.id(50);
select pg_temp.check_true((select saldo_pendiente=900 from evento_servicios
  where id=pg_temp.id(50)), 'base cero no agrega IVA a la deuda');
update evento_servicios set iva_base_imponible=1100 where id=pg_temp.id(50);
select pg_temp.check_true((select saldo_pendiente=1131 from evento_servicios
  where id=pg_temp.id(50)), 'base completa mantiene el saldo anterior');
update evento_servicios set total_pagado=2000 where id=pg_temp.id(50);
select pg_temp.check_true((select saldo_pendiente=-669 from evento_servicios
  where id=pg_temp.id(50)), 'preserva sobrepagos con saldo negativo');
update evento_servicios set precio_base=null, adicionales_monto=null,
  iva_base_imponible=0, total_pagado=0 where id=pg_temp.id(50);
select pg_temp.check_true((select total_con_iva=0 and saldo_pendiente=0
  from evento_servicios where id=pg_temp.id(50)), 'valores opcionales nulos siguen el total comercial');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.check_true((select count(*)=0 from evento_servicios where id=pg_temp.id(50)),
  'vendedor de otro salón no accede al servicio corregido');
reset role;
