begin;
set local lock_timeout = '5s';

-- Existing contracts and old clients keep the historical calculation. No balance backfill.
alter table public.catering_contratos
  add column porcentaje_facturado numeric(5,2) not null default 100
    check (porcentaje_facturado between 0 and 100),
  add column version_calculo smallint not null default 1 check (version_calculo in (1,2));

create table public.catering_cobro_componentes (
  pago_id uuid not null references public.pagos(id),
  catering_contrato_id uuid not null references public.catering_contratos(id),
  version_calculo smallint not null check (version_calculo in (1,2)),
  explicito boolean not null default true,
  objetivo_ars numeric(12,2) not null check (objetivo_ars > 0 and objetivo_ars < 'Infinity'::numeric),
  capital_ars numeric(12,2),
  iva_ars numeric(12,2),
  ajuste_ars numeric(12,2) not null default 0,
  ajuste_iva_ars numeric(12,2) not null default 0,
  capital_reasignado_ars numeric(12,2) not null default 0 check (capital_reasignado_ars >= 0),
  primary key (pago_id, catering_contrato_id),
  check (case when version_calculo = 1 then capital_ars is null and iva_ars is null and ajuste_iva_ars = 0
    else capital_ars is not null and iva_ars is not null and capital_ars >= 0 and iva_ars >= 0
      and capital_ars + iva_ars = objetivo_ars and iva_ars - ajuste_iva_ars >= 0
      and capital_ars - (ajuste_ars - ajuste_iva_ars) >= capital_reasignado_ars end)
);
create index catering_cobro_componentes_contrato_idx on public.catering_cobro_componentes(catering_contrato_id);
alter table public.catering_cobro_componentes enable row level security;
revoke all on public.catering_cobro_componentes from public, anon, authenticated, service_role;
grant select on public.catering_cobro_componentes to anon, authenticated, service_role;
create policy componentes_select on public.catering_cobro_componentes for select to authenticated
using (public.current_user_has_screen_permission(array['eventos','catering','pagos','reportes'], false)
  and exists (select 1 from public.catering_contratos c where c.id = catering_contrato_id and c.deleted_at is null)
  and (exists (select 1 from public.pagos p where p.id = pago_id)
    or exists (select 1 from public.v_pago_imputaciones i
      where i.pago_id = catering_cobro_componentes.pago_id and i.catering_contrato_id = catering_cobro_componentes.catering_contrato_id)));
create trigger audit_row_change after insert or update or delete on public.catering_cobro_componentes
  for each row execute function public.audit_row_change('pago_id,catering_contrato_id');

create function software_eventos_private.catering_validar_modelo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.version_calculo is distinct from old.version_calculo and (
    new.version_calculo <> 2 or exists (select 1 from public.pagos p
      where not p.es_garantia and (p.catering_contrato_id = old.id
        or exists (select 1 from public.pago_imputaciones i where i.pago_id = p.id and i.catering_contrato_id = old.id)))
    or exists (select 1 from public.catering_coberturas x where x.catering_contrato_id = old.id)
  ) then
    raise exception 'El historial requiere conciliación; no se puede cambiar el modelo' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function software_eventos_private.catering_validar_modelo() from public, anon, authenticated, service_role;
create trigger catering_validar_modelo before update on public.catering_contratos
  for each row execute function software_eventos_private.catering_validar_modelo();
create or replace function software_eventos_private.catering_tarifas(c public.catering_contratos, p_dia date)
returns table (categoria text, pax integer, precio_base numeric, adicional_unitario numeric, precio_aplicado numeric,
  cubiertos bigint, por_acreditar bigint, cobertura_ars numeric, tarifas_historicas bigint)
language sql stable security invoker set search_path = '' as $$
  with vigente as (
    select h.* from public.catering_precio_historial h where h.catering_contrato_id = c.id
    order by h.fecha desc, h.created_at desc, h.id desc limit 1
  ), cobertura as (
    select x.categoria,
      sum(x.cantidad - x.liberada) filter (where p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia) as cubiertos,
      sum(x.cantidad - x.liberada) filter (where p.forma_pago = 'cheque' and p.fecha_pago > p_dia) as por_acreditar,
      count(distinct x.precio_aplicado) filter (where p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia) as tarifas,
      sum((x.cantidad - x.liberada) * x.precio_aplicado)
        filter (where p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia) as importe
    from public.catering_coberturas x
    join public.v_pago_imputaciones p on p.pago_id = x.pago_id and p.catering_contrato_id = c.id
    where x.catering_contrato_id = c.id and p.deleted_at is null and not p.es_garantia and x.cantidad > x.liberada
    group by x.categoria
  )
  select v.categoria, coalesce(v.pax, 0), coalesce(v.precio, h.precio_unitario), a.importe,
    round((coalesce(v.precio, h.precio_unitario) + a.importe) * (1 + case when c.version_calculo = 1 then coalesce(c.iva_porcentaje, 0) * c.porcentaje_facturado / 100 else 0 end), 2),
    coalesce(x.cubiertos, 0), coalesce(x.por_acreditar, 0), coalesce(x.importe, 0), coalesce(x.tarifas, 0)
  from (select 1) seed
  left join vigente h on true
  cross join lateral (values
    ('adultos', c.pax_adultos, h.precio_adultos),
    ('jovenes', c.pax_jovenes, h.precio_jovenes),
    ('menores', c.pax_menores, h.precio_menores),
    ('bebes', c.pax_bebes, h.precio_bebes)
  ) v(categoria, pax, precio)
  cross join lateral (
    select coalesce(sum(i.precio_unitario), 0) as importe from public.catering_items i
    where i.catering_contrato_id = c.id and v.categoria = any(i.categorias_pax)
  ) a
  left join cobertura x on x.categoria = v.categoria
$$;


create function software_eventos_private.catering_fiscal(c public.catering_contratos, p_dia date)
returns table (neto_vigente numeric, neto_exigible numeric, base_imponible numeric, iva_calculado numeric,
  iva_exigible numeric, iva_cobrado numeric, iva_cancelado numeric, iva_reservado numeric,
  iva_pendiente numeric, ajuste_redondeo numeric, diferencia_reasignada numeric)
language sql stable security invoker set search_path = ''
begin atomic
  with importes as (
    select coalesce(sum((coalesce(t.precio_base,0) + t.adicional_unitario) * t.pax),0) as vigente,
      coalesce(sum((coalesce(t.precio_base,0) + t.adicional_unitario) * greatest(t.pax - t.cubiertos,0) + t.cobertura_ars),0) as exigible
    from software_eventos_private.catering_tarifas(c,p_dia) t
  ), cobrado as (
    select coalesce(sum(d.iva_ars - d.ajuste_iva_ars) filter (where p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia),0) as iva_real,
      coalesce(sum(d.iva_ars) filter (where p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia),0) as iva,
      coalesce(sum(d.iva_ars) filter (where p.forma_pago = 'cheque' and p.fecha_pago > p_dia),0) as reserva,
      coalesce(sum(d.ajuste_ars) filter (where p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia),0) as ajuste,
      coalesce(sum((select coalesce(sum(x.liberada * x.precio_aplicado),0) from public.catering_coberturas x
        where x.pago_id = d.pago_id and x.catering_contrato_id = c.id) - d.capital_reasignado_ars)
        filter (where p.forma_pago <> 'cheque' or p.fecha_pago <= p_dia),0) as diferencia
    from public.catering_cobro_componentes d join public.v_pago_imputaciones p on p.pago_id = d.pago_id and p.catering_contrato_id = c.id
    where d.catering_contrato_id = c.id and p.deleted_at is null and not p.es_garantia
  ), bases as (
    select i.vigente + f.importe as vigente,
      i.exigible + f.importe as exigible, a.*
    from importes i cross join cobrado a cross join lateral (
      select coalesce(sum(precio_unitario),0) as importe from public.catering_items
      where catering_contrato_id = c.id and categorias_pax is null
    ) f
  )
  select b.vigente, b.exigible, b.vigente * c.porcentaje_facturado / 100,
    round(b.vigente * c.porcentaje_facturado / 100 * coalesce(c.iva_porcentaje,0),2),
    round(b.exigible * c.porcentaje_facturado / 100 * coalesce(c.iva_porcentaje,0),2),
    b.iva_real, b.iva, b.reserva,
    round(b.exigible * c.porcentaje_facturado / 100 * coalesce(c.iva_porcentaje,0),2) - b.iva,
    b.ajuste, b.diferencia from bases b;
end;
revoke all on function software_eventos_private.catering_fiscal(public.catering_contratos,date) from public, anon, authenticated, service_role;
grant execute on function software_eventos_private.catering_fiscal(public.catering_contratos,date) to anon, authenticated, service_role;
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
      coalesce(c.iva_porcentaje, 0) * c.porcentaje_facturado / 100 as tasa,
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
    case when c.version_calculo = 1 then
      k.pendiente + round(k.pendiente * k.tasa, 2) + k.cobertura - k.subtotal - round(k.subtotal * k.tasa, 2)
        + f.diferencia_reasignada - f.ajuste_redondeo
    else f.neto_exigible + f.diferencia_reasignada - k.subtotal + f.iva_exigible - round(k.subtotal * k.tasa,2) - f.ajuste_redondeo end
  from costos k cross join lateral software_eventos_private.catering_fiscal(c,p_dia) f;
end;


create or replace view public.v_catering_tarifas with (security_invoker = true) as
select c.id as catering_contrato_id, c.evento_id, t.*,
  greatest(t.pax - t.cubiertos, 0) as pendientes,
  greatest(t.cubiertos - t.pax, 0) as excedente,
  round((coalesce(t.precio_base, 0) + t.adicional_unitario) * greatest(t.pax - t.cubiertos, 0)
    * (1 + case when c.version_calculo = 1 then coalesce(c.iva_porcentaje, 0) * c.porcentaje_facturado / 100 else 0 end), 2) as saldo_categoria,
  c.version_calculo
from public.catering_contratos c
cross join lateral software_eventos_private.catering_tarifas(c, software_eventos_private.dia_argentina()) t
where c.deleted_at is null;

create or replace view public.v_catering_acreditado with (security_invoker = true) as
select c.id, c.evento_id, c.ejecutiva_id, c.tipo_servicio, c.pax_comida, c.pax_post_postre, c.pax_final,
  c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes, c.precio_cierre_alimentos_sin_iva,
  c.precio_cierre_bebidas_sin_iva, c.iva_porcentaje, c.comision_organizador_monto, c.iva_comision,
  c.emite_factura, c.monto_con_factura, c.monto_sin_factura, c.factura_concepto, c.factura_razon_social,
  c.factura_cuit, c.factura_direccion, c.factura_contacto_admin, (case when c.version_calculo = 1 then c.total_sin_iva else k.total_sin_iva end)::numeric(12,2) as total_sin_iva,
  (case when c.version_calculo = 1 then c.total_con_iva else k.total_con_iva end)::numeric(12,2) as total_con_iva,
  a.cobrado as total_pagado, round((case when c.version_calculo = 1 then c.total_con_iva else k.total_con_iva end) + k.ajuste_cobertura - a.cobrado, 2) as saldo_pendiente,
  c.notas, c.deleted_at, c.created_at, c.updated_at, c.cliente_nombre, c.cliente_razon_social,
  c.cliente_cuit_dni, c.cliente_contacto, c.fecha_evento, c.salon_id, c.tipo_evento, c.lugar_evento,
  k.ajuste_cobertura, k.extras as total_adicionales, c.ajuste_ipc,
  c.porcentaje_facturado, c.version_calculo, f.neto_vigente, f.neto_exigible, f.base_imponible,
  f.iva_calculado, f.iva_exigible, f.iva_cobrado, f.iva_cancelado, f.iva_reservado, f.iva_pendiente,
  f.ajuste_redondeo
from public.catering_contratos c
cross join lateral software_eventos_private.dia_argentina() dia
cross join lateral software_eventos_private.cobros_acreditados(null, c.id, dia) a
cross join lateral software_eventos_private.catering_costos(c, dia) k
cross join lateral software_eventos_private.catering_fiscal(c, dia) f;


create or replace function public.crear_catering_con_precio(p_contrato jsonb, p_precio numeric, p_motivo text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare c public.catering_contratos; tarifas public.catering_precio_historial; created_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.current_user_has_screen_permission(array['catering'], true) then
    raise exception 'Sin permiso para gestionar catering' using errcode = '42501';
  end if;
  if p_precio is null or p_precio <= 0 or p_precio = 'NaN'::numeric then
    raise exception 'Precio inicial invalido' using errcode = '23514';
  end if;
  tarifas := jsonb_populate_record(null::public.catering_precio_historial, p_contrato);
  c := jsonb_populate_record(null::public.catering_contratos, p_contrato);
  insert into public.catering_contratos (
    id, evento_id, cliente_nombre, cliente_razon_social, cliente_cuit_dni, cliente_contacto,
    fecha_evento, lugar_evento, tipo_evento, tipo_servicio, ejecutiva_id,
    pax_adultos, pax_jovenes, pax_menores, pax_bebes,
    comision_organizador_monto, iva_comision, iva_porcentaje, notas, porcentaje_facturado, version_calculo
  ) values (
    created_id, c.evento_id, c.cliente_nombre, c.cliente_razon_social, c.cliente_cuit_dni, c.cliente_contacto,
    c.fecha_evento, c.lugar_evento, c.tipo_evento, c.tipo_servicio, c.ejecutiva_id,
    c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes,
    c.comision_organizador_monto, c.iva_comision, c.iva_porcentaje, c.notas, coalesce(c.porcentaje_facturado,100), coalesce(c.version_calculo,1)
  );
  insert into public.catering_precio_historial (
    catering_contrato_id, precio_unitario, motivo,
    precio_adultos, precio_jovenes, precio_menores, precio_bebes,
    pax_adultos, pax_jovenes, pax_menores, pax_bebes, usuario_id
  ) values (created_id, p_precio, p_motivo,
    tarifas.precio_adultos, tarifas.precio_jovenes, tarifas.precio_menores, tarifas.precio_bebes,
    c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes, auth.uid());
  return created_id;
end;
$$;


create function software_eventos_private.catering_sync_componentes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pago uuid;
begin
  if tg_table_name = 'pagos' then pago := new.id;
  elsif tg_op = 'DELETE' then pago := old.pago_id;
  else pago := new.pago_id; end if;
  delete from public.catering_cobro_componentes d where d.pago_id = pago and not d.explicito
    and not exists (select 1 from public.v_pago_imputaciones i
      where i.pago_id = pago and i.catering_contrato_id = d.catering_contrato_id and not i.es_garantia);
  insert into public.catering_cobro_componentes as d
    (pago_id,catering_contrato_id,version_calculo,explicito,objetivo_ars,capital_ars,iva_ars)
  select i.pago_id,i.catering_contrato_id,2,false,i.importe_en_pesos,i.importe_en_pesos,0
    from public.v_pago_imputaciones i join public.catering_contratos c on c.id = i.catering_contrato_id
    where i.pago_id = pago and c.version_calculo = 2 and not i.es_garantia and i.importe_en_pesos > 0
  on conflict (pago_id,catering_contrato_id) do update set
    objetivo_ars = excluded.objetivo_ars, capital_ars = excluded.capital_ars where not d.explicito;
  return null;
end;
$$;
revoke all on function software_eventos_private.catering_sync_componentes() from public, anon, authenticated, service_role;
create trigger catering_sync_componentes after insert or update on public.pagos
  for each row execute function software_eventos_private.catering_sync_componentes();
create trigger catering_sync_componentes after insert or update or delete on public.pago_imputaciones
  for each row execute function software_eventos_private.catering_sync_componentes();
create trigger catering_actualizar_componentes after insert or update or delete on public.catering_cobro_componentes
  for each row execute function public.fn_actualizar_totales_catering();
create or replace function software_eventos_private.proteger_pago_por_personas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (exists (select 1 from public.catering_coberturas x where x.pago_id = old.id)
    or exists (select 1 from public.catering_cobro_componentes d where d.pago_id = old.id and d.explicito))
    and not (
      old.deleted_at is null and new.deleted_at is not null
      and (to_jsonb(new) - array['deleted_at','updated_at','importe_en_pesos'])
        = (to_jsonb(old) - array['deleted_at','updated_at','importe_en_pesos'])
    ) and not (
      -- The existing distributed-payment guard restricts conversion to the RPC owner.
      new.distribuido and new.catering_contrato_id is null and new.evento_servicio_id is null
      and (to_jsonb(new) - array['distribuido','catering_contrato_id','evento_servicio_id','updated_at','importe_en_pesos'])
        = (to_jsonb(old) - array['distribuido','catering_contrato_id','evento_servicio_id','updated_at','importe_en_pesos'])
    ) then
    raise exception 'El cobro por personas requiere baja lógica o reasignación' using errcode = '42501';
  end if;
  return new;
end;
$$;
create or replace function software_eventos_private.guardar_pago_distribuido_api(
  p_evento uuid, p_pago uuid, p_editar boolean, p_cabecera jsonb, p_imputaciones jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_pago::text, 0));
  if p_editar and exists (
    select 1 from public.pagos p
    where (exists (select 1 from public.catering_coberturas x where x.pago_id = p.id)
      or exists (select 1 from public.catering_cobro_componentes d where d.pago_id = p.id and d.explicito))
    and p.id = p_pago and p.evento_id = p_evento and p.deleted_at is null
      and auth.uid() is not null and public.current_user_is_active()
      and public.usuario_tiene_evento(p_evento)
      and public.current_user_has_screen_permission(array['eventos'], true)
      and (p.registrado_por = auth.uid() or public.current_user_is_active_admin())
  ) then
    raise exception 'La cobertura por personas requiere una reasignación explícita' using errcode = '23514';
  end if;
  return software_eventos_private.guardar_pago_distribuido(p_evento, p_pago, p_editar, p_cabecera, p_imputaciones);
end;
$$;
create or replace function software_eventos_private.proteger_catering_con_cobertura()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.evento_id is distinct from new.evento_id and (
    exists (select 1 from public.catering_coberturas x join public.pagos p on p.id = x.pago_id
      where x.catering_contrato_id = old.id and x.cantidad > x.liberada and p.deleted_at is null)
    or exists (select 1 from public.catering_cobro_componentes d join public.pagos p on p.id = d.pago_id
      where d.catering_contrato_id = old.id and p.deleted_at is null)
  ) then
    raise exception 'Un catering con cobros activos no puede cambiar de evento' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function software_eventos_private.guardar_pago_por_personas(
  p_catering uuid, p_pago uuid, p_cabecera jsonb, p_coberturas jsonb, p_evento_esperado uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  dia date := software_eventos_private.dia_argentina();
  contrato public.catering_contratos;
  anterior public.pagos;
  datos public.pagos;
  evento uuid;
  lineas jsonb;
  total numeric;
  capital numeric;
  iva numeric;
  ajuste numeric;
  ajuste_iva numeric;
  fiscal record;
  previo public.catering_cobro_componentes;
begin
  if actor is null or not public.current_user_is_active() or p_pago is null
    or not public.current_user_has_screen_permission(
      array[case when p_evento_esperado is not null then 'eventos' else 'catering' end], true) then
    raise exception 'Cobro no autorizado' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_pago::text, 0));
  select * into anterior from public.pagos where id = p_pago for update;
  select evento_id into evento from public.catering_contratos where id = p_catering and deleted_at is null;
  if evento is not null then
    perform 1 from public.eventos where id = evento and deleted_at is null for no key update;
    if not found then raise exception 'Evento no disponible' using errcode = '42501'; end if;
  end if;
  select * into contrato from public.catering_contratos
  where id = p_catering and deleted_at is null and evento_id is not distinct from evento for no key update;
  if not found or (p_evento_esperado is not null and (evento is distinct from p_evento_esperado or not public.usuario_tiene_evento(evento)))
    or (p_evento_esperado is null and not public.usuario_tiene_catering_contrato(p_catering))
    or (public.current_user_is_vendedor_active() and (evento is null or not public.usuario_tiene_evento(evento))) then
    raise exception 'Catering no disponible' using errcode = '42501';
  end if;

  datos := jsonb_populate_record(null::public.pagos, p_cabecera);
  if datos.importe_moneda_original is null or not (datos.importe_moneda_original between 0.01 and 9999999999.99)
    or datos.importe_moneda_original is distinct from (p_cabecera->>'importe_moneda_original')::numeric
    or datos.tipo_cambio is null or not (datos.tipo_cambio between 0.0001 and 999999.9999)
    or datos.tipo_cambio is distinct from (p_cabecera->>'tipo_cambio')::numeric
    or datos.fecha_pago is null or not isfinite(datos.fecha_pago) or datos.forma_pago is null
    or datos.moneda is null or datos.es_garantia is distinct from false
    or (datos.moneda = 'ARS' and datos.tipo_cambio <> 1) then
    raise exception 'Cabecera inválida para cobertura por personas' using errcode = '23514';
  end if;

  if p_coberturas is null or jsonb_typeof(p_coberturas) <> 'array' then
    raise exception 'Ingresá las personas a cubrir' using errcode = '23514';
  end if;
  if jsonb_array_length(p_coberturas) not between 0 and 4 then
    raise exception 'Ingresá hasta cuatro categorías' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.categoria),'[]'::jsonb), coalesce(sum(x.cantidad * x.precio_aplicado),0)
  into lineas, total from jsonb_to_recordset(p_coberturas) as x(categoria text, cantidad integer, precio_aplicado numeric);

  if contrato.version_calculo = 2 then
    capital := coalesce((p_cabecera->>'capital_ars')::numeric, total);
    iva := coalesce((p_cabecera->>'iva_ars')::numeric,0);
    if capital < total or capital < 0 or iva < 0 or capital <> round(capital,2) or iva <> round(iva,2)
      or capital + iva not between 0.01 and 9999999999.99 then
      raise exception 'Desglose inválido' using errcode = '23514';
    end if;
    total := capital + iva;
  elsif coalesce((p_cabecera->>'iva_ars')::numeric,0) <> 0 then
    raise exception 'El historial legacy requiere conciliación' using errcode = '23514';
  end if;
  if total not between 0.01 and 9999999999.99 then
    raise exception 'Desglose inválido' using errcode = '23514';
  end if;
  ajuste := total - round(datos.importe_moneda_original * datos.tipo_cambio,2);
  ajuste_iva := case when contrato.version_calculo = 2 then round(ajuste * iva / total,2) else 0 end;
  if anterior.id is not null then
    select * into previo from public.catering_cobro_componentes
    where pago_id = p_pago and catering_contrato_id = p_catering;
    if anterior.evento_id is not distinct from evento and anterior.deleted_at is null and anterior.registrado_por = actor
      and row(anterior.concepto, anterior.es_garantia, anterior.fecha_pago, anterior.forma_pago, anterior.importe_moneda_original,
        anterior.moneda, anterior.tipo_cambio, anterior.banco, anterior.numero_cheque, anterior.notas)
        is not distinct from
      row(datos.concepto, datos.es_garantia, datos.fecha_pago, datos.forma_pago, datos.importe_moneda_original,
        datos.moneda, datos.tipo_cambio, datos.banco, datos.numero_cheque, datos.notas)
      and ((previo.pago_id is null and contrato.version_calculo = 1 and jsonb_array_length(lineas) > 0)
        or (previo.pago_id is not null and previo.explicito and previo.version_calculo = contrato.version_calculo
          and previo.objetivo_ars = total and previo.capital_ars is not distinct from capital
          and previo.iva_ars is not distinct from iva))
      and lineas = (select coalesce(jsonb_agg(jsonb_build_object(
        'categoria', x.categoria, 'cantidad', x.cantidad, 'precio_aplicado', x.precio_aplicado
      ) order by x.categoria),'[]'::jsonb) from public.catering_coberturas x
      where x.pago_id = p_pago and x.catering_contrato_id = p_catering) then
      return p_pago;
    end if;
    raise exception 'La solicitud ya se usó para otro cobro' using errcode = '23505';
  end if;

  if (datos.moneda = 'ARS' and ajuste <> 0) or (datos.moneda = 'USD'
    and datos.importe_moneda_original is distinct from round(total / datos.tipo_cambio,2)) then
    raise exception 'USD fuera de la política de redondeo' using errcode = 'P2001';
  end if;
  if exists (select 1 from jsonb_to_recordset(lineas) as x(categoria text, cantidad integer, precio_aplicado numeric)
    left join software_eventos_private.catering_tarifas(contrato,dia) t on t.categoria = x.categoria
    where t.categoria is null or x.precio_aplicado is distinct from t.precio_aplicado or x.precio_aplicado <= 0)
    or (select count(*) <> count(distinct x.categoria) from jsonb_to_recordset(lineas) as x(categoria text)) then
    raise exception 'Precio desactualizado' using errcode = 'P2002';
  end if;
  if exists (select 1 from jsonb_to_recordset(lineas) as x(categoria text, cantidad integer)
    join software_eventos_private.catering_tarifas(contrato,dia) t on t.categoria = x.categoria
    where x.cantidad is null or x.cantidad <= 0 or x.cantidad > t.pax - t.cubiertos - t.por_acreditar) then
    raise exception 'PAX insuficientes' using errcode = 'P2003';
  end if;
  if contrato.version_calculo = 2 then
    select * into fiscal from software_eventos_private.catering_fiscal(contrato,dia);
    if iva > greatest(fiscal.iva_pendiente - fiscal.iva_reservado,0) then
      raise exception 'El IVA pendiente cambió o está reservado' using errcode = 'P2004';
    end if;
  end if;

  insert into public.pagos (id, evento_id, catering_contrato_id, concepto, es_garantia, fecha_pago, forma_pago,
    importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas, registrado_por)
  values (p_pago, evento, p_catering, datos.concepto, false, datos.fecha_pago, datos.forma_pago,
    datos.importe_moneda_original, datos.moneda, datos.tipo_cambio, datos.banco, datos.numero_cheque, datos.notas, actor);

  insert into public.catering_cobro_componentes as d
    (pago_id,catering_contrato_id,version_calculo,explicito,objetivo_ars,capital_ars,iva_ars,ajuste_ars,ajuste_iva_ars)
  values (p_pago,p_catering,contrato.version_calculo,true,total,capital,iva,ajuste,ajuste_iva)
  on conflict (pago_id,catering_contrato_id) do update set explicito = true, objetivo_ars = excluded.objetivo_ars,
    capital_ars = excluded.capital_ars, iva_ars = excluded.iva_ars, ajuste_ars = excluded.ajuste_ars, ajuste_iva_ars = excluded.ajuste_iva_ars;

  insert into public.catering_coberturas (pago_id, catering_contrato_id, categoria, cantidad, precio_aplicado)
  select p_pago, p_catering, categoria, cantidad, precio_aplicado
  from jsonb_to_recordset(lineas) as x(categoria text, cantidad integer, precio_aplicado numeric);
  update public.catering_contratos set updated_at = now() where id = p_catering;
  return p_pago;
end;
$$;

create or replace function software_eventos_private.reasignar_excedente_catering(
  p_catering uuid, p_pago uuid, p_categoria text, p_cantidad integer,
  p_destino uuid, p_es_catering boolean, p_liberada_esperada integer
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  servicio uuid := case when not p_es_catering then p_destino end;
  otro_catering uuid := case when p_es_catering then p_destino end;
  dia date := software_eventos_private.dia_argentina();
  pago public.pagos;
  cobertura public.catering_coberturas;
  contrato public.catering_contratos;
  excedente bigint;
  tarifas bigint;
  importe numeric;
  destinos jsonb;
  componente public.catering_cobro_componentes;
begin
  if actor is null or not public.current_user_is_active()
    or not public.current_user_has_screen_permission(array['eventos'], true)
    or p_destino is null or p_es_catering is null or otro_catering = p_catering
    or p_cantidad is null or p_cantidad <= 0 or p_liberada_esperada is null then
    raise exception 'Reasignación no autorizada o inválida' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_pago::text, 0));
  select * into pago from public.pagos where id = p_pago and deleted_at is null for update;
  if not found or pago.evento_id is null or not public.usuario_tiene_evento(pago.evento_id)
    or (pago.registrado_por is distinct from actor and not public.current_user_is_active_admin())
    or pago.es_garantia or (pago.forma_pago = 'cheque' and pago.fecha_pago > dia) then
    raise exception 'El cobro no está disponible o acreditado' using errcode = '42501';
  end if;
  perform 1 from public.eventos where id = pago.evento_id and deleted_at is null for no key update;
  if not found then raise exception 'Evento no disponible' using errcode = '42501'; end if;

  perform 1 from public.evento_servicios s where s.evento_id = pago.evento_id and
    (s.id = servicio or exists (select 1 from public.pago_imputaciones i where i.pago_id = p_pago and i.evento_servicio_id = s.id))
    order by s.id for no key update;
  perform 1 from public.catering_contratos c where c.evento_id = pago.evento_id and
    (c.id in (p_catering, otro_catering) or exists (select 1 from public.pago_imputaciones i where i.pago_id = p_pago and i.catering_contrato_id = c.id))
    order by c.id for no key update;
  select * into contrato from public.catering_contratos where id = p_catering and evento_id = pago.evento_id and deleted_at is null;
  if not found then raise exception 'Catering no disponible' using errcode = '42501'; end if;

  select * into cobertura from public.catering_coberturas x
  where x.pago_id = p_pago and x.catering_contrato_id = p_catering and x.categoria = p_categoria;
  select t.cubiertos - t.pax, t.tarifas_historicas into excedente, tarifas
  from software_eventos_private.catering_tarifas(contrato, dia) t where t.categoria = p_categoria;

  if tarifas > 1 then
    raise exception 'Hay varias tarifas históricas. Falta definir qué cobertura se libera primero' using errcode = '23514';
  end if;
  if cobertura.pago_id is null or cobertura.liberada <> p_liberada_esperada
    or p_cantidad > least(excedente, cobertura.cantidad - cobertura.liberada) then
    raise exception 'Revisá el excedente disponible y recargá la página' using errcode = '23514';
  end if;

  importe := cobertura.precio_aplicado * p_cantidad;
  select * into componente from public.catering_cobro_componentes
    where pago_id = p_pago and catering_contrato_id = p_catering;
  if componente.pago_id is not null then
    importe := least(importe, coalesce(componente.capital_ars, componente.objetivo_ars)
      - (componente.ajuste_ars - componente.ajuste_iva_ars) - componente.capital_reasignado_ars);
    if importe <= 0 then raise exception 'Sin capital real para reasignar' using errcode = '23514'; end if;
  end if;
  select jsonb_agg(to_jsonb(d)) into destinos from (
    select evento_servicio_id, catering_contrato_id, sum(importe_ars) as importe_ars
    from (
      select i.evento_servicio_id, i.catering_contrato_id, i.importe_ars from public.pago_imputaciones i where i.pago_id = p_pago
      union all select null, pago.catering_contrato_id, pago.importe_en_pesos where not pago.distribuido and pago.catering_contrato_id = p_catering
      union all select null, p_catering, -importe
      union all select servicio, otro_catering, importe
    ) lineas group by evento_servicio_id, catering_contrato_id having sum(importe_ars) <> 0
  ) d;
  perform software_eventos_private.guardar_pago_distribuido(pago.evento_id, p_pago, true, to_jsonb(pago), destinos);
  update public.catering_cobro_componentes set capital_reasignado_ars = capital_reasignado_ars + importe
    where pago_id = p_pago and catering_contrato_id = p_catering;
  update public.catering_coberturas set liberada = liberada + p_cantidad where pago_id = p_pago and categoria = p_categoria;
  update public.catering_contratos set updated_at = now() where id = p_catering;
end;
$$;

notify pgrst, 'reload schema';
commit;
