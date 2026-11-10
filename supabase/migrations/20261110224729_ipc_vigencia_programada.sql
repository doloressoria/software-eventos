begin;
set local lock_timeout = '5s';

-- The monthly index remains immutable; a schedule may exist before its index.
create table public.ipc_programaciones (
  id uuid primary key default gen_random_uuid(),
  periodo date not null unique check (isfinite(periodo) and periodo = date_trunc('month', periodo::timestamp)::date),
  fecha_vigencia date not null check (isfinite(fecha_vigencia)),
  usuario_id uuid not null references public.usuarios(id),
  estado text not null default 'pendiente' check (estado in ('pendiente','sin_indice','aplicado','revision','error')),
  motivo text,
  ejecutado_at timestamptz,
  created_at timestamptz not null default now(),
  check ((estado = 'aplicado') = (ejecutado_at is not null))
);
create table public.ipc_aplicaciones (
  id uuid primary key default gen_random_uuid(),
  programacion_id uuid not null references public.ipc_programaciones(id),
  ipc_indice_id uuid not null references public.ipc_indices(id),
  -- Services can be deleted by the existing flow; keep their historical identifier.
  evento_servicio_id uuid,
  catering_contrato_id uuid references public.catering_contratos(id),
  fecha_efectiva date not null,
  porcentaje numeric(12,4) not null check (porcentaje > -100 and porcentaje < 100000000),
  base_ajustada numeric(14,2) not null check (base_ajustada >= 0),
  incremento numeric(14,2) not null,
  saldo_resultante numeric(14,2) not null check (saldo_resultante >= 0),
  created_at timestamptz not null default now(),
  check (num_nonnulls(evento_servicio_id, catering_contrato_id) = 1),
  check (saldo_resultante = base_ajustada + incremento),
  unique (programacion_id, evento_servicio_id),
  unique (programacion_id, catering_contrato_id)
);
create index ipc_aplicaciones_servicio_idx on public.ipc_aplicaciones(evento_servicio_id)
  where evento_servicio_id is not null;
create index ipc_aplicaciones_catering_idx on public.ipc_aplicaciones(catering_contrato_id)
  where catering_contrato_id is not null;
alter table public.ipc_programaciones enable row level security;
alter table public.ipc_aplicaciones enable row level security;
revoke all on public.ipc_programaciones, public.ipc_aplicaciones from public, anon, authenticated, service_role;
grant select on public.ipc_programaciones, public.ipc_aplicaciones to authenticated, service_role;
create policy ipc_programaciones_admin on public.ipc_programaciones for select to authenticated
  using (public.current_user_is_active_admin());
create policy ipc_aplicaciones_admin on public.ipc_aplicaciones for select to authenticated
  using (public.current_user_is_active_admin());
create trigger audit_row_change after insert or update on public.ipc_programaciones
  for each row execute function public.audit_row_change();
create trigger audit_row_change after insert on public.ipc_aplicaciones
  for each row execute function public.audit_row_change();
-- The old index table has no audit trigger in the deployed baseline.
create trigger audit_row_change after insert on public.ipc_indices
  for each row execute function public.audit_row_change();

-- Final ARS adjustment, after VAT; only the immutable ledger can supply it.
alter table public.evento_servicios add column ajuste_ipc numeric(14,2) not null default 0;
alter table public.catering_contratos add column ajuste_ipc numeric(14,2) not null default 0;
create function software_eventos_private.derivar_ajuste_ipc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'evento_servicios' then
    select coalesce(sum(a.incremento), 0) into new.ajuste_ipc
    from public.ipc_aplicaciones a where a.evento_servicio_id = new.id;
  else
    select coalesce(sum(a.incremento), 0) into new.ajuste_ipc
    from public.ipc_aplicaciones a where a.catering_contrato_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function software_eventos_private.derivar_ajuste_ipc() from public, anon, authenticated, service_role;
create trigger a_derivar_ajuste_ipc before insert or update on public.evento_servicios
  for each row execute function software_eventos_private.derivar_ajuste_ipc();
create trigger a_derivar_ajuste_ipc before insert or update on public.catering_contratos
  for each row execute function software_eventos_private.derivar_ajuste_ipc();
alter table public.evento_servicios
  alter column total_con_iva set expression as (
    coalesce(precio_base, 0) + coalesce(adicionales_monto, 0)
    + coalesce(iva_base_imponible, 0) * coalesce(iva_porcentaje, 0) + ajuste_ipc
  ),
  alter column saldo_pendiente set expression as (
    coalesce(precio_base, 0) + coalesce(adicionales_monto, 0)
    + coalesce(iva_base_imponible, 0) * coalesce(iva_porcentaje, 0) + ajuste_ipc - coalesce(total_pagado, 0)
  );

create or replace function software_eventos_private.catering_costos(c public.catering_contratos, p_dia date)
returns table (pax_subtotal numeric, extras numeric, subtotal numeric, iva numeric, iva_comision numeric,
  total_sin_iva numeric, total_con_iva numeric, ajuste_cobertura numeric)
language sql stable security invoker set search_path = ''
begin atomic
  with tarifas as (
    select round(sum(coalesce(t.precio_base, 0) * t.pax), 2) as pax_subtotal,
      sum(t.adicional_unitario * t.pax) as adicionales_pax,
      round(sum((coalesce(t.precio_base, 0) + t.adicional_unitario) *
        (t.pax - least(greatest(t.pax, 0), t.cubiertos))), 2) as pax_pendiente,
      sum(t.cobertura_ars) as cobertura
    from software_eventos_private.catering_tarifas(c, p_dia) t
  ), costos as (
    select t.*, f.fijos + t.adicionales_pax as extras,
      t.pax_subtotal + f.fijos + t.adicionales_pax as subtotal,
      t.pax_pendiente + f.fijos as pendiente,
      coalesce(c.iva_porcentaje, 0) as tasa,
      coalesce(c.comision_organizador_monto, 0) as comision,
      round(coalesce(c.comision_organizador_monto, 0) * coalesce(c.iva_comision, 0), 2) as iva_comision
    from tarifas t
    cross join lateral (
      select round(coalesce(sum(i.precio_unitario), 0), 2) as fijos
      from public.catering_items i where i.catering_contrato_id = c.id and i.categorias_pax is null
    ) f
  )
  select k.pax_subtotal, k.extras, k.subtotal, round(k.subtotal * k.tasa, 2), k.iva_comision,
    k.subtotal + k.comision, k.subtotal + round(k.subtotal * k.tasa, 2) + k.comision + k.iva_comision + c.ajuste_ipc,
    k.pendiente + round(k.pendiente * k.tasa, 2) + k.cobertura - k.subtotal - round(k.subtotal * k.tasa, 2)
  from costos k;
end;


create or replace view public.v_evento_servicios_acreditados with (security_invoker = true) as
select s.id, s.evento_id, s.servicio_id, s.precio_base, s.adicionales_monto,
  iva.porcentaje as iva_porcentaje, s.proveedor, a.cobrado as total_pagado,
  round(t.total - a.cobrado, 2) as saldo_pendiente,
  s.notas, s.created_at, s.updated_at, iva.base as iva_base_imponible,
  s.total_sin_iva, t.total as total_con_iva, s.comisiona_organizador, s.ajuste_ipc
from public.evento_servicios s
cross join lateral software_eventos_private.cobros_acreditados(s.id, null, software_eventos_private.dia_argentina()) a
cross join lateral (
  select case when a.incluye_cheque and a.cobrado is distinct from s.total_pagado then least(s.total_sin_iva, greatest(s.iva_base_imponible, a.neto_no_efectivo))
    else s.iva_base_imponible end as base,
  case when a.incluye_cheque and a.cobrado is distinct from s.total_pagado then 0.21 else s.iva_porcentaje end as porcentaje
) iva
cross join lateral (select s.total_sin_iva + iva.base * coalesce(iva.porcentaje, 0) + s.ajuste_ipc as total) t;


create or replace view public.v_catering_acreditado with (security_invoker = true) as
select c.id, c.evento_id, c.ejecutiva_id, c.tipo_servicio, c.pax_comida, c.pax_post_postre, c.pax_final,
  c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes, c.precio_cierre_alimentos_sin_iva,
  c.precio_cierre_bebidas_sin_iva, c.iva_porcentaje, c.comision_organizador_monto, c.iva_comision,
  c.emite_factura, c.monto_con_factura, c.monto_sin_factura, c.factura_concepto, c.factura_razon_social,
  c.factura_cuit, c.factura_direccion, c.factura_contacto_admin, c.total_sin_iva, c.total_con_iva,
  a.cobrado as total_pagado, round(c.total_con_iva + k.ajuste_cobertura - a.cobrado, 2) as saldo_pendiente,
  c.notas, c.deleted_at, c.created_at, c.updated_at, c.cliente_nombre, c.cliente_razon_social,
  c.cliente_cuit_dni, c.cliente_contacto, c.fecha_evento, c.salon_id, c.tipo_evento, c.lugar_evento,
  k.ajuste_cobertura, k.extras as total_adicionales, c.ajuste_ipc
from public.catering_contratos c
cross join lateral software_eventos_private.dia_argentina() dia
cross join lateral software_eventos_private.cobros_acreditados(null, c.id, dia) a
cross join lateral software_eventos_private.catering_costos(c, dia) k;


CREATE OR REPLACE FUNCTION public.validar_catering_contrato_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Cron has no JWT. Only an update of DB-derived totals may use this path.
  if tg_op = 'UPDATE' and auth.uid() is null
    and (to_jsonb(new) - array['total_pagado', 'saldo_pendiente', 'total_sin_iva', 'total_con_iva', 'updated_at', 'ajuste_ipc'])
      = (to_jsonb(old) - array['total_pagado', 'saldo_pendiente', 'total_sin_iva', 'total_con_iva', 'updated_at', 'ajuste_ipc']) then
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


-- One calculation shared by preview and execution. Cheque dates are evaluated
-- using the requested effective date, never the index's month.
create function software_eventos_private.ipc_bases(p_dia date)
returns table (evento_id uuid, evento_servicio_id uuid, catering_contrato_id uuid, saldo_anterior numeric)
language sql stable security invoker set search_path = '' as $$
  select e.id, s.id, null::uuid, greatest(round(s.total_sin_iva + s.ajuste_ipc
    + (case when a.incluye_cheque and a.cobrado is distinct from s.total_pagado
      then least(s.total_sin_iva, greatest(s.iva_base_imponible, a.neto_no_efectivo))
      else s.iva_base_imponible end) *
      (case when a.incluye_cheque and a.cobrado is distinct from s.total_pagado then 0.21 else coalesce(s.iva_porcentaje, 0) end)
    - a.cobrado, 2), 0)
  from public.eventos e join public.evento_servicios s on s.evento_id = e.id
  cross join lateral software_eventos_private.cobros_acreditados(s.id, null, p_dia) a
  where e.deleted_at is null and e.estado = 'confirmado' and e.fecha_evento >= p_dia
  union all
  select e.id, null::uuid, c.id, greatest(round(c.total_con_iva + k.ajuste_cobertura - a.cobrado, 2), 0)
  from public.eventos e join public.catering_contratos c on c.evento_id = e.id and c.deleted_at is null
  cross join lateral software_eventos_private.cobros_acreditados(null, c.id, p_dia) a
  cross join lateral software_eventos_private.catering_costos(c, p_dia) k
  where e.deleted_at is null and e.estado = 'confirmado' and e.fecha_evento >= p_dia
$$;
revoke all on function software_eventos_private.ipc_bases(date) from public, anon, authenticated, service_role;

create function public.previsualizar_ipc_programado(p_periodo date, p_fecha_vigencia date, p_variacion_porcentual numeric default null)
returns table (evento_id uuid, evento_servicio_id uuid, catering_contrato_id uuid,
  saldo_anterior numeric, incremento numeric, saldo_proyectado numeric, evento_nombre text, destino_nombre text)
language plpgsql security definer set search_path = '' as $$
declare v numeric;
begin
  if auth.uid() is null or not public.current_user_is_active_admin() then
    raise exception 'Solo un administrador activo puede previsualizar IPC' using errcode = '42501';
  end if;
  if p_periodo is null or not isfinite(p_periodo) or p_periodo <> date_trunc('month', p_periodo::timestamp)::date
    or p_fecha_vigencia is null or not isfinite(p_fecha_vigencia) or p_fecha_vigencia < software_eventos_private.dia_argentina() then
    raise exception 'Periodo o vigencia invalidos' using errcode = '22023';
  end if;
  select coalesce(p_variacion_porcentual, i.variacion_porcentual) into v
  from (select 1) seed left join public.ipc_indices i on i.periodo = p_periodo;
  if exists (select 1 from public.ipc_indices idx where idx.periodo = p_periodo
    and p_variacion_porcentual is not null and idx.variacion_porcentual <> p_variacion_porcentual) then
    raise exception 'El indice registrado es inmutable' using errcode = '23505';
  end if;
  if v is null then
    raise exception 'Falta cargar el indice para el periodo' using errcode = 'P0002';
  end if;
  if not (v > -100 and v < 100000000) or v <> round(v, 4) then
    raise exception 'Variacion invalida' using errcode = '22023';
  end if;
  return query select b.*, round(b.saldo_anterior * v / 100, 2),
    b.saldo_anterior + round(b.saldo_anterior * v / 100, 2),
    coalesce(e.nombre_evento, e.cliente_nombre), coalesce(sc.nombre, c.tipo_servicio, 'Catering')
  from software_eventos_private.ipc_bases(p_fecha_vigencia) b
  join public.eventos e on e.id = b.evento_id
  left join public.evento_servicios es on es.id = b.evento_servicio_id
  left join public.servicios_catalogo sc on sc.id = es.servicio_id
  left join public.catering_contratos c on c.id = b.catering_contrato_id
  order by e.id, es.id, c.id;
end;
$$;
revoke all on function public.previsualizar_ipc_programado(date,date,numeric) from public, anon, authenticated, service_role;
grant execute on function public.previsualizar_ipc_programado(date,date,numeric) to authenticated;

create function public.programar_ipc(p_periodo date, p_fecha_vigencia date, p_variacion_porcentual numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare s public.ipc_programaciones; indice public.ipc_indices;
begin
  if auth.uid() is null or not public.current_user_is_active_admin() then
    raise exception 'Solo un administrador activo puede programar IPC' using errcode = '42501';
  end if;
  if p_periodo is null or not isfinite(p_periodo) or p_periodo <> date_trunc('month', p_periodo::timestamp)::date
    or p_fecha_vigencia is null or not isfinite(p_fecha_vigencia)
    or (p_variacion_porcentual is not null and
      (not (p_variacion_porcentual > -100 and p_variacion_porcentual < 100000000)
        or p_variacion_porcentual <> round(p_variacion_porcentual, 4))) then
    raise exception 'Periodo, vigencia o variacion invalidos' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(843220761);
  select * into s from public.ipc_programaciones where periodo = p_periodo for update;
  select * into indice from public.ipc_indices where periodo = p_periodo;
  if s.estado = 'aplicado' then
    if s.fecha_vigencia = p_fecha_vigencia and (p_variacion_porcentual is null or p_variacion_porcentual = indice.variacion_porcentual) then
      return s.id;
    end if;
    raise exception 'El periodo ya fue aplicado' using errcode = '23505';
  end if;
  if p_fecha_vigencia < software_eventos_private.dia_argentina() then
    raise exception 'No se permite retrodatacion' using errcode = '22023';
  end if;
  if (indice.id is not null and s.id is null)
    or exists (select 1 from public.actualizaciones_ipc a where a.ipc_indice_id = indice.id) then
    raise exception 'El periodo tiene aplicaciones historicas' using errcode = '23505';
  end if;
  if indice.id is not null and p_variacion_porcentual is not null and indice.variacion_porcentual <> p_variacion_porcentual then
    raise exception 'El indice registrado es inmutable' using errcode = '23505';
  end if;
  if indice.id is null and p_variacion_porcentual is not null then
    insert into public.ipc_indices(periodo, variacion_porcentual, usuario_id)
      values (p_periodo, p_variacion_porcentual, auth.uid());
  end if;
  insert into public.ipc_programaciones(periodo, fecha_vigencia, usuario_id)
    values (p_periodo, p_fecha_vigencia, auth.uid())
  on conflict (periodo) do update set fecha_vigencia = excluded.fecha_vigencia,
    usuario_id = excluded.usuario_id, estado = 'pendiente', motivo = null
  returning id into s.id;
  return s.id;
end;
$$;
revoke all on function public.programar_ipc(date,date,numeric) from public, anon, authenticated, service_role;
grant execute on function public.programar_ipc(date,date,numeric) to authenticated;

-- Owner-only worker. No client-supplied actor, effective date or base is trusted.
create function software_eventos_private.ejecutar_ipc_programados()
returns void language plpgsql security invoker set search_path = '' set lock_timeout = '5s' as $$
declare s public.ipc_programaciones; i public.ipc_indices; b record;
  dia date := software_eventos_private.dia_argentina();
  delta numeric;
begin
  perform pg_advisory_xact_lock(843220761);
  for s in select * from public.ipc_programaciones where estado <> 'aplicado'
    and fecha_vigencia <= dia order by fecha_vigencia, periodo for update
  loop
    if s.fecha_vigencia < dia then
      update public.ipc_programaciones set estado = 'revision',
        motivo = 'Vigencia vencida: no hay snapshot historico completo. Requiere conciliacion o reprogramacion explicita.'
      where id = s.id and estado <> 'revision';
      continue;
    end if;
    select * into i from public.ipc_indices where periodo = s.periodo;
    if i.id is null then
      update public.ipc_programaciones set estado = 'sin_indice', motivo = 'Falta cargar el indice del periodo.'
      where id = s.id and estado <> 'sin_indice';
      continue;
    end if;
    begin
      -- Serialize with payment, PAX and event edits; a short lock timeout retries next minute.
      lock table public.eventos, public.evento_servicios, public.catering_contratos,
        public.pagos, public.pago_imputaciones, public.catering_coberturas,
        public.catering_precio_historial, public.catering_items in share row exclusive mode;
      if software_eventos_private.dia_argentina(clock_timestamp()) <> dia then
        raise exception 'Cambio el dia durante la espera' using errcode = '22023';
      end if;
      perform software_eventos_private.sincronizar_cheques();
      for b in select * from software_eventos_private.ipc_bases(dia)
        order by evento_id, evento_servicio_id, catering_contrato_id
      loop
        delta := round(b.saldo_anterior * i.variacion_porcentual / 100, 2);
        insert into public.ipc_aplicaciones(programacion_id, ipc_indice_id, evento_servicio_id,
          catering_contrato_id, fecha_efectiva, porcentaje, base_ajustada, incremento, saldo_resultante)
        values (s.id, i.id, b.evento_servicio_id, b.catering_contrato_id, dia,
          i.variacion_porcentual, b.saldo_anterior, delta, b.saldo_anterior + delta);
        if b.evento_servicio_id is not null then
          update public.evento_servicios set ajuste_ipc = ajuste_ipc where id = b.evento_servicio_id;
        else
          update public.catering_contratos set ajuste_ipc = ajuste_ipc where id = b.catering_contrato_id;
        end if;
      end loop;
      if software_eventos_private.dia_argentina(clock_timestamp()) <> dia then
        raise exception 'Cambio el dia durante la ejecucion' using errcode = '22023';
      end if;
      update public.ipc_programaciones set estado = 'aplicado', motivo = null, ejecutado_at = statement_timestamp()
      where id = s.id;
    exception when others then
      -- The subtransaction rolls back cheque synchronization, all targets and the ledger together.
      update public.ipc_programaciones set estado = case when software_eventos_private.dia_argentina(clock_timestamp()) > s.fecha_vigencia then 'revision' else 'error' end,
        motivo = case when software_eventos_private.dia_argentina(clock_timestamp()) > s.fecha_vigencia
          then 'Vigencia vencida durante la ejecucion: no hay snapshot historico completo. Requiere revision.'
          else 'No se aplico ningun ajuste. Error SQL ' || sqlstate || '; se reintentara durante la vigencia.' end
      where id = s.id;
    end;
  end loop;
end;
$$;
revoke all on function software_eventos_private.ejecutar_ipc_programados() from public, anon, authenticated, service_role;

-- An old deployment must not bypass scheduling with the previous immediate RPC.
create or replace function public.registrar_y_aplicar_ipc(p_periodo date, p_variacion_porcentual numeric)
returns table (ipc_indice_id uuid, cantidad_servicios bigint, cantidad_eventos bigint,
  monto_precio_base_anterior numeric, monto_precio_base_actualizado numeric,
  monto_total_con_iva_anterior numeric, monto_total_con_iva_actualizado numeric)
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'El IPC ahora requiere fecha de vigencia. Actualice el frontend.' using errcode = '0A000';
end;
$$;

create view public.v_ipc_programaciones with (security_invoker = true) as
select s.*, i.variacion_porcentual, count(a.id) as cantidad_destinos,
  coalesce(sum(a.base_ajustada), 0) as base_ajustada,
  coalesce(sum(a.incremento), 0) as incremento,
  coalesce(sum(a.saldo_resultante), 0) as saldo_resultante
from public.ipc_programaciones s
left join public.ipc_indices i on i.periodo = s.periodo
left join public.ipc_aplicaciones a on a.programacion_id = s.id
group by s.id, i.variacion_porcentual;
revoke all on public.v_ipc_programaciones from public, anon, authenticated, service_role;
grant select on public.v_ipc_programaciones to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
