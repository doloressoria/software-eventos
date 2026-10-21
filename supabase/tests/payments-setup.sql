-- Sólo datos ficticios, en el cluster efímero del runner.
create function pg_temp.id(n int) returns uuid language sql immutable as $$
  select lpad(n::text, 32, '0')::uuid;
$$;
create function pg_temp.check_true(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end;
$$;
create function pg_temp.expect_error(statement text, code text, label text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate = code then
      raise notice 'PASS: % [%]', label, sqlstate;
      return;
    end if;
    raise;
  end;
  raise exception 'FAIL: % (no hubo error)', label;
end;
$$;

insert into auth.users select pg_temp.id(n) from generate_series(1, 6) n;
insert into usuarios (id, full_name, email, rol, activo) values
  (pg_temp.id(1), 'Admin prueba', 'admin@example.invalid', 'admin', true),
  (pg_temp.id(2), 'Vendedor A', 'a@example.invalid', 'vendedor', true),
  (pg_temp.id(3), 'Vendedor B', 'b@example.invalid', 'vendedor', true),
  (pg_temp.id(4), 'Ejecutiva propia', 'c@example.invalid', 'ejecutiva_catering', true),
  (pg_temp.id(5), 'Ejecutiva ajena', 'd@example.invalid', 'ejecutiva_catering', true),
  (pg_temp.id(6), 'Inactivo', 'i@example.invalid', 'vendedor', false);
select set_config('request.jwt.claim.sub', pg_temp.id(1)::text, true);
insert into roles (id, nombre) values (pg_temp.id(10), 'Operación prueba'), (pg_temp.id(11), 'Sólo catering');
insert into role_permissions (role_id, screen, can_manage)
  select pg_temp.id(10), screen, true from unnest(array['eventos','catering','pagos','reportes']) screen;
insert into role_permissions values (pg_temp.id(11), 'catering', true);
insert into usuario_roles values
  (pg_temp.id(2), pg_temp.id(10), now()), (pg_temp.id(3), pg_temp.id(10), now()),
  (pg_temp.id(4), pg_temp.id(11), now()), (pg_temp.id(5), pg_temp.id(11), now()),
  (pg_temp.id(6), pg_temp.id(10), now());
insert into salones (id, nombre) values (pg_temp.id(20), 'Salón A'), (pg_temp.id(21), 'Salón B');
insert into usuario_salon (usuario_id, salon_id) values
  (pg_temp.id(2), pg_temp.id(20)), (pg_temp.id(3), pg_temp.id(21)), (pg_temp.id(6), pg_temp.id(20));
insert into eventos (id, salon_id, vendedor_id, cliente_nombre, fecha_evento) values
  (pg_temp.id(30), pg_temp.id(20), pg_temp.id(2), 'Evento A', '2026-12-01'),
  (pg_temp.id(31), pg_temp.id(21), pg_temp.id(3), 'Evento B', '2026-12-02');
insert into servicios_catalogo (id, nombre, categoria) values (pg_temp.id(40), 'Salón prueba', 'salon');
insert into evento_servicios (id, evento_id, servicio_id, precio_base, iva_base_imponible) values
  (pg_temp.id(50), pg_temp.id(30), pg_temp.id(40), 1000, 500),
  (pg_temp.id(51), pg_temp.id(31), pg_temp.id(40), 1000, 500);
insert into catering_contratos (id, evento_id, ejecutiva_id, total_con_iva, lugar_evento, cliente_nombre, fecha_evento) values
  (pg_temp.id(60), pg_temp.id(30), pg_temp.id(4), 2000, null, null, null),
  (pg_temp.id(61), null, pg_temp.id(4), 2000, 'Lugar prueba', 'Externo propio', '2026-12-03'),
  (pg_temp.id(62), null, pg_temp.id(5), 2000, 'Lugar ajeno', 'Externo ajeno', '2026-12-04'),
  (pg_temp.id(63), pg_temp.id(31), pg_temp.id(5), 2000, null, null, null);
