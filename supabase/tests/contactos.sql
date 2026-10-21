-- Datos ficticios; todos los controles se ejecutan sobre PostgreSQL real.
-- Antes del guard de legado, el runner carga este valor de referencia de prueba.
select pg_temp.check_true((select count(*) = 0 from evento_contactos), 'migración no crea contactos a partir del texto anterior');
set local role anon;
select pg_temp.expect_error('select * from public.evento_contactos', '42501', 'anon no lee contactos');
select pg_temp.expect_error('select * from public.evento_contactos_contexto(pg_temp.id(30))', '42501', 'anon no invoca proyección');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select guardar_contactos_evento(pg_temp.id(30), '[
  {"id":null,"nombre":"Contacto A","telefono":null,"correo":null,"relacion":"Organización","observaciones":"Prueba ficticia","es_principal":true},
  {"id":null,"nombre":"Contacto B","telefono":"+00 123","correo":"b@example.invalid","es_principal":false}
]', (select version from evento_contactos_contexto(pg_temp.id(30))));
select pg_temp.check_true((select count(*) = 2 from evento_contactos where evento_id=pg_temp.id(30) and deleted_at is null), 'alta de dos contactos con campos opcionales');
select pg_temp.check_true((select count(*) = 1 from evento_contactos where es_principal and deleted_at is null), 'un principal');
select pg_temp.check_true((select contacto_anterior = E'  Texto anterior\nSIN interpretar  ' from evento_contactos_contexto(pg_temp.id(30))), 'texto anterior íntegro con espacios y salto de línea');
select pg_temp.expect_error($q$update eventos set cliente_contacto = 'Reemplazo' where id = pg_temp.id(30)$q$, '23514', 'escritor directo no sobrescribe legado');

select guardar_contactos_evento(pg_temp.id(30), (
  select jsonb_agg(jsonb_build_object('id', id,'nombre',nombre || ' editado','telefono',telefono,
    'correo',correo,'relacion',relacion,'observaciones',observaciones,'es_principal', not es_principal))
  from evento_contactos where evento_id=pg_temp.id(30) and deleted_at is null
), (select version from evento_contactos_contexto(pg_temp.id(30))));
select pg_temp.check_true((select count(*) = 2 from evento_contactos where nombre like '%editado'), 'edición de contactos');
select pg_temp.check_true((select nombre = 'Contacto B editado' from evento_contactos where es_principal and deleted_at is null), 'cambio de principal');
select pg_temp.expect_error($q$insert into evento_contactos(evento_id,nombre,es_principal) values (pg_temp.id(30),'Segundo',true)$q$, '23505', 'índice rechaza segundo principal por escritura directa');
select pg_temp.expect_error($q$update evento_contactos set evento_id=pg_temp.id(31) where evento_id=pg_temp.id(30)$q$, '42501', 'no puede mover un contacto por API directa');
select pg_temp.expect_error($q$delete from evento_contactos where evento_id=pg_temp.id(30)$q$, '42501', 'sin borrado físico autenticado');
select pg_temp.expect_error($q$insert into evento_contactos(evento_id,nombre) values (pg_temp.id(31),'Ajeno')$q$, '42501', 'salón ajeno rechaza alta');
select pg_temp.expect_error($q$select guardar_contactos_evento(pg_temp.id(30),'[]','vieja')$q$, '40001', 'versión obsoleta no borra colección');
select pg_temp.expect_error($q$select guardar_contactos_evento(pg_temp.id(30),
  '[{"nombre":"","es_principal":false}]',(select version from evento_contactos_contexto(pg_temp.id(30))))$q$, '22023', 'nombre vacío rechazado');
reset role;

-- Usuario sin acceso al evento, autorizado exclusivamente a su catering vinculado.
select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
set local role authenticated;
select pg_temp.check_true((select count(*) = 0 from eventos where id=pg_temp.id(30)), 'ejecutiva no obtiene fila del evento');
select pg_temp.check_true((select jsonb_array_length(contactos) = 2 from evento_contactos_contexto(pg_temp.id(30))), 'ejecutiva lee contactos del evento asociado');
select pg_temp.check_true((select contacto_anterior = E'  Texto anterior\nSIN interpretar  ' from evento_contactos_contexto(pg_temp.id(30))), 'catering recibe legado sin copias');
select pg_temp.expect_error('select * from evento_contactos_contexto(pg_temp.id(31))', '42501', 'ejecutiva no lee evento de contrato ajeno');
select guardar_contactos_evento(pg_temp.id(30), (
  select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'correo',correo,'es_principal',false))
  from evento_contactos where evento_id=pg_temp.id(30) and nombre like 'Contacto B%' and deleted_at is null
), (select version from evento_contactos_contexto(pg_temp.id(30))));
select pg_temp.check_true((select count(*) = 1 from evento_contactos where evento_id=pg_temp.id(30) and deleted_at is null), 'ejecutiva quita un contacto por baja lógica');
select pg_temp.check_true((select count(*) = 1 from evento_contactos where deleted_at is not null), 'baja conserva registro');
select pg_temp.expect_error($q$select guardar_evento_con_contactos(p_evento_id => pg_temp.id(30), p_datos =>
  '{"cliente_nombre":"No autorizado"}',p_contactos => '[]',p_version => (select version from evento_contactos_contexto(pg_temp.id(30))))$q$, '42501', 'gestión de contactos no permite editar evento');
reset role;

-- Sólo lectura, inactivo y otro salón.
insert into roles(id,nombre) values (pg_temp.id(13),'Catering lectura');
insert into role_permissions values (pg_temp.id(13),'catering',false);
update usuario_roles set role_id=pg_temp.id(13) where usuario_id=pg_temp.id(4);
select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
set local role authenticated;
select pg_temp.check_true((select not puede_editar from evento_contactos_contexto(pg_temp.id(30))), 'lectura de catering sin permiso de edición');
select pg_temp.expect_error($q$select guardar_contactos_evento(pg_temp.id(30),'[]',
  (select version from evento_contactos_contexto(pg_temp.id(30))))$q$, '42501', 'lector no elimina contactos por RPC');
select pg_temp.expect_error($q$insert into evento_contactos(evento_id,nombre) values (pg_temp.id(30),'No autorizado')$q$, '42501', 'lector no escribe por API directa');
select set_config('request.jwt.claim.sub', pg_temp.id(6)::text, true);
select pg_temp.check_true((select count(*)=0 from evento_contactos), 'inactivo no ve contactos');
select pg_temp.expect_error('select * from evento_contactos_contexto(pg_temp.id(30))', '42501', 'inactivo no invoca contexto');
select set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
select pg_temp.check_true((select count(*)=0 from evento_contactos), 'vendedor de otro salón no ve contactos');
reset role;

-- Fallo después de modificar evento y marcar bajas: todo debe volver atrás.
create temporary table contactos_antes as select * from evento_contactos;
create temporary table evento_antes as select * from eventos where id=pg_temp.id(30);
create temporary table auditoria_antes as select count(*) as n from audit_log;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
set local role authenticated;
select pg_temp.expect_error($q$select guardar_evento_con_contactos(p_evento_id => pg_temp.id(30), p_datos =>
  '{"cliente_nombre":"Nombre que debe revertirse"}',
  p_contactos => '[{"nombre":"Inválido","correo":"sin-arroba","es_principal":false}]',
  p_version => (select version from evento_contactos_contexto(pg_temp.id(30))))$q$, '23514', 'error de contacto revierte guardado conjunto');
reset role;
select pg_temp.check_true(not exists((select * from contactos_antes) except (select * from evento_contactos)), 'fallo no elimina ni modifica contactos previos');
select pg_temp.check_true((select count(*) from contactos_antes)=(select count(*) from evento_contactos), 'fallo no inserta contactos parciales');
select pg_temp.check_true((select to_jsonb(e) from eventos e where id=pg_temp.id(30))=(select to_jsonb(e) from evento_antes e), 'fallo restaura evento completo');
select pg_temp.check_true((select n from auditoria_antes)=(select count(*) from audit_log), 'fallo no deja auditoría parcial');

set local role authenticated;
select guardar_evento_con_contactos(p_evento_id => pg_temp.id(30), p_datos => '{"cliente_nombre":"Evento editado con contactos"}', p_contactos => (
  select jsonb_agg(jsonb_build_object('id',id,'nombre','Nombre conjunto','es_principal',false))
  from evento_contactos where evento_id=pg_temp.id(30) and deleted_at is null
), p_version => (select version from evento_contactos_contexto(pg_temp.id(30))));
select pg_temp.check_true((select cliente_nombre='Evento editado con contactos' from eventos where id=pg_temp.id(30)), 'guardado conjunto actualiza evento');
select pg_temp.check_true((select count(*)=1 from evento_contactos where nombre='Nombre conjunto' and deleted_at is null), 'guardado conjunto actualiza contactos');
select pg_temp.check_true((select cliente_contacto=E'  Texto anterior\nSIN interpretar  ' from eventos where id=pg_temp.id(30)), 'guardado conjunto conserva legado');
reset role;

select pg_temp.check_true((select count(*)=1 from audit_log where tabla='evento_contactos' and accion='SOFT_DELETE'), 'baja auditada una vez');
select pg_temp.check_true(exists(select 1 from audit_log where tabla='evento_contactos' and usuario_id=pg_temp.id(4)), 'auditoría identifica ejecutiva');

-- UUID de un contacto de otro evento tampoco puede incorporarse a una colección.
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
set local role authenticated;
select guardar_contactos_evento(pg_temp.id(31),'[{"nombre":"Otro evento","es_principal":false}]',
  (select version from evento_contactos_contexto(pg_temp.id(31))));
select pg_temp.expect_error($q$select guardar_contactos_evento(pg_temp.id(30),
  (select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'es_principal',false)) from evento_contactos where evento_id=pg_temp.id(31)),
  (select version from evento_contactos_contexto(pg_temp.id(30))))$q$, '42501', 'RPC rechaza id perteneciente a otro evento incluso para admin');
reset role;
select pg_temp.expect_error($q$update evento_contactos set evento_id=pg_temp.id(30) where evento_id=pg_temp.id(31)$q$, '23514', 'trigger impide mover contacto incluso con privilegios de mantenimiento');

-- Alta atómica; un contacto inválido no deja un evento sin su formulario.
create temporary table counts_before_create as select count(*) as n from eventos;
set local role authenticated;
select pg_temp.expect_error($q$select guardar_evento_con_contactos(
  p_datos => jsonb_build_object('salon_id',pg_temp.id(20),'vendedor_id',pg_temp.id(2),
    'cliente_nombre','Alta fallida ficticia','fecha_evento','2026-12-05','fecha_carga','2026-10-21',
    'estado','borrador','tiene_organizador',false),
  p_contactos => '[{"nombre":"Prueba","correo":"inválido","es_principal":false}]',
  p_version => '')$q$, '23514', 'alta fallida revierte también el evento');
reset role;
select pg_temp.check_true((select n from counts_before_create)=(select count(*) from eventos), 'alta fallida no deja evento parcial');
set local role authenticated;
create temporary table created_event as select guardar_evento_con_contactos(
  p_datos => jsonb_build_object('salon_id',pg_temp.id(20),'vendedor_id',pg_temp.id(2),
    'cliente_nombre','Alta conjunta ficticia','fecha_evento','2026-12-05','fecha_carga','2026-10-21',
    'estado','borrador','tiene_organizador',false),
  p_contactos => '[{"nombre":"Creado junto al evento","es_principal":true}]',
  p_version => '') as id;
select pg_temp.check_true((select count(*)=1 from evento_contactos where evento_id=(select id from created_event) and es_principal), 'alta conjunta confirma evento y principal');
select guardar_contactos_evento((select id from created_event), '[]',
  (select version from evento_contactos_contexto((select id from created_event))));
select pg_temp.check_true((select jsonb_array_length(contactos)=0 from evento_contactos_contexto((select id from created_event))), 'quitar todos deja una colección vacía válida');
reset role;
select pg_temp.check_true((select count(*)=1 from evento_contactos where evento_id=(select id from created_event) and deleted_at is not null), 'quitar todos conserva historial');
update eventos set deleted_at=now() where id=(select id from created_event);
set local role authenticated;
select pg_temp.expect_error('select * from evento_contactos_contexto((select id from created_event))', '42501', 'evento eliminado no expone contactos');
reset role;

-- Deja dos contactos activos para la prueba de concurrencia en sesiones separadas.
set local role authenticated;
select guardar_contactos_evento(pg_temp.id(30), (
  select jsonb_agg(jsonb_build_object('id',id,'nombre',nombre,'es_principal',false))
    || '[{"nombre":"Concurrente","es_principal":true}]'::jsonb
  from evento_contactos where evento_id=pg_temp.id(30) and deleted_at is null
), (select version from evento_contactos_contexto(pg_temp.id(30))));
reset role;
