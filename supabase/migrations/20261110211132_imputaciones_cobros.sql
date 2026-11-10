-- Requires cheque accreditation. Keep legacy destinations readable and writable.
set local lock_timeout = '5s';

alter table public.pagos add column distribuido boolean not null default false,
  drop constraint pago_destino_exclusivo,
  add constraint pago_destino_exclusivo check (
    case when distribuido then evento_id is not null and num_nonnulls(evento_servicio_id, catering_contrato_id) = 0
    else num_nonnulls(evento_servicio_id, catering_contrato_id) = 1 end
  );

create table public.pago_imputaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete cascade,
  evento_servicio_id uuid references public.evento_servicios(id),
  catering_contrato_id uuid references public.catering_contratos(id),
  importe_ars numeric(12,2) not null check (importe_ars > 0 and importe_ars < 'Infinity'::numeric),
  check (num_nonnulls(evento_servicio_id, catering_contrato_id) = 1),
  unique nulls not distinct (pago_id, evento_servicio_id, catering_contrato_id)
);
create index pago_imputaciones_servicio_idx on public.pago_imputaciones(evento_servicio_id)
  where evento_servicio_id is not null;
create index pago_imputaciones_catering_idx on public.pago_imputaciones(catering_contrato_id)
  where catering_contrato_id is not null;

alter table public.pago_imputaciones enable row level security;
revoke all on public.pago_imputaciones from public, anon, authenticated, service_role;
grant select on public.pago_imputaciones to anon, authenticated, service_role;
create policy imputaciones_select on public.pago_imputaciones for select to authenticated
  using (exists (select 1 from public.pagos p where p.id = pago_id));
create trigger audit_row_change after insert or update or delete on public.pago_imputaciones
  for each row execute function public.audit_row_change('pago_id,id');

-- Ordinary API writes may only soft-delete a distributed header.
create function software_eventos_private.proteger_pago_distribuido()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> pg_get_userbyid((
    select proowner from pg_proc where oid =
      'public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)'::regprocedure
  )) then
    if tg_op = 'INSERT' then
      if new.distribuido then
        raise exception 'Usá guardar_pago_distribuido' using errcode = '42501';
      end if;
    elsif tg_op = 'DELETE' then
      if old.distribuido then
        raise exception 'El cobro distribuido requiere baja lógica' using errcode = '42501';
      end if;
    elsif (old.distribuido or new.distribuido) and not (
      old.distribuido and old.deleted_at is null and new.deleted_at is not null
      and (to_jsonb(new) - array['deleted_at','updated_at','importe_en_pesos'])
        = (to_jsonb(old) - array['deleted_at','updated_at','importe_en_pesos'])
    ) then
      raise exception 'Usá guardar_pago_distribuido' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

-- Assigned catering staff without venue access may see only their own
-- allocation, never the full header or the other destinations.
create function software_eventos_private.imputaciones_catering_asignado(p_catering uuid)
returns table (
  id uuid, pago_id uuid, evento_id uuid, concepto text, created_at timestamptz,
  fecha_pago date, forma_pago public.forma_pago, moneda public.moneda, banco text,
  numero_cheque text, tipo_cambio numeric, importe_en_pesos numeric,
  es_garantia boolean, notas text
)
language sql stable security definer set search_path = '' as $$
  select i.id, p.id, p.evento_id, p.concepto, p.created_at, p.fecha_pago,
    p.forma_pago, p.moneda, p.banco, p.numero_cheque, p.tipo_cambio, i.importe_ars, p.es_garantia, p.notas
  from public.pago_imputaciones i
  join public.pagos p on p.id = i.pago_id
  join public.catering_contratos c on c.id = i.catering_contrato_id
  where i.catering_contrato_id = p_catering and p.deleted_at is null
    and c.deleted_at is null and c.evento_id = p.evento_id
    and c.ejecutiva_id = auth.uid()
    and public.current_user_is_active() and not public.current_user_is_vendedor_active()
    and not public.usuario_tiene_evento(p.evento_id)
    and public.current_user_has_screen_permission(array['eventos','catering','pagos','reportes'], false)
$$;
revoke all on function software_eventos_private.imputaciones_catering_asignado(uuid)
  from public, anon, authenticated, service_role;
grant execute on function software_eventos_private.imputaciones_catering_asignado(uuid)
  to anon, authenticated, service_role;

-- The flat view is for destination-scoped consumers. A split row carries its
-- allocated ARS amount; the full original amount remains on the header.
create view public.v_pago_imputaciones with (security_invoker = true) as
select p.id, p.id as pago_id, p.evento_id, p.evento_servicio_id, p.catering_contrato_id,
  p.concepto, p.created_at, p.fecha_pago, p.forma_pago, p.moneda, p.banco, p.numero_cheque,
  p.importe_moneda_original, p.tipo_cambio, p.importe_en_pesos, p.es_garantia, p.deleted_at, p.notas, p.distribuido
from public.pagos p where not p.distribuido
union all
select i.id, p.id, p.evento_id, i.evento_servicio_id, i.catering_contrato_id,
  p.concepto, p.created_at, p.fecha_pago, p.forma_pago, p.moneda, p.banco, p.numero_cheque,
  null, p.tipo_cambio, i.importe_ars, p.es_garantia, p.deleted_at, p.notas, p.distribuido
from public.pago_imputaciones i join public.pagos p on p.id = i.pago_id
union all
select a.id, a.pago_id, a.evento_id, null::uuid, c.id,
  a.concepto, a.created_at, a.fecha_pago, a.forma_pago, a.moneda, a.banco, a.numero_cheque,
  null, a.tipo_cambio, a.importe_en_pesos, a.es_garantia, null::timestamptz, a.notas, true
from public.catering_contratos c
cross join lateral software_eventos_private.imputaciones_catering_asignado(c.id) a
where not exists (select 1 from public.pagos p where p.id = a.pago_id);
revoke all on public.v_pago_imputaciones from public, anon, authenticated, service_role;
grant select on public.v_pago_imputaciones to anon, authenticated, service_role;

create or replace function software_eventos_private.cobros_acreditados(p_servicio uuid, p_catering uuid, p_dia date)
returns table (cobrado numeric, neto_no_efectivo numeric, incluye_cheque boolean)
language sql stable security invoker set search_path = '' as $$
  select round(coalesce(sum(p.importe_en_pesos), 0), 2),
    coalesce(sum(round(p.importe_en_pesos / 1.21, 2))
      filter (where p.forma_pago not in ('efectivo_pesos', 'efectivo_dolares')), 0),
    coalesce(bool_or(p.forma_pago = 'cheque'), false)
  from public.v_pago_imputaciones p
  where (p.evento_servicio_id = p_servicio or p.catering_contrato_id = p_catering)
    and p.deleted_at is null and not p.es_garantia
    and (p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia)
$$;

create or replace function software_eventos_private.sincronizar_cheques()
returns void language sql set search_path = '' set lock_timeout = '5s' as $$
  select software_eventos_private.actualizar_cobros(
    array_agg(ids.evento_servicio_id) filter (where ids.evento_servicio_id is not null),
    array_agg(ids.catering_contrato_id) filter (where ids.catering_contrato_id is not null),
    software_eventos_private.dia_argentina(), true)
  from (
    select distinct p.evento_servicio_id, p.catering_contrato_id
    from public.v_pago_imputaciones p
    where p.forma_pago = 'cheque' and p.deleted_at is null and not p.es_garantia
      and p.fecha_pago <= software_eventos_private.dia_argentina()
  ) ids
  left join public.evento_servicios s on s.id = ids.evento_servicio_id
  left join public.catering_contratos c on c.id = ids.catering_contrato_id and c.deleted_at is null
  cross join lateral software_eventos_private.cobros_acreditados(s.id, c.id, software_eventos_private.dia_argentina()) a
  where (s.id is not null or c.id is not null)
    and a.cobrado is distinct from coalesce(s.total_pagado, c.total_pagado)
$$;

create or replace function public.fn_actualizar_totales_pagos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  servicios uuid[] := '{}';
  caterings uuid[] := '{}';
  dia date := software_eventos_private.dia_argentina();
begin
  -- The RPC recalculates once after replacing the detail, including old targets.
  if tg_op in ('INSERT', 'UPDATE') and new.distribuido and new.deleted_at is null then
    return null;
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    if old.deleted_at is null and not old.es_garantia and (old.forma_pago <> 'cheque' or old.fecha_pago <= dia) then
      if old.distribuido then
        select array_agg(evento_servicio_id), array_agg(catering_contrato_id)
        into servicios, caterings from public.pago_imputaciones where pago_id = old.id;
      else
        servicios := array_append(servicios, old.evento_servicio_id);
        caterings := array_append(caterings, old.catering_contrato_id);
      end if;
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    if new.deleted_at is null and not new.es_garantia and (new.forma_pago <> 'cheque' or new.fecha_pago <= dia) then
      servicios := array_append(servicios, new.evento_servicio_id);
      caterings := array_append(caterings, new.catering_contrato_id);
    end if;
  end if;
  perform software_eventos_private.actualizar_cobros(servicios, caterings, dia);
  return null;
end;
$$;

-- Existing legacy catering can still be associated or moved. Active split
-- income prevents a destination from being moved to a different event.
create function software_eventos_private.proteger_destino_imputado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.pago_imputaciones i join public.pagos p on p.id = i.pago_id
    where p.deleted_at is null and
      case tg_table_name when 'evento_servicios' then i.evento_servicio_id = old.id
        else i.catering_contrato_id = old.id end) then
    raise exception 'El destino tiene cobros distribuidos activos' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger proteger_destino_imputado before update of evento_id on public.evento_servicios
  for each row when (old.evento_id is distinct from new.evento_id)
  execute function software_eventos_private.proteger_destino_imputado();
create trigger proteger_destino_imputado before update of evento_id, deleted_at on public.catering_contratos
  for each row when (old.evento_id is distinct from new.evento_id or
    (old.deleted_at is null and new.deleted_at is not null))
  execute function software_eventos_private.proteger_destino_imputado();

create function public.guardar_pago_distribuido(
  p_evento uuid, p_pago uuid, p_editar boolean, p_cabecera jsonb, p_imputaciones jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  anterior public.pagos;
  datos public.pagos;
  equivalente numeric;
  servicios uuid[];
  caterings uuid[];
  lineas jsonb;
  dia date := software_eventos_private.dia_argentina();
  recalcular boolean;
begin
  -- Match the existing event payment scope and payment write permissions.
  if actor is null or not public.current_user_is_active()
    or not public.usuario_tiene_evento(p_evento)
    or not public.current_user_has_screen_permission(array['eventos'], true)
    or p_pago is null or p_editar is null then
    raise exception 'Cobro no autorizado' using errcode = '42501';
  end if;
  -- Serialize replays, including the case where the header has yet to be inserted.
  perform pg_advisory_xact_lock(hashtextextended(p_pago::text, 0));
  select * into anterior from public.pagos where id = p_pago for update;
  -- Existing payment triggers update the event before destination balances.
  perform 1 from public.eventos where id = p_evento and deleted_at is null for no key update;
  if not found or not public.usuario_tiene_evento(p_evento) then
    raise exception 'Evento no disponible' using errcode = '42501';
  end if;
  if anterior.id is not null and (anterior.evento_id is distinct from p_evento
    or anterior.deleted_at is not null or
    (anterior.registrado_por is distinct from actor and (not p_editar or not public.current_user_is_active_admin()))) then
    raise exception 'Cobro no disponible' using errcode = '42501';
  end if;
  if p_editar and anterior.id is null then
    raise exception 'Cobro no disponible' using errcode = '42501';
  end if;

  datos := jsonb_populate_record(null::public.pagos, p_cabecera);
  if datos.importe_moneda_original is null or datos.importe_moneda_original <= 0
    or datos.importe_moneda_original = 'NaN'::numeric
    or datos.importe_moneda_original <> (p_cabecera->>'importe_moneda_original')::numeric
    or datos.tipo_cambio is null or datos.tipo_cambio <= 0 or datos.tipo_cambio = 'NaN'::numeric
    or datos.tipo_cambio <> (p_cabecera->>'tipo_cambio')::numeric
    or datos.fecha_pago is null or not isfinite(datos.fecha_pago)
    or datos.forma_pago is null or datos.moneda is null or datos.es_garantia is null then
    raise exception 'Cabecera inválida' using errcode = '23514';
  end if;
  equivalente := round(datos.importe_moneda_original * datos.tipo_cambio, 2);

  if p_imputaciones is null or jsonb_typeof(p_imputaciones) <> 'array' then
    raise exception 'Seleccioná destinos del evento' using errcode = '23514';
  end if;
  if jsonb_array_length(p_imputaciones) not between 1 and 50 then
    raise exception 'Ingresá entre 1 y 50 imputaciones' using errcode = '23514';
  end if;
  select jsonb_agg(to_jsonb(i) order by i.evento_servicio_id, i.catering_contrato_id)
  into lineas from jsonb_to_recordset(p_imputaciones)
    as i(evento_servicio_id uuid, catering_contrato_id uuid, importe_ars numeric);
  if exists (
    select 1 from jsonb_to_recordset(lineas) as i(evento_servicio_id uuid, catering_contrato_id uuid, importe_ars numeric)
    where num_nonnulls(i.evento_servicio_id, i.catering_contrato_id) <> 1
      or i.importe_ars is null or not (i.importe_ars > 0 and i.importe_ars < 'Infinity'::numeric)
      or i.importe_ars <> round(i.importe_ars, 2)
  ) or (
    select sum(i.importe_ars) <> equivalente or count(*) <> count(distinct row(i.evento_servicio_id, i.catering_contrato_id))
    from jsonb_to_recordset(lineas) as i(evento_servicio_id uuid, catering_contrato_id uuid, importe_ars numeric)
  ) then
    raise exception 'Los destinos deben ser distintos y sumar el equivalente en ARS' using errcode = '23514';
  end if;

  if not p_editar and anterior.id is not null then
    if anterior.distribuido and
      row(anterior.concepto, anterior.es_garantia, anterior.fecha_pago, anterior.forma_pago, anterior.importe_moneda_original,
        anterior.moneda, anterior.tipo_cambio, anterior.banco, anterior.numero_cheque, anterior.notas)
      is not distinct from
      row(datos.concepto, datos.es_garantia, datos.fecha_pago, datos.forma_pago, datos.importe_moneda_original,
        datos.moneda, datos.tipo_cambio, datos.banco, datos.numero_cheque, datos.notas)
      and lineas = (select jsonb_agg(jsonb_build_object(
        'evento_servicio_id', i.evento_servicio_id, 'catering_contrato_id', i.catering_contrato_id, 'importe_ars', i.importe_ars
      ) order by i.evento_servicio_id, i.catering_contrato_id) from public.pago_imputaciones i where i.pago_id = p_pago) then
      return p_pago;
    end if;
    raise exception 'La solicitud ya se usó para otro cobro' using errcode = '23505';
  end if;

  select array_agg(distinct d.servicio) filter (where d.servicio is not null),
    array_agg(distinct d.catering) filter (where d.catering is not null)
  into servicios, caterings
  from (
    select anterior.evento_servicio_id as servicio, anterior.catering_contrato_id as catering
    union all select evento_servicio_id, catering_contrato_id from public.pago_imputaciones where pago_id = p_pago
    union all select evento_servicio_id, catering_contrato_id
      from jsonb_to_recordset(lineas) as i(evento_servicio_id uuid, catering_contrato_id uuid)
  ) d;

  -- Same lock order as the cheque reconciler. Keep destinations stable during validation.
  perform 1 from public.evento_servicios where evento_id = p_evento and id = any(servicios) order by id for no key update;
  perform 1 from public.catering_contratos where evento_id = p_evento and id = any(caterings) order by id for no key update;
  if exists (
    select 1 from jsonb_to_recordset(lineas) as i(evento_servicio_id uuid, catering_contrato_id uuid)
    left join public.evento_servicios s on s.id = i.evento_servicio_id and s.evento_id = p_evento
    left join public.catering_contratos c on c.id = i.catering_contrato_id and c.evento_id = p_evento and c.deleted_at is null
    where s.id is null and c.id is null
  ) then
    raise exception 'Algún destino no pertenece al evento o está dado de baja' using errcode = '23514';
  end if;

  if p_editar then
    update public.pagos set concepto = datos.concepto, es_garantia = datos.es_garantia,
      fecha_pago = datos.fecha_pago, forma_pago = datos.forma_pago, importe_moneda_original = datos.importe_moneda_original,
      moneda = datos.moneda, tipo_cambio = datos.tipo_cambio, banco = datos.banco, numero_cheque = datos.numero_cheque,
      notas = datos.notas, distribuido = true, evento_servicio_id = null, catering_contrato_id = null
    where id = p_pago;
  else
    insert into public.pagos (id, evento_id, concepto, es_garantia, fecha_pago, forma_pago,
      importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas, distribuido, registrado_por)
    values (p_pago, p_evento, datos.concepto, datos.es_garantia, datos.fecha_pago, datos.forma_pago,
      datos.importe_moneda_original, datos.moneda, datos.tipo_cambio, datos.banco, datos.numero_cheque, datos.notas, true, actor);
  end if;

  delete from public.pago_imputaciones d where d.pago_id = p_pago and not exists (
    select 1 from jsonb_to_recordset(lineas) as i(evento_servicio_id uuid, catering_contrato_id uuid)
    where row(d.evento_servicio_id, d.catering_contrato_id)
      is not distinct from row(i.evento_servicio_id, i.catering_contrato_id)
  );
  insert into public.pago_imputaciones as d (pago_id, evento_servicio_id, catering_contrato_id, importe_ars)
  select p_pago, evento_servicio_id, catering_contrato_id, importe_ars
  from jsonb_to_recordset(lineas) as i(evento_servicio_id uuid, catering_contrato_id uuid, importe_ars numeric)
  on conflict (pago_id, evento_servicio_id, catering_contrato_id) do update
    set importe_ars = excluded.importe_ars where d.importe_ars <> excluded.importe_ars;

  recalcular := (not datos.es_garantia and (datos.forma_pago <> 'cheque' or datos.fecha_pago <= dia))
    or (anterior.id is not null and not anterior.es_garantia and (anterior.forma_pago <> 'cheque' or anterior.fecha_pago <= dia));
  if recalcular then
    perform software_eventos_private.actualizar_cobros(servicios, caterings, dia);
  end if;
  return p_pago;
end
$$;

revoke all on function public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb) to authenticated;
revoke all on function software_eventos_private.proteger_pago_distribuido(),
  software_eventos_private.proteger_destino_imputado() from public, anon, authenticated, service_role;
create trigger proteger_pago_distribuido before insert or update or delete on public.pagos
  for each row execute function software_eventos_private.proteger_pago_distribuido();

notify pgrst, 'reload schema';
