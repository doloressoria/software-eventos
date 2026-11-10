-- IPC baseline inspected read-only on 2026-11-10. Used only in the temporary test cluster.
create table public.ipc_indices (
  id uuid default gen_random_uuid() not null,
  periodo date not null,
  variacion_porcentual numeric(12,4) not null,
  usuario_id uuid not null,
  created_at timestamp with time zone default now() not null
);
create table public.actualizaciones_ipc (
  id uuid default gen_random_uuid() not null,
  evento_servicio_id uuid not null,
  tipo public.tipo_actualizacion default 'ipc'::tipo_actualizacion not null,
  valor_inicial numeric(12,2) not null,
  fecha_inicio date not null,
  indec_mes_anterior numeric(12,4),
  indec_mes_ajuste numeric(12,4),
  porcentaje_aplicado numeric(8,4),
  valor_ajustado numeric(12,2) not null,
  fecha_ajuste date not null,
  usuario_id uuid,
  created_at timestamp with time zone default now() not null,
  ipc_indice_id uuid
);
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_pkey PRIMARY KEY (id);
alter table public.ipc_indices add constraint ipc_indices_pkey PRIMARY KEY (id);
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_indec_mes_ajuste_nonnegative CHECK (((indec_mes_ajuste IS NULL) OR (indec_mes_ajuste >= (0)::numeric)));
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_indec_mes_anterior_nonnegative CHECK (((indec_mes_anterior IS NULL) OR (indec_mes_anterior >= (0)::numeric)));
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_porcentaje_aplicado_valido_check CHECK (((porcentaje_aplicado IS NULL) OR ((porcentaje_aplicado <> 'NaN'::numeric) AND (porcentaje_aplicado > ('-100'::integer)::numeric))));
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_porcentaje_nonnegative CHECK (((porcentaje_aplicado IS NULL) OR (porcentaje_aplicado >= (0)::numeric)));
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_valor_ajustado_nonnegative CHECK ((valor_ajustado >= (0)::numeric));
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_valor_inicial_nonnegative CHECK ((valor_inicial >= (0)::numeric));
alter table public.ipc_indices add constraint ipc_indices_periodo_key UNIQUE (periodo);
alter table public.ipc_indices add constraint ipc_indices_periodo_primer_dia_check CHECK ((periodo = (date_trunc('month'::text, (periodo)::timestamp without time zone))::date));
alter table public.ipc_indices add constraint ipc_indices_variacion_valida_check CHECK (((variacion_porcentual <> 'NaN'::numeric) AND (variacion_porcentual > ('-100'::integer)::numeric)));
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_evento_servicio_id_fkey FOREIGN KEY (evento_servicio_id) REFERENCES evento_servicios(id) ON DELETE CASCADE;
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_ipc_indice_id_fkey FOREIGN KEY (ipc_indice_id) REFERENCES ipc_indices(id) ON DELETE RESTRICT;
alter table public.actualizaciones_ipc add constraint actualizaciones_ipc_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
alter table public.ipc_indices add constraint ipc_indices_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
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

CREATE OR REPLACE FUNCTION public.registrar_y_aplicar_ipc(p_periodo date, p_variacion_porcentual numeric)
 RETURNS TABLE(ipc_indice_id uuid, cantidad_servicios bigint, cantidad_eventos bigint, monto_precio_base_anterior numeric, monto_precio_base_actualizado numeric, monto_total_con_iva_anterior numeric, monto_total_con_iva_actualizado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_periodo date;
  v_ultimo_periodo date;
  v_ipc_indice_id uuid;
begin
  if auth.uid() is null
    or not public.current_user_is_active_admin() then
    raise exception 'Solo los administradores activos pueden aplicar un IPC.'
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

  -- Evita que dos aplicaciones concurrentes alteren el orden mensual.
  perform pg_advisory_xact_lock(843220761);

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

  begin
    insert into public.ipc_indices (
      periodo,
      variacion_porcentual,
      usuario_id
    )
    values (
      v_periodo,
      p_variacion_porcentual,
      auth.uid()
    )
    returning id into v_ipc_indice_id;
  exception
    when unique_violation then
      raise exception 'Ya existe un IPC registrado para este periodo.'
        using errcode = '23505',
          constraint = 'ipc_indices_periodo_key';
  end;

  return query
  with elegibles as materialized (
    select
      evento_servicio.id,
      evento_servicio.evento_id,
      coalesce(evento_servicio.precio_base, 0)::numeric as precio_base_anterior,
      coalesce(evento_servicio.adicionales_monto, 0)::numeric as adicionales_monto,
      coalesce(evento_servicio.iva_base_imponible, 0)::numeric as iva_base_imponible,
      coalesce(evento_servicio.iva_porcentaje, 0)::numeric as iva_porcentaje,
      coalesce(evento_servicio.total_pagado, 0)::numeric as total_pagado,
      totales.total_con_iva as total_con_iva_anterior
    from public.evento_servicios evento_servicio
    join public.eventos evento
      on evento.id = evento_servicio.evento_id
    cross join lateral public.calcular_totales_evento_servicio(
      evento_servicio.precio_base,
      evento_servicio.adicionales_monto,
      evento_servicio.iva_base_imponible,
      evento_servicio.iva_porcentaje,
      evento_servicio.total_pagado
    ) totales
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
    for update of evento_servicio
  ),
  actualizados as (
    update public.evento_servicios evento_servicio
    set
      precio_base = round(
        elegibles.precio_base_anterior
          * (1 + p_variacion_porcentual / 100),
        2
      ),
      updated_at = now()
    from elegibles
    where evento_servicio.id = elegibles.id
    returning
      evento_servicio.id,
      elegibles.evento_id,
      elegibles.precio_base_anterior,
      evento_servicio.precio_base::numeric as precio_base_actualizado,
      elegibles.total_con_iva_anterior,
      evento_servicio.total_con_iva::numeric as total_con_iva_actualizado
  ),
  aplicaciones as (
    insert into public.actualizaciones_ipc (
      evento_servicio_id,
      ipc_indice_id,
      valor_inicial,
      fecha_inicio,
      indec_mes_anterior,
      indec_mes_ajuste,
      porcentaje_aplicado,
      valor_ajustado,
      fecha_ajuste,
      tipo,
      usuario_id
    )
    select
      actualizados.id,
      v_ipc_indice_id,
      actualizados.precio_base_anterior,
      v_periodo,
      null,
      null,
      p_variacion_porcentual,
      actualizados.precio_base_actualizado,
      timezone('America/Argentina/Buenos_Aires', now())::date,
      'ipc'::public.tipo_actualizacion,
      auth.uid()
    from actualizados
    returning evento_servicio_id
  )
  select
    v_ipc_indice_id,
    count(*)::bigint,
    count(distinct actualizados.evento_id)::bigint,
    coalesce(sum(actualizados.precio_base_anterior), 0)::numeric,
    coalesce(sum(actualizados.precio_base_actualizado), 0)::numeric,
    coalesce(sum(actualizados.total_con_iva_anterior), 0)::numeric,
    coalesce(sum(actualizados.total_con_iva_actualizado), 0)::numeric
  from actualizados;
end;
$function$
;
alter table public.ipc_indices enable row level security;
create policy ipc_admin on public.ipc_indices for select to authenticated using (public.current_user_is_active_admin());
grant select on public.ipc_indices to authenticated;
create trigger audit_row_change after insert or update on public.actualizaciones_ipc for each row execute function public.audit_row_change();
alter table public.actualizaciones_ipc enable row level security;
grant select on public.actualizaciones_ipc to authenticated;
create policy actualizaciones_ipc_select_assigned on public.actualizaciones_ipc for select to authenticated
using (public.current_user_is_active() and (public.is_admin() or public.usuario_tiene_evento_servicio(evento_servicio_id)));
