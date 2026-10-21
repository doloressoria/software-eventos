-- Contactos del evento: sin backfill ni interpretación de cliente_contacto.
create schema contactos_privado;
revoke all on schema contactos_privado from public;
grant usage on schema contactos_privado to authenticated;

create table public.evento_contactos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete restrict,
  nombre text not null check (length(btrim(nombre)) > 0),
  telefono text,
  correo text check (correo is null or correo ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  relacion text,
  observaciones text,
  es_principal boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index evento_contactos_un_principal
  on public.evento_contactos(evento_id) where es_principal and deleted_at is null;
create index evento_contactos_evento on public.evento_contactos(evento_id);

create function contactos_privado.preservar_contacto_anterior()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.cliente_contacto is distinct from old.cliente_contacto then
    raise exception 'El contacto anterior se conserva sin modificaciones; usá contactos del evento'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function contactos_privado.preservar_contacto_anterior() from public, anon, authenticated;
create trigger preservar_contacto_anterior before update of cliente_contacto on public.eventos
  for each row execute function contactos_privado.preservar_contacto_anterior();

-- Reutiliza permisos de negocio sin conceder SELECT del evento a catering.
create function contactos_privado.puede_contactos_evento(p_evento_id uuid, p_manage boolean)
returns boolean language sql stable security definer
set search_path = '' as $$
  select public.current_user_is_active()
    and exists (select 1 from public.eventos e where e.id = p_evento_id and e.deleted_at is null)
    and (
      (public.current_user_has_screen_permission(array['eventos'], p_manage)
        and public.usuario_tiene_evento(p_evento_id))
      or
      (public.current_user_has_screen_permission(array['catering'], p_manage)
        and (not public.current_user_is_vendedor_active() or public.usuario_tiene_evento(p_evento_id))
        and exists (
          select 1 from public.catering_contratos cc
          where cc.evento_id = p_evento_id and cc.deleted_at is null
            and public.usuario_tiene_catering_contrato(cc.id)
        ))
    );
$$;
revoke all on function contactos_privado.puede_contactos_evento(uuid, boolean) from public, anon;
grant execute on function contactos_privado.puede_contactos_evento(uuid, boolean) to authenticated;

alter table public.evento_contactos enable row level security;
revoke all on public.evento_contactos from public, anon, authenticated;
grant select on public.evento_contactos to authenticated;
grant insert (evento_id, nombre, telefono, correo, relacion, observaciones, es_principal)
  on public.evento_contactos to authenticated;
grant update (nombre, telefono, correo, relacion, observaciones, es_principal, deleted_at)
  on public.evento_contactos to authenticated;
create policy contactos_lectura on public.evento_contactos for select to authenticated
  using (contactos_privado.puede_contactos_evento(evento_id, false));
create policy contactos_alta on public.evento_contactos for insert to authenticated
  with check (contactos_privado.puede_contactos_evento(evento_id, true) and deleted_at is null);
create policy contactos_edicion on public.evento_contactos for update to authenticated
  using (deleted_at is null and contactos_privado.puede_contactos_evento(evento_id, true))
  with check (contactos_privado.puede_contactos_evento(evento_id, true));

create function contactos_privado.validar_contacto_evento()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.evento_id is distinct from old.evento_id or new.id <> old.id) then
    raise exception 'No se puede mover un contacto entre eventos' using errcode = '23514';
  end if;
  -- Coordina escrituras directas con el reemplazo transaccional de la colección.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.evento_id::text, 0));
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke all on function contactos_privado.validar_contacto_evento() from public, anon, authenticated;
create trigger validar_contacto_evento before insert or update on public.evento_contactos
  for each row execute function contactos_privado.validar_contacto_evento();
create trigger audit_row_change after insert or update or delete on public.evento_contactos
  for each row execute function public.audit_row_change();

-- Proyección mínima y autorizada para catering sin acceso a la fila del evento.
create function contactos_privado.contexto_contactos_evento(p_evento_id uuid)
returns table (contacto_anterior text, version text, contactos jsonb, puede_editar boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not contactos_privado.puede_contactos_evento(p_evento_id, false) then
    raise exception 'Sin acceso a los contactos del evento' using errcode = '42501';
  end if;
  return query
    select e.cliente_contacto, pg_catalog.md5(list.rows::text), list.rows,
      contactos_privado.puede_contactos_evento(p_evento_id, true)
    from public.eventos e
    cross join lateral (
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.id), '[]'::jsonb) as rows
      from public.evento_contactos c where c.evento_id = e.id and c.deleted_at is null
    ) list
    where e.id = p_evento_id;
end;
$$;
revoke all on function contactos_privado.contexto_contactos_evento(uuid) from public, anon;
grant execute on function contactos_privado.contexto_contactos_evento(uuid) to authenticated;
create function public.evento_contactos_contexto(p_evento_id uuid)
returns table (contacto_anterior text, version text, contactos jsonb, puede_editar boolean)
language sql stable security invoker set search_path = '' as $$
  select * from contactos_privado.contexto_contactos_evento(p_evento_id);
$$;
revoke all on function public.evento_contactos_contexto(uuid) from public, anon;
grant execute on function public.evento_contactos_contexto(uuid) to authenticated;

create function public.guardar_contactos_evento(p_evento_id uuid, p_contactos jsonb, p_version text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  contacto_id uuid;
  version_actual text;
begin
  if not contactos_privado.puede_contactos_evento(p_evento_id, true) then
    raise exception 'Sin permiso para editar contactos' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_evento_id::text, 0));
  select c.version into version_actual from public.evento_contactos_contexto(p_evento_id) c;
  if p_version is distinct from version_actual then
    raise exception 'Los contactos cambiaron. Recargá y revisá antes de guardar.' using errcode = '40001';
  end if;
  if pg_catalog.jsonb_typeof(p_contactos) is distinct from 'array' then
    raise exception 'Lista de contactos inválida' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(p_contactos) c
    where pg_catalog.jsonb_typeof(c) <> 'object'
      or pg_catalog.jsonb_typeof(c->'nombre') is distinct from 'string'
      or nullif(btrim(c->>'nombre'), '') is null
      or pg_catalog.jsonb_typeof(c->'es_principal') is distinct from 'boolean'
      or c - array['id','nombre','telefono','correo','relacion','observaciones','es_principal'] <> '{}'::jsonb
      or exists (select 1 from pg_catalog.jsonb_each(c) field
        where field.key <> 'es_principal' and pg_catalog.jsonb_typeof(field.value) not in ('string','null'))
  ) or (select count(*) from pg_catalog.jsonb_array_elements(p_contactos) c where c->>'es_principal' = 'true') > 1
    or exists (select 1 from pg_catalog.jsonb_array_elements(p_contactos) c
      where nullif(c->>'id','') is not null group by (c->>'id')::uuid having count(*) > 1) then
    raise exception 'Contactos inválidos o más de un principal' using errcode = '22023';
  end if;
  -- Todo pertenece a la misma transacción: cualquier error revierte también bajas.
  update public.evento_contactos c set deleted_at = pg_catalog.clock_timestamp()
  where c.evento_id = p_evento_id and c.deleted_at is null
    and not exists (select 1 from pg_catalog.jsonb_array_elements(p_contactos) j where nullif(j->>'id','')::uuid = c.id);
  -- Desmarcar antes evita conflictos transitorios al cambiar el principal.
  update public.evento_contactos set es_principal = false
    where evento_id = p_evento_id and deleted_at is null and es_principal
      and not exists (select 1 from pg_catalog.jsonb_array_elements(p_contactos) j
        where nullif(j->>'id','')::uuid = evento_contactos.id and j->>'es_principal' = 'true');
  for item in select * from pg_catalog.jsonb_array_elements(p_contactos) loop
    contacto_id := nullif(item->>'id', '')::uuid;
    if contacto_id is null then
      insert into public.evento_contactos (evento_id, nombre, telefono, correo, relacion, observaciones, es_principal)
      values (p_evento_id, btrim(item->>'nombre'), nullif(btrim(item->>'telefono'),''),
        nullif(btrim(item->>'correo'),''), nullif(btrim(item->>'relacion'),''),
        nullif(btrim(item->>'observaciones'),''), (item->>'es_principal')::boolean);
    else
      update public.evento_contactos set nombre = btrim(item->>'nombre'),
        telefono = nullif(btrim(item->>'telefono'),''), correo = nullif(btrim(item->>'correo'),''),
        relacion = nullif(btrim(item->>'relacion'),''), observaciones = nullif(btrim(item->>'observaciones'),''),
        es_principal = (item->>'es_principal')::boolean
      where id = contacto_id and evento_id = p_evento_id and deleted_at is null;
      if not found then
        raise exception 'Contacto inexistente o ajeno al evento' using errcode = '42501';
      end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.guardar_contactos_evento(uuid, jsonb, text) from public, anon;
grant execute on function public.guardar_contactos_evento(uuid, jsonb, text) to authenticated;

-- La aplicación envía sólo los campos comerciales editables.
create function public.guardar_evento_con_contactos(
  p_datos jsonb, p_contactos jsonb, p_version text, p_evento_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  evento public.eventos;
  saved_evento_id uuid;
begin
  if pg_catalog.jsonb_typeof(p_datos) is distinct from 'object'
    or p_datos - array[
      'salon_id', 'vendedor_id', 'cliente_nombre', 'cliente_razon_social',
      'cliente_cuit_dni', 'cliente_direccion', 'cliente_ciudad', 'cliente_direccion_factura',
      'fecha_evento', 'fecha_carga', 'fecha_confirmacion_presupuesto', 'estado',
      'nombre_evento', 'tipo_evento', 'subtipo_evento', 'espacio',
      'pax_adultos', 'pax_jovenes', 'pax_menores', 'pax_bebes',
      'tiene_organizador', 'organizador_nombre', 'organizador_email', 'organizador_telefono',
      'observaciones'
    ] <> '{}'::jsonb then
    raise exception 'Campos de evento inválidos' using errcode = '22023';
  end if;
  if p_evento_id is null then
    evento := pg_catalog.jsonb_populate_record(null::public.eventos, p_datos);
    insert into public.eventos (
      salon_id, vendedor_id, cliente_nombre,
      cliente_razon_social, cliente_cuit_dni, cliente_direccion,
      cliente_ciudad, cliente_direccion_factura, fecha_evento,
      fecha_carga, fecha_confirmacion_presupuesto, estado,
      nombre_evento, tipo_evento, subtipo_evento,
      espacio, pax_adultos, pax_jovenes,
      pax_menores, pax_bebes, tiene_organizador,
      organizador_nombre, organizador_email, organizador_telefono,
      observaciones
    )
    values (
      evento.salon_id, evento.vendedor_id, evento.cliente_nombre,
      evento.cliente_razon_social, evento.cliente_cuit_dni, evento.cliente_direccion,
      evento.cliente_ciudad, evento.cliente_direccion_factura, evento.fecha_evento,
      evento.fecha_carga, evento.fecha_confirmacion_presupuesto, evento.estado,
      evento.nombre_evento, evento.tipo_evento, evento.subtipo_evento,
      evento.espacio, evento.pax_adultos, evento.pax_jovenes,
      evento.pax_menores, evento.pax_bebes, evento.tiene_organizador,
      evento.organizador_nombre, evento.organizador_email, evento.organizador_telefono,
      evento.observaciones
    )
    returning id into saved_evento_id;
  else
    select * into evento from public.eventos where id = p_evento_id and deleted_at is null for update;
    if not found then
      raise exception 'Evento no disponible' using errcode = '42501';
    end if;
    evento := pg_catalog.jsonb_populate_record(evento, p_datos);
    update public.eventos set
      salon_id = evento.salon_id,
      vendedor_id = evento.vendedor_id,
      cliente_nombre = evento.cliente_nombre,
      cliente_razon_social = evento.cliente_razon_social,
      cliente_cuit_dni = evento.cliente_cuit_dni,
      cliente_direccion = evento.cliente_direccion,
      cliente_ciudad = evento.cliente_ciudad,
      cliente_direccion_factura = evento.cliente_direccion_factura,
      fecha_evento = evento.fecha_evento,
      fecha_carga = evento.fecha_carga,
      fecha_confirmacion_presupuesto = evento.fecha_confirmacion_presupuesto,
      estado = evento.estado,
      nombre_evento = evento.nombre_evento,
      tipo_evento = evento.tipo_evento,
      subtipo_evento = evento.subtipo_evento,
      espacio = evento.espacio,
      pax_adultos = evento.pax_adultos,
      pax_jovenes = evento.pax_jovenes,
      pax_menores = evento.pax_menores,
      pax_bebes = evento.pax_bebes,
      tiene_organizador = evento.tiene_organizador,
      organizador_nombre = evento.organizador_nombre,
      organizador_email = evento.organizador_email,
      organizador_telefono = evento.organizador_telefono,
      observaciones = evento.observaciones
    where id = p_evento_id;
    if not found then
      raise exception 'Sin permiso para editar el evento' using errcode = '42501';
    end if;
    saved_evento_id := p_evento_id;
  end if;

  perform public.guardar_contactos_evento(saved_evento_id, p_contactos,
    case when p_evento_id is null then pg_catalog.md5('[]') else p_version end);

  if not evento.tiene_organizador then
    update public.evento_servicios set comisiona_organizador = false
      where evento_servicios.evento_id = saved_evento_id
        and comisiona_organizador;
  end if;
  return saved_evento_id;
end;
$$;
revoke all on function public.guardar_evento_con_contactos(jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.guardar_evento_con_contactos(jsonb, jsonb, text, uuid) to authenticated;

