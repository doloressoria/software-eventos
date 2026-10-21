-- Roles reales de PostgreSQL: estas comprobaciones sí ejecutan RLS y triggers.
select pg_temp.check_true(not exists (
  (select * from migration_data_before) except (
    select 'servicios', jsonb_agg(to_jsonb(es) order by id) from evento_servicios es
    union all select 'catering', jsonb_agg(to_jsonb(cc) order by id) from catering_contratos cc
    union all select 'pagos', jsonb_agg(to_jsonb(p) order by id) from pagos p
    union all select 'auditoria', jsonb_agg(to_jsonb(a) order by id) from audit_log a
  )
), 'migración no altera pagos, acumulados ni auditoría histórica');
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.check_true((select count(*) = 0 from v_resumen_evento), 'anónimo: sin resumen');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.check_true((select count(*) = 1 from v_resumen_evento), 'vendedor A: sólo su salón');
select pg_temp.check_true((select count(*) = 0 from v_resumen_evento where id = pg_temp.id(31)), 'vendedor A: salón B denegado');
select pg_temp.check_true((select total_servicios = 1105 and total_catering = 2000 from v_resumen_evento where id = pg_temp.id(30)), 'vista conserva agregados permitidos');
select set_config('request.jwt.claim.sub', pg_temp.id(3)::text, true);
select pg_temp.check_true((select count(*) = 1 from v_resumen_evento where id = pg_temp.id(31)), 'vendedor B: su salón permitido');
select set_config('request.jwt.claim.sub', pg_temp.id(6)::text, true);
select pg_temp.check_true((select count(*) = 0 from v_resumen_evento), 'inactivo: sin resumen');
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
select pg_temp.check_true((select count(*) = 2 from v_resumen_evento), 'admin: ambos eventos');
select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
select pg_temp.check_true((select count(*) = 2 from catering_contratos), 'sólo catering: contratos propio vinculado y externo permitidos');
select pg_temp.check_true((select count(*) = 0 from catering_contratos where id in (pg_temp.id(62), pg_temp.id(63))), 'sólo catering: contratos ajenos denegados');
select pg_temp.check_true((select count(*) = 0 from v_resumen_evento), 'sólo catering no habilita finanzas de eventos');
reset role;

create function pg_temp.pay(n int, ev int, es int, cc int, amount numeric, guarantee boolean default false)
returns uuid language plpgsql as $$
declare payment_id uuid := pg_temp.id(n);
begin
  insert into pagos (id, evento_id, evento_servicio_id, catering_contrato_id,
    fecha_pago, forma_pago, importe_moneda_original, es_garantia, registrado_por)
  values (payment_id, pg_temp.id(ev), pg_temp.id(es), pg_temp.id(cc),
    '2026-10-21', 'efectivo_pesos', amount, guarantee, auth.uid());
  return payment_id;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(2)::text, true);
select pg_temp.pay(71, 30, 50, null, 100);
select pg_temp.pay(72, 30, 50, null, 40, true);
select pg_temp.check_true((select total_pagado = 100 from evento_servicios where id = pg_temp.id(50)), 'servicio: garantía no aumenta cobro');
update pagos set importe_moneda_original = 150 where id = pg_temp.id(71);
select pg_temp.check_true((select total_pagado = 150 from evento_servicios where id = pg_temp.id(50)), 'servicio: editar importe recalcula');
reset role;
select pg_temp.check_true((select count(*) = 1 from audit_log where tabla = 'evento_servicios' and registro_id = pg_temp.id(50)::text and accion = 'UPDATE' and (datos_nuevos ->> 'total_pagado')::numeric = 150), 'auditoría: destino actualizado una sola vez');
set local role authenticated;
update pagos set es_garantia = true where id = pg_temp.id(71);
select pg_temp.check_true((select total_pagado = 0 from evento_servicios where id = pg_temp.id(50)), 'servicio: convertir en garantía retira cobro');
update pagos set es_garantia = false where id = pg_temp.id(71);
update pagos set deleted_at = now() where id = pg_temp.id(71);
select pg_temp.check_true((select total_pagado = 0 from evento_servicios where id = pg_temp.id(50)), 'servicio: baja lógica retira cobro');
with changed as (update pagos set deleted_at = null where id = pg_temp.id(71) returning id) select pg_temp.check_true(count(*) = 0, 'vendedor no restaura pago de servicio eliminado') from changed;

select pg_temp.pay(73, 30, null, 60, 200);
select pg_temp.pay(74, 30, null, 60, 60, true);
select pg_temp.check_true((select total_pagado = 200 and saldo_pendiente = 1800 from catering_contratos where id = pg_temp.id(60)), 'catering vinculado: sólo cobro ordinario reduce deuda');
select pg_temp.expect_error('select pg_temp.pay(75, 31, 51, null, 10)', '42501', 'vendedor: pago de salón ajeno rechazado');
select pg_temp.expect_error('select pg_temp.pay(75, 30, 51, null, 10)', '23514', 'servicio de otro evento rechazado');
select pg_temp.expect_error('select pg_temp.pay(75, 30, null, 63, 10)', '23514', 'catering de otro evento rechazado');
select pg_temp.expect_error('select pg_temp.pay(75, 30, 50, 60, 10)', '23514', 'destinos simultáneos rechazados por constraint existente');
select pg_temp.expect_error('select pg_temp.pay(75, 30, null, null, 10)', '23514', 'pago sin destino rechazado');
select pg_temp.expect_error('select pg_temp.pay(75, null, 50, null, 10)', '23514', 'servicio sin evento rechazado (NULL)');
select pg_temp.expect_error('select pg_temp.pay(75, 30, 999, null, 10)', '23514', 'servicio inexistente rechazado');
select pg_temp.expect_error('select pg_temp.pay(75, 30, null, 999, 10)', '23514', 'catering inexistente rechazado');
select pg_temp.expect_error('select pg_temp.pay(75, 30, null, 61, 10)', '23514', 'externo con evento incompatible rechazado');
select pg_temp.expect_error('select pg_temp.pay(75, null, null, 60, 10)', '23514', 'catering vinculado requiere evento');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.id(4)::text, true);
select pg_temp.pay(76, null, null, 61, 300);
select pg_temp.pay(77, null, null, 61, 70, true);
select pg_temp.check_true((select total_pagado = 300 and saldo_pendiente = 1700 from catering_contratos where id = pg_temp.id(61)), 'externo: alta ordinaria y garantía');
select pg_temp.pay(78, 30, null, 60, 50);
select pg_temp.check_true((select total_pagado = 250 from catering_contratos where id = pg_temp.id(60)), 'ejecutiva: pago propio vinculado sin permiso de eventos');
update pagos set importe_moneda_original = 350 where id = pg_temp.id(76);
select pg_temp.check_true((select total_pagado = 350 from catering_contratos where id = pg_temp.id(61)), 'externo: editar importe');
update pagos set es_garantia = true where id = pg_temp.id(76);
select pg_temp.check_true((select total_pagado = 0 from catering_contratos where id = pg_temp.id(61)), 'externo: convertir a garantía');
update pagos set es_garantia = false where id = pg_temp.id(76);
update pagos set deleted_at = now() where id = pg_temp.id(76);
select pg_temp.check_true((select total_pagado = 0 from catering_contratos where id = pg_temp.id(61)), 'externo: baja lógica');
select pg_temp.expect_error('select pg_temp.pay(79, null, null, 62, 10)', '42501', 'externo ajeno: alta rechazada por RLS');
select pg_temp.expect_error('update pagos set catering_contrato_id = pg_temp.id(62) where id = pg_temp.id(77)', '42501', 'externo ajeno: reasignación rechazada');
with changed as (update pagos set importe_moneda_original = 999 where id = pg_temp.id(73) returning id) select pg_temp.check_true(count(*) = 1, 'ejecutiva puede editar pagos del contrato asignado') from changed;
reset role;

-- Baja de registro ajeno: ni encuentra ni modifica filas.
select set_config('request.jwt.claim.sub', pg_temp.id(5)::text, true);
set local role authenticated;
with changed as (update pagos set deleted_at = now() where id = pg_temp.id(77) returning id) select pg_temp.check_true(count(*) = 0, 'externo ajeno: baja lógica afecta cero filas') from changed;
reset role;
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
select pg_temp.check_true((select deleted_at is null from pagos where id = pg_temp.id(77)), 'rechazos no alteran pago ajeno');

-- Cambio de destino y borrado físico (sólo admin) mantienen ambos acumulados.
set local role authenticated;
select pg_temp.pay(80, 30, 50, null, 25);
update pagos set evento_id =  pg_temp.id(31), evento_servicio_id = pg_temp.id(51) where id = pg_temp.id(80);
select pg_temp.check_true((select total_pagado = 0 from evento_servicios where id = pg_temp.id(50)), 'reasignación limpia servicio anterior');
select pg_temp.check_true((select total_pagado = 25 from evento_servicios where id = pg_temp.id(51)), 'reasignación actualiza servicio nuevo');
reset role;
delete from pagos where id = pg_temp.id(80);
select pg_temp.check_true((select total_pagado = 0 from evento_servicios where id = pg_temp.id(51)), 'DELETE mantiene total');
set local role authenticated;
select pg_temp.pay(81, null, null, 61, 20);
update pagos set catering_contrato_id = pg_temp.id(62) where id = pg_temp.id(81);
select pg_temp.check_true((select total_pagado = 0 from catering_contratos where id = pg_temp.id(61)), 'reasignación limpia catering anterior');
select pg_temp.check_true((select total_pagado = 20 from catering_contratos where id = pg_temp.id(62)), 'reasignación actualiza catering nuevo');
update pagos set tipo_cambio = 2 where id = pg_temp.id(81);
select pg_temp.check_true((select total_pagado = 40 from catering_contratos where id = pg_temp.id(62)), 'tipo_cambio mantiene origen del importe generado');
reset role;
delete from pagos where id = pg_temp.id(81);

select pg_temp.check_true((select count(*) = 1 from audit_log where tabla = 'pagos' and registro_id = pg_temp.id(76)::text and accion = 'INSERT'), 'auditoría: una entrada de alta de pago');
select pg_temp.check_true((select count(*) = 1 from audit_log where tabla = 'pagos' and registro_id = pg_temp.id(76)::text and accion = 'SOFT_DELETE' and usuario_id = pg_temp.id(4)), 'auditoría: una baja lógica con actor');

-- Escrituras corregidas: los importes generados siguen perteneciendo a PostgreSQL.
insert into catering_items (id, catering_contrato_id, categoria, descripcion, precio_unitario, pax)
values (pg_temp.id(90), pg_temp.id(60), 'adicional_otros', 'Adicional de importe fijo', 100, 1);
select pg_temp.check_true((select total = 100 from catering_items where id = pg_temp.id(90)), 'adicional: total generado con pax=1');
update catering_contratos set total_sin_iva = 1200, total_con_iva = 1452 where id = pg_temp.id(60);
select pg_temp.check_true((select saldo_pendiente = total_con_iva - total_pagado from catering_contratos where id = pg_temp.id(60)), 'recálculo sin enviar saldo generado');

-- Evidencia de modelos distintos de catering, sin elegir una regla nueva.
insert into catering_items (id, catering_contrato_id, categoria, descripcion, precio_unitario, pax)
values (pg_temp.id(91), pg_temp.id(61), 'adicional_otros', 'Comparación', 100, 3);
select pg_temp.check_true((select total_sin_iva = 300 and total_con_iva = 363 from catering_contratos where id = pg_temp.id(61)), 'modelo SQL vigente: suma precio por pax del ítem');
delete from catering_items where id = pg_temp.id(91);
update catering_contratos set deleted_at = now() where id = pg_temp.id(63);
select pg_temp.expect_error('select pg_temp.pay(82, 31, null, 63, 10)', 'P0001', 'catering eliminado rechazado por validador complementario');
select pg_temp.check_true((select count(*) = 0 from pagos where id = pg_temp.id(82)), 'transacción rechazada no deja pago parcial');

-- Reportes de catering externo tienen permiso de lectura de cartera, no de escritura.
insert into roles (id, nombre) values (pg_temp.id(12), 'Reportes prueba');
insert into role_permissions values (pg_temp.id(12), 'reportes', false);
update usuario_roles set role_id = pg_temp.id(12) where usuario_id = pg_temp.id(5);
select set_config('request.jwt.claim.sub', pg_temp.id(5)::text, true);
set local role authenticated;
select pg_temp.check_true((select count(*) = 2 from catering_contratos where evento_id is null), 'reportes: cartera de catering externo permitida');
select pg_temp.check_true((select count(*) = 0 from v_resumen_evento), 'reportes catering: sin acceso a eventos ajenos');
select pg_temp.expect_error('select pg_temp.pay(83, null, null, 62, 10)', '42501', 'reportes sin gestión: escritura denegada');
reset role;
