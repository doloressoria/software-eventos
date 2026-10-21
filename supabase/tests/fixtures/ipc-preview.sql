-- Catálogo consultado por SELECT el 2026-10-21; sólo fixture, no migración.
-- La RPC de preview sólo lee periodo; no se simula la aplicación de IPC.
create table public.ipc_indices (periodo date);
CREATE OR REPLACE FUNCTION public.previsualizar_actualizacion_ipc(p_periodo date, p_variacion_porcentual numeric)
 RETURNS TABLE(cantidad_servicios bigint, cantidad_eventos bigint, monto_precio_base_anterior numeric, monto_precio_base_proyectado numeric, monto_total_con_iva_anterior numeric, monto_total_con_iva_proyectado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_periodo date;
  v_ultimo_periodo date;
begin
  if auth.uid() is null
    or not public.current_user_is_active_admin() then
    raise exception 'Solo los administradores activos pueden previsualizar un IPC.'
      using errcode = '42501';
  end if;

  if p_periodo is null
    or p_variacion_porcentual is null
    or p_variacion_porcentual = 'NaN'::numeric
    or p_variacion_porcentual <= -100 then
    raise exception 'El periodo y la variacion porcentual son invalidos.'
      using errcode = '22023';
  end if;

  v_periodo := date_trunc('month', p_periodo::timestamp)::date;

  if exists (
    select 1
    from public.ipc_indices
    where periodo = v_periodo
  ) then
    raise exception 'Ya existe un IPC registrado para este periodo.'
      using errcode = '23505',
        constraint = 'ipc_indices_periodo_key';
  end if;

  select max(periodo)
  into v_ultimo_periodo
  from public.ipc_indices;

  if v_ultimo_periodo is not null
    and v_periodo < v_ultimo_periodo then
    raise exception
      'No se puede aplicar un IPC de un periodo anterior al ultimo IPC registrado (%).',
      to_char(v_ultimo_periodo, 'YYYY-MM')
      using errcode = '22023';
  end if;

  return query
  with elegibles as materialized (
    select
      evento_servicio.id,
      evento_servicio.evento_id,
      coalesce(evento_servicio.precio_base, 0)::numeric as precio_base,
      coalesce(evento_servicio.adicionales_monto, 0)::numeric as adicionales_monto,
      coalesce(evento_servicio.iva_base_imponible, 0)::numeric as iva_base_imponible,
      coalesce(evento_servicio.iva_porcentaje, 0)::numeric as iva_porcentaje,
      coalesce(evento_servicio.total_pagado, 0)::numeric as total_pagado
    from public.evento_servicios evento_servicio
    join public.eventos evento
      on evento.id = evento_servicio.evento_id
    where evento.deleted_at is null
      and evento.estado = 'confirmado'::public.estado_evento
      and evento.fecha_evento >= timezone(
        'America/Argentina/Buenos_Aires',
        now()
      )::date
      and not exists (
        select 1
        from public.pagos pago
        where pago.evento_servicio_id = evento_servicio.id
          and pago.deleted_at is null
          and pago.es_garantia is not true
      )
  ),
  proyectados as (
    select
      elegibles.*,
      actuales.total_con_iva as total_con_iva_anterior,
      round(
        elegibles.precio_base
          * (1 + p_variacion_porcentual / 100),
        2
      ) as precio_base_proyectado,
      nuevos.total_con_iva as total_con_iva_proyectado
    from elegibles
    cross join lateral public.calcular_totales_evento_servicio(
      elegibles.precio_base,
      elegibles.adicionales_monto,
      elegibles.iva_base_imponible,
      elegibles.iva_porcentaje,
      elegibles.total_pagado
    ) actuales
    cross join lateral public.calcular_totales_evento_servicio(
      round(
        elegibles.precio_base
          * (1 + p_variacion_porcentual / 100),
        2
      ),
      elegibles.adicionales_monto,
      elegibles.iva_base_imponible,
      elegibles.iva_porcentaje,
      elegibles.total_pagado
    ) nuevos
  )
  select
    count(*)::bigint,
    count(distinct evento_id)::bigint,
    coalesce(sum(precio_base), 0)::numeric,
    coalesce(sum(precio_base_proyectado), 0)::numeric,
    coalesce(sum(total_con_iva_anterior), 0)::numeric,
    coalesce(sum(total_con_iva_proyectado), 0)::numeric
  from proyectados;
end;
$function$

;
