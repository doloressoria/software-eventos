-- Recuperación de DDL previo: sólo tras revisión; no repara datos ni auditoría pasada.
-- Revertir la vista reabre la exposición confirmada: mantener security_invoker=true.
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

    IF v_evento_id IS NULL OR v_evento_id <> NEW.evento_id THEN
      RAISE EXCEPTION 'El servicio del pago no pertenece al evento indicado'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.catering_contrato_id IS NOT NULL THEN
    SELECT cc.evento_id INTO v_evento_id
    FROM catering_contratos cc
    WHERE cc.id = NEW.catering_contrato_id;

    IF v_evento_id IS NULL OR v_evento_id <> NEW.evento_id THEN
      RAISE EXCEPTION 'El contrato de catering del pago no pertenece al evento indicado'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.fn_actualizar_totales_pagos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.evento_servicio_id IS NOT NULL THEN
      UPDATE evento_servicios es
      SET total_pagado = (
        SELECT COALESCE(SUM(p.importe_en_pesos), 0)
        FROM pagos p
        WHERE p.evento_servicio_id = OLD.evento_servicio_id
          AND p.deleted_at IS NULL
      )
      WHERE es.id = OLD.evento_servicio_id;
    END IF;

    IF OLD.catering_contrato_id IS NOT NULL THEN
      UPDATE catering_contratos cc
      SET total_pagado = (
        SELECT COALESCE(SUM(p.importe_en_pesos), 0)
        FROM pagos p
        WHERE p.catering_contrato_id = OLD.catering_contrato_id
          AND p.deleted_at IS NULL
      )
      WHERE cc.id = OLD.catering_contrato_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.evento_servicio_id IS NOT NULL
      AND (TG_OP = 'INSERT' OR NEW.evento_servicio_id IS DISTINCT FROM OLD.evento_servicio_id OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.importe_moneda_original IS DISTINCT FROM OLD.importe_moneda_original OR NEW.tipo_cambio IS DISTINCT FROM OLD.tipo_cambio)
    THEN
      UPDATE evento_servicios es
      SET total_pagado = (
        SELECT COALESCE(SUM(p.importe_en_pesos), 0)
        FROM pagos p
        WHERE p.evento_servicio_id = NEW.evento_servicio_id
          AND p.deleted_at IS NULL
      )
      WHERE es.id = NEW.evento_servicio_id;
    END IF;

    IF NEW.catering_contrato_id IS NOT NULL
      AND (TG_OP = 'INSERT' OR NEW.catering_contrato_id IS DISTINCT FROM OLD.catering_contrato_id OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.importe_moneda_original IS DISTINCT FROM OLD.importe_moneda_original OR NEW.tipo_cambio IS DISTINCT FROM OLD.tipo_cambio)
    THEN
      UPDATE catering_contratos cc
      SET total_pagado = (
        SELECT COALESCE(SUM(p.importe_en_pesos), 0)
        FROM pagos p
        WHERE p.catering_contrato_id = NEW.catering_contrato_id
          AND p.deleted_at IS NULL
      )
      WHERE cc.id = NEW.catering_contrato_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$function$
;
alter policy pagos_select_assigned on public.pagos
  using (is_admin() or (deleted_at is null and usuario_tiene_evento(evento_id)));
CREATE TRIGGER trg_audit_evento_servicios AFTER INSERT OR DELETE OR UPDATE ON public.evento_servicios FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_catering_contratos AFTER INSERT OR DELETE OR UPDATE ON public.catering_contratos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_pagos AFTER INSERT OR DELETE OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_audit_eventos AFTER INSERT OR DELETE OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
-- Conserva el cierre de seguridad de la vista incluso al recuperar los demás objetos.

