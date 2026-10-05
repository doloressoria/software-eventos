alter table public.catering_contratos
  add column lugar_evento text;

create function public.validar_lugar_catering_externo()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.evento_id is null and nullif(btrim(new.lugar_evento), '') is null then
    raise exception 'El lugar es obligatorio para un catering externo';
  end if;
  return new;
end;
$$;

create trigger validar_lugar_catering_externo_insert
  before insert on public.catering_contratos
  for each row execute function public.validar_lugar_catering_externo();

-- Keep the existing search function unchanged for callers outside this app.
create function public.catering_buscar_eventos_detalle(
  p_query text default null,
  p_evento_id uuid default null
)
returns table (
  id uuid,
  cliente_nombre text,
  fecha_evento date,
  salon_id uuid,
  salon_nombre text,
  tipo_evento text,
  pax_adultos integer,
  pax_jovenes integer,
  pax_menores integer,
  pax_bebes integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id, e.cliente_nombre, e.fecha_evento, e.salon_id,
    s.nombre, e.tipo_evento, e.pax_adultos, e.pax_jovenes,
    e.pax_menores, e.pax_bebes
  from public.eventos e
  join public.salones s on s.id = e.salon_id
  where e.deleted_at is null
    and public.current_user_is_active()
    and (
      public.current_user_is_active_admin()
      or public.usuario_tiene_evento(e.id)
    )
    and (
      (p_evento_id is not null and e.id = p_evento_id)
      or (
        p_evento_id is null
        and (
          p_query is null or length(trim(p_query)) = 0
          or e.cliente_nombre ilike '%' || p_query || '%'
          or e.nombre_evento ilike '%' || p_query || '%'
          or s.nombre ilike '%' || p_query || '%'
        )
      )
    )
  order by e.fecha_evento desc
  limit 20;
$$;

revoke all on function public.catering_buscar_eventos_detalle(text, uuid) from public, anon;
grant execute on function public.catering_buscar_eventos_detalle(text, uuid) to authenticated;

-- Executives with report access need the full Kiria portfolio, while their
-- ordinary catering access remains limited to their own contracts.
create policy catering_externo_reportes_ejecutiva
  on public.catering_contratos for select to authenticated
  using (
    evento_id is null and deleted_at is null
    and public.current_user_has_screen_permission(array['reportes'], false)
    and exists (
      select 1 from public.usuarios u
      where u.id = (select auth.uid()) and u.rol = 'ejecutiva_catering' and u.activo
    )
  );

create policy pagos_externos_reportes_ejecutiva
  on public.pagos for select to authenticated
  using (
    catering_contrato_id is not null and deleted_at is null
    and public.current_user_has_screen_permission(array['reportes'], false)
    and exists (
      select 1 from public.usuarios u
      where u.id = (select auth.uid()) and u.rol = 'ejecutiva_catering' and u.activo
    )
    and exists (
      select 1 from public.catering_contratos cc
      where cc.id = catering_contrato_id and cc.evento_id is null and cc.deleted_at is null
    )
  );

create policy egresos_externos_reportes_ejecutiva
  on public.egresos for select to authenticated
  using (
    catering_contrato_id is not null and deleted_at is null
    and public.current_user_has_screen_permission(array['reportes'], false)
    and exists (
      select 1 from public.usuarios u
      where u.id = (select auth.uid()) and u.rol = 'ejecutiva_catering' and u.activo
    )
    and exists (
      select 1 from public.catering_contratos cc
      where cc.id = catering_contrato_id and cc.evento_id is null and cc.deleted_at is null
    )
  );

-- Existing permissive screen policies are OR-ed together. Restrictive policies
-- keep sellers inside their assigned venues, including direct Data API reads.
create policy eventos_vendedor_salon_restrict
  on public.eventos as restrictive for select to authenticated
  using (
    public.current_user_is_active()
    and (not public.current_user_is_vendedor_active() or public.usuario_tiene_evento(id))
  );

create policy catering_vendedor_salon_restrict
  on public.catering_contratos as restrictive for select to authenticated
  using (
    public.current_user_is_active()
    and (not public.current_user_is_vendedor_active()
      or (evento_id is not null and public.usuario_tiene_evento(evento_id)))
  );

create policy pagos_vendedor_salon_restrict
  on public.pagos as restrictive for select to authenticated
  using (
    public.current_user_is_active()
    and (not public.current_user_is_vendedor_active()
      or (evento_id is not null and public.usuario_tiene_evento(evento_id)))
  );

create policy egresos_vendedor_salon_restrict
  on public.egresos as restrictive for select to authenticated
  using (
    public.current_user_is_active()
    and (not public.current_user_is_vendedor_active()
      or (evento_id is not null and public.usuario_tiene_evento(evento_id)))
  );
