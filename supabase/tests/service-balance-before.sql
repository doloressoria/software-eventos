select pg_temp.check_true((select saldo_pendiente=1210 and total_con_iva=1105
  from evento_servicios where id=pg_temp.id(50)), 'reproduce saldo SQL con IVA sobre todo el neto');
create temporary table service_balance_before as
  select id, to_jsonb(es)-'saldo_pendiente' as origins from evento_servicios es;
create temporary table service_balance_security_before as
  select policyname, qual, with_check from pg_policies
  where schemaname='public' and tablename='evento_servicios';
