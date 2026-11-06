set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
with changed as (update egresos set deleted_at=now() where id=pg_temp.id(800) and deleted_at is null returning id)
select pg_temp.check_true((select count(*)=1 from changed),'admin da de baja y recibe ID sin error');
select pg_temp.check_true((select importe_en_pesos=30 and concepto='Admin' and deleted_at is not null
  from egresos where id=pg_temp.id(800)),'la baja conserva el origen y sólo cambia estado/fecha');
select pg_temp.expect_error('update egresos set concepto=''Alterado'' where id=pg_temp.id(801)',
  'P0001','trigger mantiene prohibida la edición de importes/datos');
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
with changed as (update egresos set deleted_at=now() where id=pg_temp.id(801) and deleted_at is null returning id)
select pg_temp.check_true((select count(*)=1 from changed),'vendedor da de baja gasto de su salón');
with changed as (update egresos set deleted_at=now() where id=pg_temp.id(802) returning id)
select pg_temp.check_true((select count(*)=0 from changed),'vendedor no modifica gastos de otro salón');
select pg_temp.check_true((select count(*)=0 from egresos where id in(pg_temp.id(802),pg_temp.id(803))),
  'vendedor no lee salón ajeno ni catering externo');
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
select pg_temp.check_true((select count(*)=0 from egresos where id in(pg_temp.id(800),pg_temp.id(801))),
  'tombstones conservan el alcance por salón');
select set_config('request.jwt.claim.sub',pg_temp.id(6)::text,true);
select pg_temp.check_true((select count(*)=0 from egresos),'inactivo no lee egresos activos ni eliminados');
select set_config('request.jwt.claim.sub',pg_temp.id(4)::text,true);
with changed as (update egresos set deleted_at=now() where id=pg_temp.id(803) and deleted_at is null returning id)
select pg_temp.check_true((select count(*)=1 from changed),'ejecutiva conserva baja de catering externo propio');
reset role;
select pg_temp.check_true((select count(*)=3 from audit_log where tabla='egresos'
  and accion='SOFT_DELETE' and registro_id in(pg_temp.id(800)::text,pg_temp.id(801)::text,pg_temp.id(803)::text)),
  'auditoría registra las tres bajas, sin bajas de intentos rechazados');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.check_true((select count(*)=0 from egresos),'anon no lee egresos');
reset role;
update role_permissions set can_manage=false where role_id=pg_temp.id(10) and screen in('eventos','catering');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.id(3)::text,true);
with changed as (update egresos set deleted_at=now() where id=pg_temp.id(802) returning id)
select pg_temp.check_true((select count(*)=0 from changed),'permiso de sólo lectura no habilita bajas');
reset role;
