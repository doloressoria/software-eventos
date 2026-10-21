-- Sólo DDL. No recalcula ni corrige registros existentes.
-- Ejecutar preflight y guardar definiciones actuales según docs/verificacion-bloqueos.md.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'La vista requiere PostgreSQL 15 o superior';
  end if;
  if not exists (select 1 from pg_trigger
    where tgrelid = 'public.pagos'::regclass
      and tgname = 'trg_validar_pago_evento_catering'
      and tgfoid = 'public.validar_movimiento_evento_catering()'::regprocedure
      and tgenabled = 'O') then
    raise exception 'Falta el validador complementario de pagos';
  end if;
  if (select count(*) from pg_trigger
      where tgname = 'audit_row_change' and tgenabled = 'O'
      and tgfoid = 'public.audit_row_change()'::regprocedure
      and tgrelid in ('public.pagos'::regclass, 'public.catering_contratos'::regclass,
        'public.evento_servicios'::regclass, 'public.eventos'::regclass)) <> 4 then
    raise exception 'Revisar auditoría antes de retirar triggers antiguos';
  end if;
end;
$$;

alter view public.v_resumen_evento set (security_invoker = true);

-- SELECT se comprueba también sobre la fila resultante del UPDATE.
-- Mantener autorización por evento permite la baja lógica sin abrir otros salones.
-- UPDATE sigue exigiendo deleted_at IS NULL; las pantallas filtran pagos activos.
alter policy pagos_select_assigned on public.pagos
  using (public.is_admin() or public.usuario_tiene_evento(evento_id));

-- Conserva ambas validaciones antiguas: existencia y pertenencia exacta.
-- NULL es válido sólo para contrato externo + movimiento sin evento.
CREATE OR REPLACE FUNCTION public.fn_validar_pago_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_evento_id UUID;
BEGIN
  IF NEW.evento_servicio_id IS NOT NULL THEN
    SELECT es.evento_id INTO v_evento_id
    FROM evento_servicios es
    WHERE es.id = NEW.evento_servicio_id;

    IF NOT FOUND OR v_evento_id IS DISTINCT FROM NEW.evento_id THEN
      RAISE EXCEPTION 'El servicio del pago no pertenece al evento indicado'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.catering_contrato_id IS NOT NULL THEN
    SELECT cc.evento_id INTO v_evento_id
    FROM catering_contratos cc
    WHERE cc.id = NEW.catering_contrato_id;

    IF NOT FOUND OR v_evento_id IS DISTINCT FROM NEW.evento_id THEN
      RAISE EXCEPTION 'El contrato de catering del pago no pertenece al evento indicado'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
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

  -- Recalcular cada destino una sola vez, incluidos cambios de garantía/destino.
  update public.evento_servicios es
  set total_pagado = (
    select coalesce(sum(p.importe_en_pesos), 0)
    from public.pagos p
    where p.evento_servicio_id = es.id
      and p.deleted_at is null and not p.es_garantia
  )
  where es.id in (old_servicio, new_servicio);

  update public.catering_contratos cc
  set total_pagado = (
    select coalesce(sum(p.importe_en_pesos), 0)
    from public.pagos p
    where p.catering_contrato_id = cc.id
      and p.deleted_at is null and not p.es_garantia
  )
  where cc.id in (old_catering, new_catering);

  return null;
end;
$$;

-- audit_row_change conserva actor, sanitización, cambios y baja lógica.
drop trigger trg_audit_pagos on public.pagos;
drop trigger trg_audit_catering_contratos on public.catering_contratos;
drop trigger trg_audit_evento_servicios on public.evento_servicios;
drop trigger trg_audit_eventos on public.eventos;

