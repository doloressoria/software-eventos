-- Preserve the commercial formula already used by the application, in the same
-- transaction as each source write. No historical backfill is performed here.
set local lock_timeout = '5s';
create schema if not exists software_eventos_private;
revoke all on schema software_eventos_private from public, anon, authenticated;

create function software_eventos_private.catering_compute_totals()
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
  new.total_pagado := (select coalesce(sum(p.importe_en_pesos), 0)
    from public.pagos p where p.catering_contrato_id = new.id
      and p.deleted_at is null and not p.es_garantia);
  return new;
end;
$$;
revoke all on function software_eventos_private.catering_compute_totals() from public, anon, authenticated;
create trigger catering_compute_totals before insert or update on public.catering_contratos
for each row execute function software_eventos_private.catering_compute_totals();

-- Serialize child writes before changing their source rows, including two
-- simultaneous additional/price writes for the same contract.
create function software_eventos_private.catering_lock_parent()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare old_id uuid; new_id uuid;
begin
  if tg_op <> 'INSERT' then old_id := old.catering_contrato_id; end if;
  if tg_op <> 'DELETE' then new_id := new.catering_contrato_id; end if;
  perform c.id from public.catering_contratos c
    where c.id in (old_id, new_id) order by c.id for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function software_eventos_private.catering_lock_parent() from public, anon, authenticated;
create trigger catering_lock_parent before insert or update or delete on public.catering_items
for each row execute function software_eventos_private.catering_lock_parent();
create trigger catering_lock_parent before insert on public.catering_precio_historial
for each row execute function software_eventos_private.catering_lock_parent();

create or replace function public.fn_actualizar_totales_catering()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare old_id uuid; new_id uuid;
begin
  if tg_op <> 'INSERT' then old_id := old.catering_contrato_id; end if;
  if tg_op <> 'DELETE' then new_id := new.catering_contrato_id; end if;
  update public.catering_contratos set updated_at = now() where id in (old_id, new_id);
  return null;
end;
$$;
revoke all on function public.fn_actualizar_totales_catering() from public, anon, authenticated;

create function software_eventos_private.catering_apply_price()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  update public.catering_contratos set
    pax_adultos = new.pax_adultos, pax_jovenes = new.pax_jovenes,
    pax_menores = new.pax_menores, pax_bebes = new.pax_bebes
  where id = new.catering_contrato_id and deleted_at is null;
  if not found then
    raise exception 'Catering inexistente o sin acceso' using errcode = '42501';
  end if;
  return null;
end;
$$;
revoke all on function software_eventos_private.catering_apply_price() from public, anon, authenticated;
create trigger catering_apply_price after insert on public.catering_precio_historial
for each row execute function software_eventos_private.catering_apply_price();

-- RLS applies to both inserts; failure of the initial price rolls back the parent.
create function public.crear_catering_con_precio(p_contrato jsonb, p_precio numeric, p_motivo text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare c public.catering_contratos; created_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or not public.current_user_has_screen_permission(array['catering'], true) then
    raise exception 'Sin permiso para gestionar catering' using errcode = '42501';
  end if;
  if p_precio is null or p_precio <= 0 or p_precio = 'NaN'::numeric then
    raise exception 'Precio inicial invalido' using errcode = '23514';
  end if;
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
    pax_adultos, pax_jovenes, pax_menores, pax_bebes, usuario_id
  ) values (created_id, p_precio, p_motivo,
    c.pax_adultos, c.pax_jovenes, c.pax_menores, c.pax_bebes, auth.uid());
  return created_id;
end;
$$;
revoke all on function public.crear_catering_con_precio(jsonb, numeric, text) from public, anon;
grant execute on function public.crear_catering_con_precio(jsonb, numeric, text) to authenticated;
