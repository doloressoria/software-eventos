-- Structural snapshot of public.egresos, read-only catalog capture 2026-11-06.
-- Focused fixture, not a deployable schema or a substitute for Supabase Auth.
create table public.egresos (
id uuid not null default gen_random_uuid(),
evento_id uuid,
evento_servicio_id uuid,
catering_contrato_id uuid,
categoria text not null,
concepto text not null,
proveedor text,
fecha_egreso date not null,
forma_pago forma_pago,
moneda moneda not null,
tipo_cambio numeric,
importe_moneda_original numeric not null,
importe_en_pesos numeric not null,
notas text,
registrado_por uuid,
deleted_at timestamp with time zone,
created_at timestamp with time zone not null default now(),
updated_at timestamp with time zone not null default now()
);
alter table public.egresos add constraint egresos_categoria_not_empty CHECK ((length(TRIM(BOTH FROM categoria)) > 0));
alter table public.egresos add constraint egresos_catering_contrato_id_fkey FOREIGN KEY (catering_contrato_id) REFERENCES catering_contratos(id) ON DELETE SET NULL;
alter table public.egresos add constraint egresos_concepto_not_empty CHECK ((length(TRIM(BOTH FROM concepto)) > 0));
alter table public.egresos add constraint egresos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE RESTRICT;
alter table public.egresos add constraint egresos_evento_o_catering_chk CHECK (((evento_id IS NOT NULL) OR (catering_contrato_id IS NOT NULL)));
alter table public.egresos add constraint egresos_evento_servicio_id_fkey FOREIGN KEY (evento_servicio_id) REFERENCES evento_servicios(id) ON DELETE SET NULL;
alter table public.egresos add constraint egresos_importe_original_non_negative CHECK ((importe_moneda_original >= (0)::numeric));
alter table public.egresos add constraint egresos_importe_pesos_non_negative CHECK ((importe_en_pesos >= (0)::numeric));
alter table public.egresos add constraint egresos_pkey PRIMARY KEY (id);
alter table public.egresos add constraint egresos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
alter table public.egresos add constraint egresos_tipo_cambio_non_negative CHECK (((tipo_cambio IS NULL) OR (tipo_cambio >= (0)::numeric)));
alter table public.egresos add constraint egresos_un_solo_origen CHECK ((num_nonnulls(evento_servicio_id, catering_contrato_id) <= 1));
alter table public.egresos enable row level security;
CREATE OR REPLACE FUNCTION public.prevent_egresos_update_except_soft_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.deleted_at is not null then
    raise exception 'No se puede modificar un egreso eliminado.';
  end if;

  if new.deleted_at is null then
    raise exception 'Por ahora solo se permite eliminar lógicamente egresos.';
  end if;

  if old.id is distinct from new.id
    or old.evento_id is distinct from new.evento_id
    or old.evento_servicio_id is distinct from new.evento_servicio_id
    or old.catering_contrato_id is distinct from new.catering_contrato_id
    or old.categoria is distinct from new.categoria
    or old.concepto is distinct from new.concepto
    or old.proveedor is distinct from new.proveedor
    or old.fecha_egreso is distinct from new.fecha_egreso
    or old.forma_pago is distinct from new.forma_pago
    or old.moneda is distinct from new.moneda
    or old.tipo_cambio is distinct from new.tipo_cambio
    or old.importe_moneda_original is distinct from new.importe_moneda_original
    or old.importe_en_pesos is distinct from new.importe_en_pesos
    or old.notas is distinct from new.notas
    or old.registrado_por is distinct from new.registrado_por
    or old.created_at is distinct from new.created_at
  then
    raise exception 'Por ahora solo se permite actualizar deleted_at para soft delete.';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validar_movimiento_evento_catering()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_catering_evento_id uuid;
  v_evento_servicio_evento_id uuid;
begin

  -- ----------------------------------------------------------
  -- Validar catering_contrato_id.
  -- ----------------------------------------------------------
  if new.catering_contrato_id is not null then

    select cc.evento_id
    into v_catering_evento_id
    from public.catering_contratos cc
    where cc.id = new.catering_contrato_id
      and cc.deleted_at is null;

    if not found then
      raise exception
        'El catering indicado no existe o fue eliminado';
    end if;


    -- Movimiento standalone.
    if new.evento_id is null then

      if v_catering_evento_id is not null then
        raise exception
          'Un movimiento sin evento sólo puede vincularse a un catering externo';
      end if;

      if new.evento_servicio_id is not null then
        raise exception
          'Un catering externo no puede vincularse a un servicio perteneciente a un evento';
      end if;


    -- Movimiento vinculado a evento.
    else

      if v_catering_evento_id is null
         or v_catering_evento_id <> new.evento_id then
        raise exception
          'El catering indicado no pertenece al evento del movimiento';
      end if;

    end if;

  end if;


  -- ----------------------------------------------------------
  -- Validar evento_servicio_id.
  -- ----------------------------------------------------------
  if new.evento_servicio_id is not null then

    select es.evento_id
    into v_evento_servicio_evento_id
    from public.evento_servicios es
    where es.id = new.evento_servicio_id;

    if not found then
      raise exception
        'El servicio de evento indicado no existe';
    end if;


    if new.evento_id is null
       or v_evento_servicio_evento_id <> new.evento_id then
      raise exception
        'El servicio indicado no pertenece al evento del movimiento';
    end if;

  end if;


  return new;
end;
$function$
;

create policy egresos_select_by_event_access on public.egresos as PERMISSIVE for SELECT to public using (((deleted_at IS NULL) AND (is_admin() OR (EXISTS ( SELECT 1
   FROM (eventos e
     JOIN usuario_salon us ON ((us.salon_id = e.salon_id)))
  WHERE ((e.id = egresos.evento_id) AND (e.deleted_at IS NULL) AND (us.usuario_id = auth.uid())))))));
create policy egresos_insert_by_event_access on public.egresos as PERMISSIVE for INSERT to public with check (((deleted_at IS NULL) AND ((registrado_por IS NULL) OR (registrado_por = auth.uid())) AND (is_admin() OR (EXISTS ( SELECT 1
   FROM (eventos e
     JOIN usuario_salon us ON ((us.salon_id = e.salon_id)))
  WHERE ((e.id = egresos.evento_id) AND (e.deleted_at IS NULL) AND (us.usuario_id = auth.uid()))))) AND ((evento_servicio_id IS NULL) OR (EXISTS ( SELECT 1
   FROM evento_servicios es
  WHERE ((es.id = egresos.evento_servicio_id) AND (es.evento_id = egresos.evento_id))))) AND ((catering_contrato_id IS NULL) OR (EXISTS ( SELECT 1
   FROM catering_contratos cc
  WHERE ((cc.id = egresos.catering_contrato_id) AND (cc.evento_id = egresos.evento_id) AND (cc.deleted_at IS NULL)))))));
create policy egresos_soft_delete_by_event_access on public.egresos as PERMISSIVE for UPDATE to public using (((deleted_at IS NULL) AND (is_admin() OR (EXISTS ( SELECT 1
   FROM (eventos e
     JOIN usuario_salon us ON ((us.salon_id = e.salon_id)))
  WHERE ((e.id = egresos.evento_id) AND (e.deleted_at IS NULL) AND (us.usuario_id = auth.uid()))))))) with check (((deleted_at IS NOT NULL) AND (is_admin() OR (EXISTS ( SELECT 1
   FROM (eventos e
     JOIN usuario_salon us ON ((us.salon_id = e.salon_id)))
  WHERE ((e.id = egresos.evento_id) AND (e.deleted_at IS NULL) AND (us.usuario_id = auth.uid())))))));
create policy software_eventos_active_users_only on public.egresos as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy egresos_catering_select on public.egresos as PERMISSIVE for SELECT to public using (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id)));
create policy egresos_catering_insert on public.egresos as PERMISSIVE for INSERT to public with check (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id)));
create policy egresos_catering_update on public.egresos as PERMISSIVE for UPDATE to public using (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id))) with check (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id)));
create policy "role permission inserts expenses" on public.egresos as RESTRICTIVE for INSERT to authenticated with check (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text], true));
create policy "role permission reads expenses" on public.egresos as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text, 'reportes'::text]));
create policy "role permission updates expenses" on public.egresos as RESTRICTIVE for UPDATE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text], true)) with check (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text], true));
create policy "role permission deletes expenses" on public.egresos as RESTRICTIVE for DELETE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text], true));
create policy egresos_externos_reportes_ejecutiva on public.egresos as PERMISSIVE for SELECT to authenticated using (((catering_contrato_id IS NOT NULL) AND (deleted_at IS NULL) AND current_user_has_screen_permission(ARRAY['reportes'::text], false) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.rol = 'ejecutiva_catering'::rol_usuario) AND u.activo))) AND (EXISTS ( SELECT 1
   FROM catering_contratos cc
  WHERE ((cc.id = egresos.catering_contrato_id) AND (cc.evento_id IS NULL) AND (cc.deleted_at IS NULL))))));
create policy egresos_vendedor_salon_restrict on public.egresos as RESTRICTIVE for SELECT to authenticated using ((current_user_is_active() AND ((NOT current_user_is_vendedor_active()) OR ((evento_id IS NOT NULL) AND usuario_tiene_evento(evento_id)))));
grant INSERT on public.egresos to anon;
grant SELECT on public.egresos to anon;
grant UPDATE on public.egresos to anon;
grant TRUNCATE on public.egresos to anon;
grant REFERENCES on public.egresos to anon;
grant TRIGGER on public.egresos to anon;
grant INSERT on public.egresos to authenticated;
grant SELECT on public.egresos to authenticated;
grant UPDATE on public.egresos to authenticated;
grant TRUNCATE on public.egresos to authenticated;
grant REFERENCES on public.egresos to authenticated;
grant TRIGGER on public.egresos to authenticated;
CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON public.egresos FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER egresos_prevent_update_except_soft_delete BEFORE UPDATE ON public.egresos FOR EACH ROW EXECUTE FUNCTION prevent_egresos_update_except_soft_delete();
CREATE TRIGGER egresos_set_updated_at BEFORE UPDATE ON public.egresos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validar_egreso_evento_catering BEFORE INSERT OR UPDATE OF evento_id, evento_servicio_id, catering_contrato_id ON public.egresos FOR EACH ROW EXECUTE FUNCTION validar_movimiento_evento_catering();
