begin;
set local lock_timeout = '5s';

alter table public.catering_precio_historial
  add column precio_adultos numeric(12,2) check (precio_adultos between 0 and 9999999999.99),
  add column precio_jovenes numeric(12,2) check (precio_jovenes between 0 and 9999999999.99),
  add column precio_menores numeric(12,2) check (precio_menores between 0 and 9999999999.99),
  add column precio_bebes numeric(12,2) check (precio_bebes between 0 and 9999999999.99);

-- NULL keeps the historical fixed-charge interpretation, regardless of the old item PAX.
alter table public.catering_items add column categorias_pax text[]
  check (categorias_pax is null or (
    cardinality(categorias_pax) between 1 and 4
    and array_position(categorias_pax, null) is null
    and categorias_pax <@ array['adultos','jovenes','menores','bebes']
    and precio_unitario between 0 and 9999999999.99 and precio_unitario is not null
  ));

create table public.catering_coberturas (
  pago_id uuid not null references public.pagos(id),
  catering_contrato_id uuid not null references public.catering_contratos(id),
  categoria text not null check (categoria in ('adultos','jovenes','menores','bebes')),
  cantidad integer not null check (cantidad > 0),
  precio_aplicado numeric(12,2) not null check (precio_aplicado between 0.01 and 9999999999.99),
  importe_historico numeric(12,2) generated always as (cantidad * precio_aplicado) stored,
  liberada integer not null default 0 check (liberada between 0 and cantidad),
  primary key (pago_id, categoria)
);
create index catering_coberturas_contrato_idx on public.catering_coberturas (catering_contrato_id, categoria);
alter table public.catering_coberturas enable row level security;
revoke all on public.catering_coberturas from public, anon, authenticated, service_role;
grant select on public.catering_coberturas to authenticated, service_role;
create policy catering_coberturas_select on public.catering_coberturas for select to authenticated
using (
  public.current_user_has_screen_permission(array['eventos','catering','pagos','reportes'], false)
  and exists (select 1 from public.catering_contratos c where c.id = catering_contrato_id and c.deleted_at is null)
  and (
    exists (select 1 from public.pagos p where p.id = pago_id)
    or exists (select 1 from public.v_pago_imputaciones i
      where i.pago_id = catering_coberturas.pago_id and i.catering_contrato_id = catering_coberturas.catering_contrato_id)
  )
);
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.catering_precio_historial'::regclass
    and not tgisinternal and (tgtype & 4) <> 0
    and tgfoid in ('public.audit_row_change()'::regprocedure, 'public.fn_audit_log()'::regprocedure)) then
    create trigger audit_row_change after insert on public.catering_precio_historial
      for each row execute function public.audit_row_change();
  end if;
end;
$$;
create trigger audit_row_change after insert or update on public.catering_coberturas
  for each row execute function public.audit_row_change('pago_id,categoria');

create function software_eventos_private.catering_tarifas(c public.catering_contratos, p_dia date)
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
    round((coalesce(v.precio, h.precio_unitario) + a.importe) * (1 + coalesce(c.iva_porcentaje, 0)), 2),
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

create function software_eventos_private.catering_costos(c public.catering_contratos, p_dia date)
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
    k.subtotal + k.comision, k.subtotal + round(k.subtotal * k.tasa, 2) + k.comision + k.iva_comision,
    k.pendiente + round(k.pendiente * k.tasa, 2) + k.cobertura - k.subtotal - round(k.subtotal * k.tasa, 2)
  from costos k;
end;

-- Keep the existing column and view contracts. This trigger is now the sole writer of the stored balance.
alter table public.catering_contratos alter column saldo_pendiente drop expression;

create or replace function software_eventos_private.catering_compute_totals()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  dia date := software_eventos_private.dia_argentina();
  costos record;
begin
  select * into costos from software_eventos_private.catering_costos(new, dia);
  new.total_sin_iva := costos.total_sin_iva;
  new.total_con_iva := costos.total_con_iva;
  select a.cobrado into new.total_pagado
  from software_eventos_private.cobros_acreditados(null, new.id, dia) a;
  new.saldo_pendiente := new.total_con_iva + costos.ajuste_cobertura - new.total_pagado;
  return new;
end;
$$;

create view public.v_catering_tarifas with (security_invoker = true) as
select c.id as catering_contrato_id, c.evento_id, t.*,
  greatest(t.pax - t.cubiertos, 0) as pendientes,
  greatest(t.cubiertos - t.pax, 0) as excedente,
  round((coalesce(t.precio_base, 0) + t.adicional_unitario) * greatest(t.pax - t.cubiertos, 0)
    * (1 + coalesce(c.iva_porcentaje, 0)), 2) as saldo_categoria
from public.catering_contratos c
cross join lateral software_eventos_private.catering_tarifas(c, software_eventos_private.dia_argentina()) t
where c.deleted_at is null;

create view public.v_catering_costos with (security_invoker = true) as
select c.id as catering_contrato_id, k.*, extras.por_tipo as extras_por_tipo
from public.catering_contratos c
cross join lateral software_eventos_private.catering_costos(c, software_eventos_private.dia_argentina()) k
cross join lateral (
  select coalesce(jsonb_object_agg(grupo.categoria, grupo.importe), '{}'::jsonb) as por_tipo
  from (
    select i.categoria, sum(i.precio_unitario * case when i.categorias_pax is null then 1 else (
      select coalesce(sum(v.pax), 0) from (values ('adultos', c.pax_adultos), ('jovenes', c.pax_jovenes),
        ('menores', c.pax_menores), ('bebes', c.pax_bebes)) v(categoria, pax)
      where v.categoria = any(i.categorias_pax)
    ) end) as importe
    from public.catering_items i where i.catering_contrato_id = c.id group by i.categoria
  ) grupo
) extras
where c.deleted_at is null;

revoke all on function software_eventos_private.catering_tarifas(public.catering_contratos,date),
  software_eventos_private.catering_costos(public.catering_contratos,date) from public, anon, authenticated, service_role;
grant execute on function software_eventos_private.catering_tarifas(public.catering_contratos,date),
  software_eventos_private.catering_costos(public.catering_contratos,date) to anon, authenticated, service_role;
revoke all on public.v_catering_tarifas, public.v_catering_costos from public, anon, authenticated, service_role;
grant select on public.v_catering_tarifas, public.v_catering_costos to authenticated, service_role;
-- Anonymous callers still get no rows from the summary via the contract's RLS.
grant select on public.catering_coberturas to anon;

create or replace view public.v_catering_acreditado with (security_invoker = true) as
select c.id, c.evento_id, c.ejecutiva_id, c.tipo_servicio, c.pax_comida, c.pax_post_postre, c.pax_final,
  c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes, c.precio_cierre_alimentos_sin_iva,
  c.precio_cierre_bebidas_sin_iva, c.iva_porcentaje, c.comision_organizador_monto, c.iva_comision,
  c.emite_factura, c.monto_con_factura, c.monto_sin_factura, c.factura_concepto, c.factura_razon_social,
  c.factura_cuit, c.factura_direccion, c.factura_contacto_admin, c.total_sin_iva, c.total_con_iva,
  a.cobrado as total_pagado, round(c.total_con_iva + k.ajuste_cobertura - a.cobrado, 2) as saldo_pendiente,
  c.notas, c.deleted_at, c.created_at, c.updated_at, c.cliente_nombre, c.cliente_razon_social,
  c.cliente_cuit_dni, c.cliente_contacto, c.fecha_evento, c.salon_id, c.tipo_evento, c.lugar_evento,
  k.ajuste_cobertura, k.extras as total_adicionales
from public.catering_contratos c
cross join lateral software_eventos_private.dia_argentina() dia
cross join lateral software_eventos_private.cobros_acreditados(null, c.id, dia) a
cross join lateral software_eventos_private.catering_costos(c, dia) k;

create or replace view public.v_resumen_evento with (security_invoker = true) as
select e.id, e.cliente_nombre, e.estado, e.fecha_evento, s.nombre as salon, u.full_name as vendedor,
  coalesce(servicios.total, 0) as total_servicios,
  coalesce(servicios.cobrado, 0) as total_pagado_servicios,
  coalesce(servicios.total, 0) - coalesce(servicios.cobrado, 0) as saldo_servicios,
  coalesce(catering.total, 0) as total_catering,
  coalesce(catering.cobrado, 0) as total_pagado_catering,
  coalesce(catering.saldo, 0) as saldo_catering,
  coalesce(catering.ajuste, 0) as ajuste_cobertura_catering
from public.eventos e
left join public.salones s on s.id = e.salon_id
left join public.usuarios u on u.id = e.vendedor_id
left join (
  select evento_id, sum(total_con_iva) as total, sum(total_pagado) as cobrado
  from public.v_evento_servicios_acreditados group by evento_id
) servicios on servicios.evento_id = e.id
left join (
  select evento_id, sum(total_con_iva) as total, sum(total_pagado) as cobrado, sum(saldo_pendiente) as saldo, sum(ajuste_cobertura) as ajuste
  from public.v_catering_acreditado where deleted_at is null group by evento_id
) catering on catering.evento_id = e.id
where e.deleted_at is null;

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
    comision_organizador_monto, iva_comision, iva_porcentaje, notas
  ) values (
    created_id, c.evento_id, c.cliente_nombre, c.cliente_razon_social, c.cliente_cuit_dni, c.cliente_contacto,
    c.fecha_evento, c.lugar_evento, c.tipo_evento, c.tipo_servicio, c.ejecutiva_id,
    c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes,
    c.comision_organizador_monto, c.iva_comision, c.iva_porcentaje, c.notas
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

-- Keep the distributed RPC and its validation as the only way to alter allocations.
alter function public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb) set schema software_eventos_private;
revoke all on function software_eventos_private.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb)
  from public, anon, authenticated, service_role;

create function software_eventos_private.guardar_pago_distribuido_api(
  p_evento uuid, p_pago uuid, p_editar boolean, p_cabecera jsonb, p_imputaciones jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_pago::text, 0));
  if p_editar and exists (
    select 1 from public.catering_coberturas x join public.pagos p on p.id = x.pago_id
    where p.id = p_pago and p.evento_id = p_evento and p.deleted_at is null
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
revoke all on function software_eventos_private.guardar_pago_distribuido_api(uuid,uuid,boolean,jsonb,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function software_eventos_private.guardar_pago_distribuido_api(uuid,uuid,boolean,jsonb,jsonb) to authenticated;

create function public.guardar_pago_distribuido(
  p_evento uuid, p_pago uuid, p_editar boolean, p_cabecera jsonb, p_imputaciones jsonb
)
returns uuid language sql security invoker set search_path = ''
return software_eventos_private.guardar_pago_distribuido_api(p_evento, p_pago, p_editar, p_cabecera, p_imputaciones);
revoke all on function public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.guardar_pago_distribuido(uuid,uuid,boolean,jsonb,jsonb) to authenticated;

create function software_eventos_private.proteger_pago_por_personas()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.catering_coberturas x where x.pago_id = old.id)
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
revoke all on function software_eventos_private.proteger_pago_por_personas() from public, anon, authenticated, service_role;
create trigger proteger_pago_por_personas before update on public.pagos
for each row execute function software_eventos_private.proteger_pago_por_personas();

create function software_eventos_private.proteger_catering_con_cobertura()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.evento_id is distinct from new.evento_id and exists (
    select 1 from public.catering_coberturas x join public.pagos p on p.id = x.pago_id
    where x.catering_contrato_id = old.id and x.cantidad > x.liberada and p.deleted_at is null
  ) then
    raise exception 'Un catering con cobertura activa no puede cambiar de evento' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function software_eventos_private.proteger_catering_con_cobertura() from public, anon, authenticated, service_role;
create trigger proteger_catering_con_cobertura before update of evento_id on public.catering_contratos
for each row execute function software_eventos_private.proteger_catering_con_cobertura();

create function software_eventos_private.guardar_pago_por_personas(
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
  if jsonb_array_length(p_coberturas) not between 1 and 4 then
    raise exception 'Ingresá entre una y cuatro categorías' using errcode = '23514';
  end if;

  select jsonb_agg(to_jsonb(x) order by x.categoria), sum(x.cantidad * x.precio_aplicado)
  into lineas, total from jsonb_to_recordset(p_coberturas) as x(categoria text, cantidad integer, precio_aplicado numeric);

  if anterior.id is not null then
    if anterior.evento_id is not distinct from evento and anterior.deleted_at is null and anterior.registrado_por = actor
      and row(anterior.concepto, anterior.es_garantia, anterior.fecha_pago, anterior.forma_pago, anterior.importe_moneda_original,
        anterior.moneda, anterior.tipo_cambio, anterior.banco, anterior.numero_cheque, anterior.notas)
        is not distinct from
      row(datos.concepto, datos.es_garantia, datos.fecha_pago, datos.forma_pago, datos.importe_moneda_original,
        datos.moneda, datos.tipo_cambio, datos.banco, datos.numero_cheque, datos.notas)
      and lineas = (select jsonb_agg(jsonb_build_object(
        'categoria', x.categoria, 'cantidad', x.cantidad, 'precio_aplicado', x.precio_aplicado
      ) order by x.categoria) from public.catering_coberturas x
      where x.pago_id = p_pago and x.catering_contrato_id = p_catering) then
      return p_pago;
    end if;
    raise exception 'La solicitud ya se usó para otro cobro' using errcode = '23505';
  end if;

  if total is distinct from round(datos.importe_moneda_original * datos.tipo_cambio, 2)
    or exists (
      select 1 from jsonb_to_recordset(lineas) as x(categoria text, cantidad integer, precio_aplicado numeric)
      left join software_eventos_private.catering_tarifas(contrato, dia) t on t.categoria = x.categoria
      where t.categoria is null or x.cantidad is null or x.cantidad <= 0
        or x.cantidad > t.pax - t.cubiertos - t.por_acreditar
        or x.precio_aplicado is null or x.precio_aplicado is distinct from t.precio_aplicado or x.precio_aplicado <= 0
    ) or (select count(*) <> count(distinct x.categoria)
      from jsonb_to_recordset(lineas) as x(categoria text)) then
    raise exception 'Revisá el importe, los precios vigentes y los PAX disponibles' using errcode = '23514';
  end if;

  insert into public.pagos (id, evento_id, catering_contrato_id, concepto, es_garantia, fecha_pago, forma_pago,
    importe_moneda_original, moneda, tipo_cambio, banco, numero_cheque, notas, registrado_por)
  values (p_pago, evento, p_catering, datos.concepto, false, datos.fecha_pago, datos.forma_pago,
    datos.importe_moneda_original, datos.moneda, datos.tipo_cambio, datos.banco, datos.numero_cheque, datos.notas, actor);

  insert into public.catering_coberturas (pago_id, catering_contrato_id, categoria, cantidad, precio_aplicado)
  select p_pago, p_catering, categoria, cantidad, precio_aplicado
  from jsonb_to_recordset(lineas) as x(categoria text, cantidad integer, precio_aplicado numeric);
  update public.catering_contratos set updated_at = now() where id = p_catering;
  return p_pago;
end;
$$;

create function software_eventos_private.reasignar_excedente_catering(
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
  update public.catering_coberturas set liberada = liberada + p_cantidad where pago_id = p_pago and categoria = p_categoria;
  update public.catering_contratos set updated_at = now() where id = p_catering;
end;
$$;

revoke all on function software_eventos_private.guardar_pago_por_personas(uuid,uuid,jsonb,jsonb,uuid),
  software_eventos_private.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer)
  from public, anon, authenticated, service_role;
grant execute on function software_eventos_private.guardar_pago_por_personas(uuid,uuid,jsonb,jsonb,uuid),
  software_eventos_private.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer) to authenticated;

create function public.guardar_pago_por_personas(
  p_catering uuid, p_pago uuid, p_cabecera jsonb, p_coberturas jsonb, p_evento_esperado uuid default null
)
returns uuid language sql security invoker set search_path = ''
return software_eventos_private.guardar_pago_por_personas(p_catering, p_pago, p_cabecera, p_coberturas, p_evento_esperado);

create function public.reasignar_excedente_catering(
  p_catering uuid, p_pago uuid, p_categoria text, p_cantidad integer,
  p_destino uuid, p_es_catering boolean, p_liberada_esperada integer
)
returns void language sql security invoker set search_path = ''
return software_eventos_private.reasignar_excedente_catering(
  p_catering, p_pago, p_categoria, p_cantidad, p_destino, p_es_catering, p_liberada_esperada
);

revoke all on function public.guardar_pago_por_personas(uuid,uuid,jsonb,jsonb,uuid),
  public.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer) from public, anon, authenticated, service_role;
grant execute on function public.guardar_pago_por_personas(uuid,uuid,jsonb,jsonb,uuid),
  public.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
