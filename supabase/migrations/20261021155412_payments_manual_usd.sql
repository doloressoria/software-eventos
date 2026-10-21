-- Aplicar después de 20261021145259, en una transacción. Sin backfill ni tasas inventadas.
do $$
begin
  if position('not p.es_garantia' in pg_get_functiondef('public.fn_actualizar_totales_pagos()'::regprocedure)) = 0
    or position('IS DISTINCT FROM' in pg_get_functiondef('public.fn_validar_pago_evento()'::regprocedure)) = 0 then
    raise exception 'Aplicar primero 20261021145259_unblock_payments_and_summary_access.sql';
  end if;
  if (select attgenerated <> 's' from pg_attribute
      where attrelid = 'public.pagos'::regclass and attname = 'importe_en_pesos') then
    raise exception 'Revisar definición de importe_en_pesos: se espera columna generada';
  end if;
end;
$$;

-- USD nunca hereda una cotización silenciosa. ARS se normaliza a 1 en el trigger.
alter table public.pagos alter column tipo_cambio drop default;

create function public.validar_moneda_pago() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  -- Los legados se conservan, incluso para bajas; cambiar dinero exige datos válidos.
  if tg_op = 'UPDATE' and
    row(new.moneda, new.forma_pago, new.importe_moneda_original, new.tipo_cambio)
      is not distinct from row(old.moneda, old.forma_pago, old.importe_moneda_original, old.tipo_cambio) then
    return new;
  end if;
  if new.moneda = 'ARS' and new.tipo_cambio is null then new.tipo_cambio := 1; end if;
  if new.moneda not in ('ARS', 'USD')
    or (new.moneda = 'ARS' and new.forma_pago not in ('efectivo_pesos', 'transferencia', 'cheque', 'retenciones'))
    or (new.moneda = 'USD' and new.forma_pago not in ('efectivo_dolares', 'transferencia')) then
    raise exception 'Moneda incompatible con la forma de pago' using errcode = '23514';
  end if;
  if new.tipo_cambio is null or new.tipo_cambio <= 0 or new.tipo_cambio = 'NaN'::numeric
    or (new.moneda = 'ARS' and new.tipo_cambio <> 1) then
    raise exception 'Cotización inválida: ARS requiere 1; USD requiere ARS por USD positivo y explícito' using errcode = '23514';
  end if;
  if new.importe_moneda_original <= 0 or new.importe_moneda_original = 'NaN'::numeric then
    raise exception 'Importe original debe ser positivo' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.validar_moneda_pago() from public, anon, authenticated;
create trigger validar_moneda_pago before insert or update on public.pagos
  for each row execute function public.validar_moneda_pago();

-- Misma regla vigente de servicios: IVA incluido en no efectivo, base no decreciente.
-- Catering conserva su fórmula pendiente; aquí sólo se actualiza su cobro en ARS.
create or replace function public.fn_actualizar_totales_pagos()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  old_servicio uuid;
  new_servicio uuid;
  old_catering uuid;
  new_catering uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_servicio := old.evento_servicio_id;
    old_catering := old.catering_contrato_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    new_servicio := new.evento_servicio_id;
    new_catering := new.catering_contrato_id;
  end if;

  update public.evento_servicios es
  set total_pagado = (
    select coalesce(sum(p.importe_en_pesos), 0) from public.pagos p
    where p.evento_servicio_id = es.id and p.deleted_at is null and not p.es_garantia
  ), iva_base_imponible = least(es.total_sin_iva, greatest(es.iva_base_imponible, (
    select coalesce(sum(round(p.importe_en_pesos / 1.21, 2)), 0) from public.pagos p
    where p.evento_servicio_id = es.id and p.deleted_at is null and not p.es_garantia
      and p.forma_pago not in ('efectivo_pesos', 'efectivo_dolares')
  ))), iva_porcentaje = 0.21
  where es.id in (old_servicio, new_servicio);

  update public.catering_contratos cc
  set total_pagado = (
    select coalesce(sum(p.importe_en_pesos), 0) from public.pagos p
    where p.catering_contrato_id = cc.id and p.deleted_at is null and not p.es_garantia
  )
  where cc.id in (old_catering, new_catering);
  return null;
end;
$$;
