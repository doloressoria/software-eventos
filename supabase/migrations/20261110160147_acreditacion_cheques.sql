-- Requires the USD, partial VAT, and atomic catering migrations.
set local lock_timeout = '5s';

create function software_eventos_private.dia_argentina(p_instante timestamptz default statement_timestamp())
returns date language sql stable set search_path = '' as $$
  select (p_instante at time zone 'America/Argentina/Buenos_Aires')::date
$$;

-- fecha_pago keeps its historical value. For cheques it is the effective date;
-- created_at independently records when the payment was entered.
create function software_eventos_private.cobros_acreditados(p_servicio uuid, p_catering uuid, p_dia date)
returns table (cobrado numeric, neto_no_efectivo numeric, incluye_cheque boolean)
language sql stable security invoker set search_path = '' as $$
  select round(coalesce(sum(p.importe_en_pesos), 0), 2),
    coalesce(sum(round(p.importe_en_pesos / 1.21, 2))
      filter (where p.forma_pago not in ('efectivo_pesos', 'efectivo_dolares')), 0),
    coalesce(bool_or(p.forma_pago = 'cheque'), false)
  from public.pagos p
  where (p.evento_servicio_id = p_servicio or p.catering_contrato_id = p_catering)
    and p.deleted_at is null and not p.es_garantia
    and (p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia)
$$;

revoke all on function software_eventos_private.dia_argentina(timestamptz),
  software_eventos_private.cobros_acreditados(uuid, uuid, date) from public, anon, authenticated;
-- Invoker views call these helpers without exposing the private schema.
grant execute on function software_eventos_private.dia_argentina(timestamptz),
  software_eventos_private.cobros_acreditados(uuid, uuid, date) to authenticated, service_role;

create index pagos_cheques_ordinarios_fecha_idx on public.pagos (fecha_pago)
where forma_pago = 'cheque' and deleted_at is null and not es_garantia;

-- Shared by payment writes and the scheduled catch-up. Lock before summing so
-- concurrent writers don't replace a parent's total with a stale sum.
create function software_eventos_private.actualizar_cobros(
  p_servicios uuid[], p_caterings uuid[], p_dia date, p_solo_cobros_nuevos boolean default false
)
returns void language plpgsql set search_path = '' as $$
declare
  s public.evento_servicios;
  nuevo_cobrado numeric;
  nueva_base numeric;
begin
  for s in select * from public.evento_servicios where id = any(p_servicios) order by id for no key update
  loop
    select a.cobrado, least(s.total_sin_iva, greatest(s.iva_base_imponible, a.neto_no_efectivo))
    into nuevo_cobrado, nueva_base
    from software_eventos_private.cobros_acreditados(s.id, null, p_dia) a;

    update public.evento_servicios
    set total_pagado = nuevo_cobrado, iva_base_imponible = nueva_base, iva_porcentaje = 0.21
    where id = s.id
      and (not p_solo_cobros_nuevos or total_pagado is distinct from nuevo_cobrado)
      and row(total_pagado, iva_base_imponible, iva_porcentaje)
        is distinct from row(nuevo_cobrado, nueva_base, 0.21);
  end loop;

  perform c.id from public.catering_contratos c where c.id = any(p_caterings) order by c.id for no key update;
  update public.catering_contratos c set total_pagado = a.cobrado
  from unnest(p_caterings) ids(id)
  cross join lateral software_eventos_private.cobros_acreditados(null, ids.id, p_dia) a
  where c.id = ids.id and c.total_pagado is distinct from a.cobrado;
end;
$$;
revoke all on function software_eventos_private.actualizar_cobros(uuid[], uuid[], date, boolean)
  from public, anon, authenticated;

create or replace function public.fn_actualizar_totales_pagos()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  servicios uuid[] := '{}';
  caterings uuid[] := '{}';
  dia date := software_eventos_private.dia_argentina();
begin
  if tg_op in ('UPDATE', 'DELETE') then
    if old.deleted_at is null and not old.es_garantia and (old.forma_pago <> 'cheque' or old.fecha_pago <= dia) then
      servicios := array_append(servicios, old.evento_servicio_id);
      caterings := array_append(caterings, old.catering_contrato_id);
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
revoke all on function public.fn_actualizar_totales_pagos() from public, anon, authenticated;

create or replace function software_eventos_private.catering_compute_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  price numeric;
  subtotal numeric;
  commission numeric := coalesce(new.comision_organizador_monto, 0);
begin
  select h.precio_unitario into price from public.catering_precio_historial h
  where h.catering_contrato_id = new.id
  order by h.fecha desc, h.created_at desc, h.id desc limit 1;
  subtotal := round(coalesce(price, 0) * (coalesce(new.pax_adultos, 0)
    + coalesce(new.pax_jovenes, 0) + coalesce(new.pax_menores, 0)
    + coalesce(new.pax_bebes, 0)), 2)
    + (select round(coalesce(sum(i.precio_unitario), 0), 2)
       from public.catering_items i where i.catering_contrato_id = new.id);
  new.total_sin_iva := round(subtotal + commission, 2);
  new.total_con_iva := round(subtotal + round(subtotal * coalesce(new.iva_porcentaje, 0), 2)
    + commission + round(commission * coalesce(new.iva_comision, 0), 2), 2);
  select a.cobrado into new.total_pagado
  from software_eventos_private.cobros_acreditados(null, new.id, software_eventos_private.dia_argentina()) a;
  return new;
end;
$$;

CREATE OR REPLACE FUNCTION public.validar_catering_contrato_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Cron has no JWT. Only an update of DB-derived totals may use this path.
  if tg_op = 'UPDATE' and auth.uid() is null
    and (to_jsonb(new) - array['total_pagado', 'saldo_pendiente', 'total_sin_iva', 'total_con_iva', 'updated_at'])
      = (to_jsonb(old) - array['total_pagado', 'saldo_pendiente', 'total_sin_iva', 'total_con_iva', 'updated_at']) then
    return new;
  end if;

  -- Si hay ejecutiva, debe ser un usuario activo.
  if new.ejecutiva_id is not null then
    if not exists (
      select 1
      from public.usuarios u
      where u.id = new.ejecutiva_id
        and u.activo = true
    ) then
      raise exception 'La ejecutiva asignada no existe o está inactiva';
    end if;
  end if;

  -- En INSERT el RLS controla quién puede crear/vincular.
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Admin puede modificar asociaciones.
  if public.current_user_is_active_admin() then
    return new;
  end if;

  if not public.current_user_is_active() then
    raise exception 'Usuario inactivo';
  end if;


  -- ----------------------------------------------------------
  -- Cambio de evento asociado.
  -- Debe tener acceso al evento anterior (si existía)
  -- y al nuevo evento (si existe).
  -- ----------------------------------------------------------
  if old.evento_id is distinct from new.evento_id then

    if old.evento_id is not null
       and not public.usuario_tiene_evento(old.evento_id) then
      raise exception
        'No tiene permisos para modificar la asociación del evento actual';
    end if;

    if new.evento_id is not null
       and not public.usuario_tiene_evento(new.evento_id) then
      raise exception
        'No tiene permisos para asociar este catering al evento indicado';
    end if;

  end if;


  -- ----------------------------------------------------------
  -- Cambio de ejecutiva.
  --
  -- En catering vinculado a evento:
  -- solamente alguien con permisos del evento puede reasignarla.
  --
  -- En catering standalone:
  -- solamente admin puede reasignarla.
  -- ----------------------------------------------------------
  if old.ejecutiva_id is distinct from new.ejecutiva_id then

    if new.evento_id is null then
      raise exception
        'Solo un administrador puede reasignar la ejecutiva de un catering externo';
    end if;

    if not public.usuario_tiene_evento(new.evento_id) then
      raise exception
        'No tiene permisos para reasignar la ejecutiva de este catering';
    end if;

  end if;

  return new;
end;
$function$;

-- Read balances at the current local date even if Cron has not run yet.
create view public.v_evento_servicios_acreditados with (security_invoker = true) as
select s.id, s.evento_id, s.servicio_id, s.precio_base, s.adicionales_monto,
  iva.porcentaje as iva_porcentaje, s.proveedor, a.cobrado as total_pagado,
  round(t.total - a.cobrado, 2) as saldo_pendiente,
  s.notas, s.created_at, s.updated_at, iva.base as iva_base_imponible,
  s.total_sin_iva, t.total as total_con_iva, s.comisiona_organizador
from public.evento_servicios s
cross join lateral software_eventos_private.cobros_acreditados(s.id, null, software_eventos_private.dia_argentina()) a
cross join lateral (
  select case when a.incluye_cheque and a.cobrado is distinct from s.total_pagado then least(s.total_sin_iva, greatest(s.iva_base_imponible, a.neto_no_efectivo))
    else s.iva_base_imponible end as base,
  case when a.incluye_cheque and a.cobrado is distinct from s.total_pagado then 0.21 else s.iva_porcentaje end as porcentaje
) iva
cross join lateral (select s.total_sin_iva + iva.base * coalesce(iva.porcentaje, 0) as total) t;

create view public.v_catering_acreditado with (security_invoker = true) as
select c.id, c.evento_id, c.ejecutiva_id, c.tipo_servicio, c.pax_comida, c.pax_post_postre, c.pax_final,
  c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes, c.precio_cierre_alimentos_sin_iva,
  c.precio_cierre_bebidas_sin_iva, c.iva_porcentaje, c.comision_organizador_monto, c.iva_comision,
  c.emite_factura, c.monto_con_factura, c.monto_sin_factura, c.factura_concepto, c.factura_razon_social,
  c.factura_cuit, c.factura_direccion, c.factura_contacto_admin, c.total_sin_iva, c.total_con_iva,
  a.cobrado as total_pagado, round(c.total_con_iva - a.cobrado, 2) as saldo_pendiente,
  c.notas, c.deleted_at, c.created_at, c.updated_at, c.cliente_nombre, c.cliente_razon_social,
  c.cliente_cuit_dni, c.cliente_contacto, c.fecha_evento, c.salon_id, c.tipo_evento, c.lugar_evento
from public.catering_contratos c
cross join lateral software_eventos_private.cobros_acreditados(null, c.id, software_eventos_private.dia_argentina()) a;

revoke all on public.v_evento_servicios_acreditados, public.v_catering_acreditado from public, anon, authenticated;
grant select on public.v_evento_servicios_acreditados, public.v_catering_acreditado to authenticated, service_role;

create or replace view public.v_resumen_evento with (security_invoker = true) as
select e.id, e.cliente_nombre, e.estado, e.fecha_evento, s.nombre as salon, u.full_name as vendedor,
  coalesce(servicios.total, 0) as total_servicios,
  coalesce(servicios.cobrado, 0) as total_pagado_servicios,
  coalesce(servicios.total, 0) - coalesce(servicios.cobrado, 0) as saldo_servicios,
  coalesce(catering.total, 0) as total_catering,
  coalesce(catering.cobrado, 0) as total_pagado_catering,
  coalesce(catering.total, 0) - coalesce(catering.cobrado, 0) as saldo_catering
from public.eventos e
left join public.salones s on s.id = e.salon_id
left join public.usuarios u on u.id = e.vendedor_id
left join (
  select evento_id, sum(total_con_iva) as total, sum(total_pagado) as cobrado
  from public.v_evento_servicios_acreditados group by evento_id
) servicios on servicios.evento_id = e.id
left join (
  select evento_id, sum(total_con_iva) as total, sum(total_pagado) as cobrado
  from public.v_catering_acreditado where deleted_at is null group by evento_id
) catering on catering.evento_id = e.id
where e.deleted_at is null;

-- Keep the old summary view's anon behavior (empty due to underlying RLS).
grant select on public.v_evento_servicios_acreditados, public.v_catering_acreditado to anon;
grant execute on function software_eventos_private.dia_argentina(timestamptz),
  software_eventos_private.cobros_acreditados(uuid, uuid, date) to anon;

create function software_eventos_private.sincronizar_cheques()
returns void language sql set search_path = '' set lock_timeout = '5s' as $$
  select software_eventos_private.actualizar_cobros(
    array_agg(ids.evento_servicio_id) filter (where ids.evento_servicio_id is not null),
    array_agg(ids.catering_contrato_id) filter (where ids.catering_contrato_id is not null),
    software_eventos_private.dia_argentina(), true)
  -- shortcut: scan active due cheques, introduce a due-date queue if this scan becomes expensive.
  from (
    select distinct p.evento_servicio_id, p.catering_contrato_id
    from public.pagos p
    where p.forma_pago = 'cheque' and p.deleted_at is null and not p.es_garantia
      and p.fecha_pago <= software_eventos_private.dia_argentina()
  ) ids
  left join public.evento_servicios s on s.id = ids.evento_servicio_id
  left join public.catering_contratos c on c.id = ids.catering_contrato_id and c.deleted_at is null
  cross join lateral software_eventos_private.cobros_acreditados(s.id, c.id, software_eventos_private.dia_argentina()) a
  where (s.id is not null or c.id is not null)
    and a.cobrado is distinct from coalesce(s.total_pagado, c.total_pagado)
$$;
revoke all on function software_eventos_private.sincronizar_cheques() from public, anon, authenticated;

-- Reconcile targets with legacy future cheques once; payment dates are untouched.
select software_eventos_private.actualizar_cobros(
  array_agg(distinct p.evento_servicio_id) filter (where p.evento_servicio_id is not null),
  array_agg(distinct p.catering_contrato_id) filter (where p.catering_contrato_id is not null),
  software_eventos_private.dia_argentina())
from public.pagos p
where p.forma_pago = 'cheque' and p.deleted_at is null and not p.es_garantia
  and p.fecha_pago > software_eventos_private.dia_argentina();

notify pgrst, 'reload schema';
