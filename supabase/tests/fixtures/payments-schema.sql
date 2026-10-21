-- Catálogo real consultado por SELECT el 2026-10-21; sin datos de negocio.
-- Subconjunto para pruebas aisladas, NO es un baseline de producción.
-- auth.users y auth.uid son los únicos stubs del proveedor.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema public, auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
set check_function_bodies = off;
CREATE OR REPLACE FUNCTION public.audit_current_user_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and activo = true
      and rol = 'admin'::public.rol_usuario
  );
$function$
;
create type public.accion_audit as enum ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'ASSIGN', 'UNASSIGN');
create type public.categoria_catering_item as enum ('alimentos', 'bebidas_alcoholicas', 'adicional_alimentos', 'adicional_bebidas', 'adicional_otros');
create type public.categoria_servicio as enum ('salon', 'dj', 'ambientacion', 'catering', 'estacionamiento', 'fotografo', 'sadaic', 'sillas_tiffany', 'garantia', 'varios', 'tecnica');
create type public.estado_evento as enum ('borrador', 'confirmado', 'realizado', 'cancelado');
create type public.forma_pago as enum ('efectivo_pesos', 'efectivo_dolares', 'efectivo_euros', 'transferencia', 'cheque', 'retenciones');
create type public.moneda as enum ('ARS', 'USD', 'EUR');
create type public.rol_usuario as enum ('admin', 'vendedor', 'ejecutiva_catering');
create type public.tipo_actualizacion as enum ('ipc', 'porcentaje_fijo');

create table public.usuarios (
  id uuid not null,
  full_name text,
  email text not null,
  rol rol_usuario default 'vendedor'::rol_usuario not null,
  activo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.usuario_salon (
  usuario_id uuid not null,
  salon_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.roles (
  id uuid default gen_random_uuid() not null,
  nombre text not null,
  descripcion text,
  legacy_rol rol_usuario default 'vendedor'::rol_usuario not null,
  es_sistema boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.role_permissions (
  role_id uuid not null,
  screen text not null,
  can_manage boolean default false not null
);

create table public.usuario_roles (
  usuario_id uuid not null,
  role_id uuid not null,
  created_at timestamp with time zone default now() not null
);

create table public.salones (
  id uuid default gen_random_uuid() not null,
  nombre text not null,
  direccion text,
  activo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  descripcion text,
  capacidad integer,
  deleted_at timestamp with time zone
);

create table public.eventos (
  id uuid default gen_random_uuid() not null,
  salon_id uuid not null,
  vendedor_id uuid not null,
  cliente_nombre text not null,
  cliente_razon_social text,
  cliente_cuit_dni text,
  cliente_direccion text,
  cliente_ciudad text,
  cliente_direccion_factura text,
  cliente_contacto text,
  fecha_evento date not null,
  fecha_contrato date,
  tipo_evento text,
  espacio text,
  pax_adultos integer default 0,
  pax_jovenes integer default 0,
  pax_menores integer default 0,
  pax_bebes integer default 0,
  organizador_externo text,
  comision_organizador numeric(12,2) default 0,
  estado estado_evento default 'borrador'::estado_evento not null,
  observaciones text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  fecha_confirmacion_presupuesto date,
  fecha_carga date default CURRENT_DATE not null,
  subtipo_evento text,
  nombre_evento text,
  tiene_organizador boolean default false not null,
  organizador_nombre text,
  organizador_email text,
  organizador_telefono text
);

create table public.evento_servicios (
  id uuid default gen_random_uuid() not null,
  evento_id uuid not null,
  servicio_id uuid not null,
  precio_base numeric(12,2) default 0,
  adicionales_monto numeric(12,2) default 0,
  iva_porcentaje numeric(5,4) default 0.21,
  proveedor text,
  total_pagado numeric(12,2) default 0,
  saldo_pendiente numeric(12,2) generated always as ((((precio_base + adicionales_monto) * ((1)::numeric + iva_porcentaje)) - total_pagado)) stored,
  notas text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  iva_base_imponible numeric default 0 not null,
  total_sin_iva numeric generated always as ((COALESCE(precio_base, (0)::numeric) + COALESCE(adicionales_monto, (0)::numeric))) stored,
  total_con_iva numeric generated always as (((COALESCE(precio_base, (0)::numeric) + COALESCE(adicionales_monto, (0)::numeric)) + (COALESCE(iva_base_imponible, (0)::numeric) * COALESCE(iva_porcentaje, (0)::numeric)))) stored,
  comisiona_organizador boolean default false not null
);

create table public.catering_contratos (
  id uuid default gen_random_uuid() not null,
  evento_id uuid,
  ejecutiva_id uuid,
  tipo_servicio text,
  pax_comida integer default 0,
  pax_post_postre integer,
  pax_final integer default 0,
  pax_adultos integer default 0,
  pax_jovenes integer default 0,
  pax_menores integer default 0,
  pax_bebes integer default 0,
  precio_cierre_alimentos_sin_iva numeric(12,2) default 0,
  precio_cierre_bebidas_sin_iva numeric(12,2) default 0,
  iva_porcentaje numeric(5,4) default 0.21,
  comision_organizador_monto numeric(12,2) default 0,
  iva_comision numeric(12,2) default 0,
  emite_factura boolean default false,
  monto_con_factura numeric(12,2) default 0,
  monto_sin_factura numeric(12,2) default 0,
  factura_concepto text,
  factura_razon_social text,
  factura_cuit text,
  factura_direccion text,
  factura_contacto_admin text,
  total_sin_iva numeric(12,2) default 0,
  total_con_iva numeric(12,2) default 0,
  total_pagado numeric(12,2) default 0,
  saldo_pendiente numeric(12,2) generated always as ((total_con_iva - total_pagado)) stored,
  notas text,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  cliente_nombre text,
  cliente_razon_social text,
  cliente_cuit_dni text,
  cliente_contacto text,
  fecha_evento date,
  salon_id uuid,
  tipo_evento text,
  lugar_evento text
);

create table public.catering_items (
  id uuid default gen_random_uuid() not null,
  catering_contrato_id uuid not null,
  categoria categoria_catering_item not null,
  descripcion text not null,
  precio_unitario numeric(12,2) default 0,
  pax integer default 0,
  total numeric(12,2) generated always as ((precio_unitario * (pax)::numeric)) stored,
  orden smallint default 0,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.catering_precio_historial (
  id uuid default gen_random_uuid() not null,
  catering_contrato_id uuid not null,
  fecha date default CURRENT_DATE not null,
  motivo text,
  precio_unitario numeric not null,
  pax_adultos integer,
  pax_jovenes integer,
  pax_menores integer,
  pax_bebes integer,
  usuario_id uuid default auth.uid() not null,
  created_at timestamp with time zone default now() not null
);

create table public.pagos (
  id uuid default gen_random_uuid() not null,
  evento_id uuid,
  evento_servicio_id uuid,
  catering_contrato_id uuid,
  forma_pago forma_pago not null,
  fecha_pago date not null,
  moneda moneda default 'ARS'::moneda not null,
  tipo_cambio numeric(10,4) default 1,
  importe_moneda_original numeric(12,2) not null,
  importe_en_pesos numeric(12,2) generated always as ((importe_moneda_original * tipo_cambio)) stored,
  banco text,
  numero_cheque text,
  es_garantia boolean default false not null,
  notas text,
  registrado_por uuid,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  concepto text
);

create table public.audit_log (
  id uuid default gen_random_uuid() not null,
  tabla text not null,
  registro_id text not null,
  usuario_id uuid,
  accion accion_audit not null,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  created_at timestamp with time zone default now() not null
);

create table public.servicios_catalogo (
  id uuid default gen_random_uuid() not null,
  nombre text not null,
  categoria categoria_servicio not null,
  descripcion text,
  activo boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);
alter table public.evento_servicios add constraint evento_servicios_adicionales_nonnegative CHECK (((adicionales_monto IS NULL) OR (adicionales_monto >= (0)::numeric)));
alter table public.evento_servicios add constraint evento_servicios_iva_base_imponible_check CHECK ((iva_base_imponible >= (0)::numeric));
alter table public.evento_servicios add constraint evento_servicios_iva_nonnegative CHECK (((iva_porcentaje IS NULL) OR (iva_porcentaje >= (0)::numeric)));
alter table public.evento_servicios add constraint evento_servicios_pkey PRIMARY KEY (id);
alter table public.evento_servicios add constraint evento_servicios_precio_base_nonnegative CHECK (((precio_base IS NULL) OR (precio_base >= (0)::numeric)));
alter table public.evento_servicios add constraint evento_servicios_total_pagado_nonnegative CHECK (((total_pagado IS NULL) OR (total_pagado >= (0)::numeric)));
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.catering_contratos add constraint catering_contratos_comision_nonnegative CHECK (((comision_organizador_monto IS NULL) OR (comision_organizador_monto >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_iva_comision_nonnegative CHECK (((iva_comision IS NULL) OR (iva_comision >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_iva_nonnegative CHECK (((iva_porcentaje IS NULL) OR (iva_porcentaje >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_monto_con_factura_nonnegative CHECK (((monto_con_factura IS NULL) OR (monto_con_factura >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_monto_sin_factura_nonnegative CHECK (((monto_sin_factura IS NULL) OR (monto_sin_factura >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_pax_adultos_nonnegative CHECK (((pax_adultos IS NULL) OR (pax_adultos >= 0)));
alter table public.catering_contratos add constraint catering_contratos_pax_bebes_nonnegative CHECK (((pax_bebes IS NULL) OR (pax_bebes >= 0)));
alter table public.catering_contratos add constraint catering_contratos_pax_comida_nonnegative CHECK (((pax_comida IS NULL) OR (pax_comida >= 0)));
alter table public.catering_contratos add constraint catering_contratos_pax_final_nonnegative CHECK (((pax_final IS NULL) OR (pax_final >= 0)));
alter table public.catering_contratos add constraint catering_contratos_pax_jovenes_nonnegative CHECK (((pax_jovenes IS NULL) OR (pax_jovenes >= 0)));
alter table public.catering_contratos add constraint catering_contratos_pax_menores_nonnegative CHECK (((pax_menores IS NULL) OR (pax_menores >= 0)));
alter table public.catering_contratos add constraint catering_contratos_pax_post_postre_nonnegative CHECK (((pax_post_postre IS NULL) OR (pax_post_postre >= 0)));
alter table public.catering_contratos add constraint catering_contratos_pkey PRIMARY KEY (id);
alter table public.catering_contratos add constraint catering_contratos_precio_alimentos_nonnegative CHECK (((precio_cierre_alimentos_sin_iva IS NULL) OR (precio_cierre_alimentos_sin_iva >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_precio_bebidas_nonnegative CHECK (((precio_cierre_bebidas_sin_iva IS NULL) OR (precio_cierre_bebidas_sin_iva >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_standalone_requiere_cliente_chk CHECK (((evento_id IS NOT NULL) OR ((cliente_nombre IS NOT NULL) AND (length(btrim(cliente_nombre)) > 0) AND (fecha_evento IS NOT NULL))));
alter table public.catering_contratos add constraint catering_contratos_standalone_requiere_ejecutiva_chk CHECK (((evento_id IS NOT NULL) OR (ejecutiva_id IS NOT NULL)));
alter table public.catering_contratos add constraint catering_contratos_total_con_iva_nonnegative CHECK (((total_con_iva IS NULL) OR (total_con_iva >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_total_pagado_nonnegative CHECK (((total_pagado IS NULL) OR (total_pagado >= (0)::numeric)));
alter table public.catering_contratos add constraint catering_contratos_total_sin_iva_nonnegative CHECK (((total_sin_iva IS NULL) OR (total_sin_iva >= (0)::numeric)));
alter table public.catering_items add constraint catering_items_orden_nonnegative CHECK (((orden IS NULL) OR (orden >= 0)));
alter table public.catering_items add constraint catering_items_pax_nonnegative CHECK (((pax IS NULL) OR (pax >= 0)));
alter table public.catering_items add constraint catering_items_pkey PRIMARY KEY (id);
alter table public.catering_items add constraint catering_items_precio_unitario_nonnegative CHECK (((precio_unitario IS NULL) OR (precio_unitario >= (0)::numeric)));
alter table public.pagos add constraint pago_destino_exclusivo CHECK ((((evento_servicio_id IS NOT NULL) AND (catering_contrato_id IS NULL)) OR ((evento_servicio_id IS NULL) AND (catering_contrato_id IS NOT NULL))));
alter table public.pagos add constraint pagos_evento_o_catering_chk CHECK (((evento_id IS NOT NULL) OR (catering_contrato_id IS NOT NULL)));
alter table public.pagos add constraint pagos_importe_moneda_original_nonnegative CHECK ((importe_moneda_original >= (0)::numeric));
alter table public.pagos add constraint pagos_pkey PRIMARY KEY (id);
alter table public.pagos add constraint pagos_tipo_cambio_positive CHECK ((tipo_cambio > (0)::numeric));
alter table public.salones add constraint salones_capacidad_non_negative CHECK (((capacidad IS NULL) OR (capacidad >= 0)));
alter table public.salones add constraint salones_nombre_not_blank CHECK ((length(btrim(nombre)) > 0));
alter table public.salones add constraint salones_pkey PRIMARY KEY (id);
alter table public.servicios_catalogo add constraint servicios_catalogo_nombre_categoria_key UNIQUE (nombre, categoria);
alter table public.servicios_catalogo add constraint servicios_catalogo_pkey PRIMARY KEY (id);
alter table public.catering_precio_historial add constraint catering_precio_historial_motivo_chk CHECK (((motivo IS NULL) OR (length(btrim(motivo)) > 0)));
alter table public.catering_precio_historial add constraint catering_precio_historial_pax_adultos_chk CHECK (((pax_adultos IS NULL) OR (pax_adultos >= 0)));
alter table public.catering_precio_historial add constraint catering_precio_historial_pax_bebes_chk CHECK (((pax_bebes IS NULL) OR (pax_bebes >= 0)));
alter table public.catering_precio_historial add constraint catering_precio_historial_pax_jovenes_chk CHECK (((pax_jovenes IS NULL) OR (pax_jovenes >= 0)));
alter table public.catering_precio_historial add constraint catering_precio_historial_pax_menores_chk CHECK (((pax_menores IS NULL) OR (pax_menores >= 0)));
alter table public.catering_precio_historial add constraint catering_precio_historial_pkey PRIMARY KEY (id);
alter table public.catering_precio_historial add constraint catering_precio_historial_precio_chk CHECK ((precio_unitario >= (0)::numeric));
alter table public.usuarios add constraint usuarios_email_key UNIQUE (email);
alter table public.usuarios add constraint usuarios_pkey PRIMARY KEY (id);
alter table public.usuario_salon add constraint usuario_salon_pkey PRIMARY KEY (usuario_id, salon_id);
alter table public.eventos add constraint eventos_comision_organizador_nonnegative CHECK (((comision_organizador IS NULL) OR (comision_organizador >= (0)::numeric)));
alter table public.eventos add constraint eventos_pax_adultos_nonnegative CHECK (((pax_adultos IS NULL) OR (pax_adultos >= 0)));
alter table public.eventos add constraint eventos_pax_bebes_nonnegative CHECK (((pax_bebes IS NULL) OR (pax_bebes >= 0)));
alter table public.eventos add constraint eventos_pax_jovenes_nonnegative CHECK (((pax_jovenes IS NULL) OR (pax_jovenes >= 0)));
alter table public.eventos add constraint eventos_pax_menores_nonnegative CHECK (((pax_menores IS NULL) OR (pax_menores >= 0)));
alter table public.eventos add constraint eventos_pkey PRIMARY KEY (id);
alter table public.roles add constraint roles_nombre_check CHECK ((length(btrim(nombre)) > 0));
alter table public.roles add constraint roles_nombre_key UNIQUE (nombre);
alter table public.roles add constraint roles_pkey PRIMARY KEY (id);
alter table public.role_permissions add constraint role_permissions_pkey PRIMARY KEY (role_id, screen);
alter table public.role_permissions add constraint role_permissions_screen_check CHECK ((screen = ANY (ARRAY['dashboard'::text, 'eventos'::text, 'catering'::text, 'salones'::text, 'pagos'::text, 'reportes'::text])));
alter table public.usuario_roles add constraint usuario_roles_pkey PRIMARY KEY (usuario_id);
alter table public.evento_servicios add constraint evento_servicios_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE;
alter table public.evento_servicios add constraint evento_servicios_servicio_id_fkey FOREIGN KEY (servicio_id) REFERENCES servicios_catalogo(id);
alter table public.audit_log add constraint audit_log_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
alter table public.catering_contratos add constraint catering_contratos_ejecutiva_id_fkey FOREIGN KEY (ejecutiva_id) REFERENCES usuarios(id);
alter table public.catering_contratos add constraint catering_contratos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE;
alter table public.catering_contratos add constraint catering_contratos_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES salones(id) ON DELETE RESTRICT;
alter table public.catering_items add constraint catering_items_catering_contrato_id_fkey FOREIGN KEY (catering_contrato_id) REFERENCES catering_contratos(id) ON DELETE CASCADE;
alter table public.pagos add constraint pagos_catering_contrato_id_fkey FOREIGN KEY (catering_contrato_id) REFERENCES catering_contratos(id);
alter table public.pagos add constraint pagos_evento_id_fkey FOREIGN KEY (evento_id) REFERENCES eventos(id) ON DELETE CASCADE;
alter table public.pagos add constraint pagos_evento_servicio_id_fkey FOREIGN KEY (evento_servicio_id) REFERENCES evento_servicios(id);
alter table public.pagos add constraint pagos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id);
alter table public.catering_precio_historial add constraint catering_precio_historial_catering_contrato_id_fkey FOREIGN KEY (catering_contrato_id) REFERENCES catering_contratos(id) ON DELETE RESTRICT;
alter table public.catering_precio_historial add constraint catering_precio_historial_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
alter table public.usuarios add constraint usuarios_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.usuario_salon add constraint usuario_salon_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES salones(id) ON DELETE CASCADE;
alter table public.usuario_salon add constraint usuario_salon_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;
alter table public.eventos add constraint eventos_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES salones(id);
alter table public.eventos add constraint eventos_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES usuarios(id);
alter table public.role_permissions add constraint role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;
alter table public.usuario_roles add constraint usuario_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT;
alter table public.usuario_roles add constraint usuario_roles_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS rol_usuario
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT u.rol
  FROM public.usuarios u
  WHERE u.id = auth.uid()
    AND u.activo = TRUE
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select usuario.rol = 'admin'::public.rol_usuario
        and usuario.activo = true
      from public.usuarios as usuario
      where usuario.id = auth.uid()
      limit 1
    ),
    false
  );
$function$
;

CREATE OR REPLACE FUNCTION public.usuario_tiene_evento(p_evento_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT COALESCE(
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM eventos e
      WHERE e.id = p_evento_id
        AND e.deleted_at IS NULL
        AND usuario_tiene_salon(e.salon_id)
    ),
    FALSE
  );
$function$
;

CREATE OR REPLACE FUNCTION public.usuario_tiene_evento_servicio(p_evento_servicio_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT COALESCE(
    is_admin()
    OR EXISTS (
      SELECT 1
      FROM evento_servicios es
      WHERE es.id = p_evento_servicio_id
        AND usuario_tiene_evento(es.evento_id)
    ),
    FALSE
  );
$function$
;

CREATE OR REPLACE FUNCTION public.usuario_tiene_salon(p_salon_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
    from public.usuario_salon
    where usuario_id = auth.uid()
      and salon_id = p_salon_id
  );
$function$
;

CREATE OR REPLACE FUNCTION public.fn_restrict_usuario_self_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
BEGIN
  -- Allow privileged/server-side operations.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins can update users.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin users can only update their own row.
  IF OLD.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'No autorizado para modificar otro usuario'
      USING ERRCODE = '42501';
  END IF;

  -- Non-admin users cannot modify critical fields.
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.rol IS DISTINCT FROM OLD.rol
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'No autorizado para modificar campos criticos del usuario'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.fn_audit_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_usuario_id UUID;
BEGIN
  BEGIN
    v_usuario_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_usuario_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tabla, registro_id, usuario_id, accion, datos_nuevos)
    VALUES (TG_TABLE_NAME, NEW.id, v_usuario_id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (tabla, registro_id, usuario_id, accion, datos_anteriores, datos_nuevos)
    VALUES (TG_TABLE_NAME, NEW.id, v_usuario_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (tabla, registro_id, usuario_id, accion, datos_anteriores)
    VALUES (TG_TABLE_NAME, OLD.id, v_usuario_id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$function$
;

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

CREATE OR REPLACE FUNCTION public.fn_actualizar_totales_catering()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_old_contrato_id UUID;
  v_new_contrato_id UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_contrato_id := OLD.catering_contrato_id;

    UPDATE catering_contratos cc
    SET
      total_sin_iva = totals.total_sin_iva,
      total_con_iva = totals.total_sin_iva * (1 + COALESCE(cc.iva_porcentaje, 0.21))
    FROM (
      SELECT COALESCE(SUM(ci.total), 0) AS total_sin_iva
      FROM catering_items ci
      WHERE ci.catering_contrato_id = v_old_contrato_id
    ) totals
    WHERE cc.id = v_old_contrato_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_contrato_id := NEW.catering_contrato_id;

    IF v_new_contrato_id IS DISTINCT FROM v_old_contrato_id THEN
      UPDATE catering_contratos cc
      SET
        total_sin_iva = totals.total_sin_iva,
        total_con_iva = totals.total_sin_iva * (1 + COALESCE(cc.iva_porcentaje, 0.21))
      FROM (
        SELECT COALESCE(SUM(ci.total), 0) AS total_sin_iva
        FROM catering_items ci
        WHERE ci.catering_contrato_id = v_new_contrato_id
      ) totals
      WHERE cc.id = v_new_contrato_id;
    END IF;
  END IF;

  RETURN NULL;
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

CREATE OR REPLACE FUNCTION public.current_user_is_admin_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.rol = 'admin'::rol_usuario
      AND u.activo = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_is_vendedor_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = auth.uid()
      AND u.rol = 'vendedor'::rol_usuario
      AND u.activo = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.usuario_asignado_a_salon(p_usuario_id uuid, p_salon_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuario_salon us
    JOIN public.salones s ON s.id = us.salon_id
    JOIN public.usuarios u ON u.id = us.usuario_id
    WHERE us.usuario_id = p_usuario_id
      AND us.salon_id = p_salon_id
      AND u.rol = 'vendedor'::rol_usuario
      AND u.activo = true
      AND s.activo = true
      AND s.deleted_at IS NULL
  );
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recalcular_fecha_contrato_evento(p_evento_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_evento_id is null then
    return;
  end if;

  update public.eventos e
  set fecha_contrato = (
    select min(p.fecha_pago)
    from public.pagos p
    where p.evento_id = p_evento_id
      and p.deleted_at is null
  )
  where e.id = p_evento_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_recalcular_fecha_contrato_evento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'DELETE' then
    perform public.recalcular_fecha_contrato_evento(old.evento_id);
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.evento_id is distinct from new.evento_id then
      perform public.recalcular_fecha_contrato_evento(old.evento_id);
      perform public.recalcular_fecha_contrato_evento(new.evento_id);
    else
      perform public.recalcular_fecha_contrato_evento(new.evento_id);
    end if;

    return new;
  end if;

  perform public.recalcular_fecha_contrato_evento(new.evento_id);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.aplicar_totales_evento_servicio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_totales record;
begin
  select *
  into v_totales
  from public.calcular_totales_evento_servicio(
    new.precio_base,
    new.adicionales_monto,
    new.iva_base_imponible,
    new.iva_porcentaje,
    new.total_pagado
  );

  new.total_sin_iva := v_totales.total_sin_iva;
  new.total_con_iva := v_totales.total_con_iva;
  new.saldo_pendiente := v_totales.saldo_pendiente;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_is_active()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and activo = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.audit_sanitize_jsonb(p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  if p_value is null then
    return null;
  end if;

  case jsonb_typeof(p_value)
    when 'object' then
      select coalesce(
        jsonb_object_agg(
          item.key,
          public.audit_sanitize_jsonb(item.value)
        ),
        '{}'::jsonb
      )
      into result
      from jsonb_each(p_value) as item
      where lower(item.key) not in (
        'updated_at',
        'password',
        'passwd',
        'password_hash',
        'access_token',
        'refresh_token',
        'authorization',
        'cookie',
        'credentials',
        'credential',
        'session'
      )
      and lower(item.key) !~
        '(password|passwd|token|secret|api[_-]?key|authorization|cookie|credential)';

      return result;

    when 'array' then
      select coalesce(
        jsonb_agg(
          public.audit_sanitize_jsonb(item.value)
          order by item.position
        ),
        '[]'::jsonb
      )
      into result
      from jsonb_array_elements(p_value)
        with ordinality as item(value, position);

      return result;

    else
      return p_value;
  end case;
end
$function$
;

CREATE OR REPLACE FUNCTION public.audit_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id uuid;

  raw_before jsonb;
  raw_after jsonb;

  before_row jsonb;
  after_row jsonb;

  before_changes jsonb;
  after_changes jsonb;

  record_id text := '';
  id_column text;
  id_value text;

  audit_action text := tg_op;
begin
  -- Defensa adicional contra recursión o uso accidental fuera de public.
  if tg_table_schema <> 'public'
    or tg_table_name = 'audit_log'
  then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;


  raw_before :=
    case
      when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old)
      else null
    end;

  raw_after :=
    case
      when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new)
      else null
    end;


  before_row := public.audit_sanitize_jsonb(raw_before);
  after_row := public.audit_sanitize_jsonb(raw_after);


  -- Evita registrar actualizaciones donde solo cambiaron campos
  -- técnicos excluidos, como updated_at.
  if tg_op = 'UPDATE'
    and before_row is not distinct from after_row
  then
    return new;
  end if;


  -- Para UPDATE se almacenan solamente los campos modificados.
  if tg_op = 'UPDATE' then
    select
      coalesce(
        jsonb_object_agg(
          changed_keys.key,
          before_row -> changed_keys.key
        ),
        '{}'::jsonb
      ),
      coalesce(
        jsonb_object_agg(
          changed_keys.key,
          after_row -> changed_keys.key
        ),
        '{}'::jsonb
      )
    into before_changes, after_changes
    from (
      select key
      from jsonb_object_keys(coalesce(before_row, '{}'::jsonb)) as key

      union

      select key
      from jsonb_object_keys(coalesce(after_row, '{}'::jsonb)) as key
    ) as changed_keys
    where (before_row -> changed_keys.key)
      is distinct from
      (after_row -> changed_keys.key);

    -- Defensa adicional por si no quedó ningún cambio funcional.
    if before_changes = '{}'::jsonb
      and after_changes = '{}'::jsonb
    then
      return new;
    end if;
  else
    before_changes := before_row;
    after_changes := after_row;
  end if;


  -- Acciones especiales.
  if tg_table_name = 'usuario_salon'
    and tg_op = 'INSERT'
  then
    audit_action := 'ASSIGN';

  elsif tg_table_name = 'usuario_salon'
    and tg_op = 'DELETE'
  then
    audit_action := 'UNASSIGN';

  elsif tg_op = 'UPDATE'
    and coalesce(raw_before ->> 'deleted_at', '') = ''
    and coalesce(raw_after ->> 'deleted_at', '') <> ''
  then
    audit_action := 'SOFT_DELETE';

  elsif tg_op = 'UPDATE'
    and coalesce(raw_before ->> 'deleted_at', '') <> ''
    and coalesce(raw_after ->> 'deleted_at', '') = ''
  then
    audit_action := 'RESTORE';
  end if;


  -- Por defecto se utiliza la columna id.
  -- Para claves compuestas, el trigger recibe una lista de columnas,
  -- por ejemplo: usuario_id,salon_id.
  foreach id_column in array string_to_array(
    coalesce(nullif(tg_argv[0], ''), 'id'),
    ','
  )
  loop
    id_column := btrim(id_column);

    id_value := coalesce(
      raw_after ->> id_column,
      raw_before ->> id_column
    );

    record_id :=
      record_id
      || case when record_id = '' then '' else ':' end
      || coalesce(id_value, '-');
  end loop;


  -- El usuario responsable se obtiene del JWT de Supabase.
  -- No se acepta un usuario enviado libremente desde el cliente.
  begin
    actor_id := auth.uid();
  exception
    when others then
      actor_id := null;
  end;


  insert into public.audit_log (
    accion,
    datos_anteriores,
    datos_nuevos,
    registro_id,
    tabla,
    usuario_id
  )
  values (
    audit_action::public.accion_audit,
    before_changes,
    after_changes,
    record_id,
    tg_table_name,
    actor_id
  );


  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.usuario_tiene_catering_contrato(p_catering_contrato_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_evento_id uuid;
  v_ejecutiva_id uuid;
  v_deleted_at timestamptz;
begin
  -- Admin activo.
  if public.current_user_is_active_admin() then
    return true;
  end if;

  -- Usuarios inactivos no tienen acceso.
  if not public.current_user_is_active() then
    return false;
  end if;

  select
    evento_id,
    ejecutiva_id,
    deleted_at
  into
    v_evento_id,
    v_ejecutiva_id,
    v_deleted_at
  from public.catering_contratos
  where id = p_catering_contrato_id;

  if not found then
    return false;
  end if;

  -- Registros soft-deleted quedan visibles únicamente para admin.
  if v_deleted_at is not null then
    return false;
  end if;

  -- Ejecutiva asignada.
  if v_ejecutiva_id = auth.uid() then
    return true;
  end if;

  -- Para caterings vinculados a eventos también hereda acceso
  -- quien ya tiene acceso al evento.
  if v_evento_id is not null then
    return public.usuario_tiene_evento(v_evento_id);
  end if;

  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validar_catering_contrato_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Si hay ejecutiva, debe ser un usuario activo.
  if new.ejecutiva_id is not null then
    if not exists (
      select 1
      from public.usuarios u
      where u.id = new.ejecutiva_id
        and u.activo = true
    ) then
      raise exception 'La ejecutiva asignada no existe o está inactiva';
    end if;
  end if;

  -- En INSERT el RLS controla quién puede crear/vincular.
  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Admin puede modificar asociaciones.
  if public.current_user_is_active_admin() then
    return new;
  end if;

  if not public.current_user_is_active() then
    raise exception 'Usuario inactivo';
  end if;


  -- ----------------------------------------------------------
  -- Cambio de evento asociado.
  -- Debe tener acceso al evento anterior (si existía)
  -- y al nuevo evento (si existe).
  -- ----------------------------------------------------------
  if old.evento_id is distinct from new.evento_id then

    if old.evento_id is not null
       and not public.usuario_tiene_evento(old.evento_id) then
      raise exception
        'No tiene permisos para modificar la asociación del evento actual';
    end if;

    if new.evento_id is not null
       and not public.usuario_tiene_evento(new.evento_id) then
      raise exception
        'No tiene permisos para asociar este catering al evento indicado';
    end if;

  end if;


  -- ----------------------------------------------------------
  -- Cambio de ejecutiva.
  --
  -- En catering vinculado a evento:
  -- solamente alguien con permisos del evento puede reasignarla.
  --
  -- En catering standalone:
  -- solamente admin puede reasignarla.
  -- ----------------------------------------------------------
  if old.ejecutiva_id is distinct from new.ejecutiva_id then

    if new.evento_id is null then
      raise exception
        'Solo un administrador puede reasignar la ejecutiva de un catering externo';
    end if;

    if not public.usuario_tiene_evento(new.evento_id) then
      raise exception
        'No tiene permisos para reasignar la ejecutiva de este catering';
    end if;

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

CREATE OR REPLACE FUNCTION public.current_user_has_screen_permission(p_screens text[], p_manage boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.usuarios u
    where u.id = auth.uid()
      and u.activo
      and (
        u.rol = 'admin'
        or exists (
          select 1
          from public.usuario_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          where ur.usuario_id = u.id
            and rp.screen = any(p_screens)
            and (not p_manage or rp.can_manage)
        )
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_is_active_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.usuarios
    where id = auth.uid()
      and rol = 'admin'::public.rol_usuario
      and activo = true
  );
$function$
;

CREATE OR REPLACE FUNCTION public.calcular_totales_evento_servicio(p_precio_base numeric, p_adicionales_monto numeric, p_iva_base_imponible numeric, p_iva_porcentaje numeric, p_total_pagado numeric)
 RETURNS TABLE(total_sin_iva numeric, total_con_iva numeric, saldo_pendiente numeric)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with valores as (
    select
      coalesce(p_precio_base, 0)::numeric as precio_base,
      coalesce(p_adicionales_monto, 0)::numeric as adicionales_monto,
      coalesce(p_iva_base_imponible, 0)::numeric as iva_base_imponible,
      coalesce(p_iva_porcentaje, 0)::numeric as iva_porcentaje,
      coalesce(p_total_pagado, 0)::numeric as total_pagado
  ),
  totales as (
    select
      precio_base + adicionales_monto as total_sin_iva,
      precio_base
        + adicionales_monto
        + (iva_base_imponible * iva_porcentaje) as total_con_iva,
      total_pagado
    from valores
  )
  select
    totales.total_sin_iva,
    totales.total_con_iva,
    totales.total_con_iva - totales.total_pagado
  from totales;
$function$
;

CREATE OR REPLACE FUNCTION public.validar_lugar_catering_externo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.evento_id is null and nullif(btrim(new.lugar_evento), '') is null then
    raise exception 'El lugar es obligatorio para un catering externo';
  end if;
  return new;
end;
$function$
;
CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON public.evento_servicios FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_evento_servicios AFTER INSERT OR DELETE OR UPDATE ON public.evento_servicios FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_evento_servicios_updated_at BEFORE UPDATE ON public.evento_servicios FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER zz_evento_servicios_calcular_totales BEFORE INSERT OR UPDATE ON public.evento_servicios FOR EACH ROW EXECUTE FUNCTION aplicar_totales_evento_servicio();
CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON public.catering_contratos FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_catering_contratos AFTER INSERT OR DELETE OR UPDATE ON public.catering_contratos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_catering_contratos_updated_at BEFORE UPDATE ON public.catering_contratos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validar_catering_contrato_write BEFORE INSERT OR UPDATE ON public.catering_contratos FOR EACH ROW EXECUTE FUNCTION validar_catering_contrato_write();
CREATE TRIGGER validar_lugar_catering_externo_insert BEFORE INSERT ON public.catering_contratos FOR EACH ROW EXECUTE FUNCTION validar_lugar_catering_externo();
CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON public.catering_items FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_actualizar_totales_catering AFTER INSERT OR DELETE OR UPDATE ON public.catering_items FOR EACH ROW EXECUTE FUNCTION fn_actualizar_totales_catering();
CREATE TRIGGER trg_catering_items_updated_at BEFORE UPDATE ON public.catering_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER recalcular_fecha_contrato_evento_on_pagos AFTER INSERT OR DELETE OR UPDATE OF fecha_pago, deleted_at, evento_id ON public.pagos FOR EACH ROW EXECUTE FUNCTION trg_recalcular_fecha_contrato_evento();
CREATE TRIGGER trg_actualizar_totales_pagos AFTER INSERT OR DELETE OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION fn_actualizar_totales_pagos();
CREATE TRIGGER trg_audit_pagos AFTER INSERT OR DELETE OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_pagos_updated_at BEFORE UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validar_pago_evento BEFORE INSERT OR UPDATE ON public.pagos FOR EACH ROW EXECUTE FUNCTION fn_validar_pago_evento();
CREATE TRIGGER trg_validar_pago_evento_catering BEFORE INSERT OR UPDATE OF evento_id, evento_servicio_id, catering_contrato_id ON public.pagos FOR EACH ROW EXECUTE FUNCTION validar_movimiento_evento_catering();
CREATE TRIGGER audit_row_change AFTER INSERT OR DELETE OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER trg_audit_eventos AFTER INSERT OR DELETE OR UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION fn_audit_log();
CREATE TRIGGER trg_eventos_updated_at BEFORE UPDATE ON public.eventos FOR EACH ROW EXECUTE FUNCTION set_updated_at();

create view public.v_resumen_evento as  SELECT e.id,
    e.cliente_nombre,
    e.estado,
    e.fecha_evento,
    s.nombre AS salon,
    u.full_name AS vendedor,
    COALESCE(servicios.total_servicios, 0::numeric) AS total_servicios,
    COALESCE(servicios.total_pagado_servicios, 0::numeric) AS total_pagado_servicios,
    COALESCE(servicios.total_servicios, 0::numeric) - COALESCE(servicios.total_pagado_servicios, 0::numeric) AS saldo_servicios,
    COALESCE(catering.total_catering, 0::numeric) AS total_catering,
    COALESCE(catering.total_pagado_catering, 0::numeric) AS total_pagado_catering,
    COALESCE(catering.total_catering, 0::numeric) - COALESCE(catering.total_pagado_catering, 0::numeric) AS saldo_catering
   FROM eventos e
     LEFT JOIN salones s ON s.id = e.salon_id
     LEFT JOIN usuarios u ON u.id = e.vendedor_id
     LEFT JOIN ( SELECT evento_servicios.evento_id,
            sum(COALESCE(evento_servicios.total_con_iva, 0::numeric)) AS total_servicios,
            sum(COALESCE(evento_servicios.total_pagado, 0::numeric)) AS total_pagado_servicios
           FROM evento_servicios
          GROUP BY evento_servicios.evento_id) servicios ON servicios.evento_id = e.id
     LEFT JOIN ( SELECT catering_contratos.evento_id,
            sum(COALESCE(catering_contratos.total_con_iva, 0::numeric)) AS total_catering,
            sum(COALESCE(catering_contratos.total_pagado, 0::numeric)) AS total_pagado_catering
           FROM catering_contratos
          WHERE catering_contratos.deleted_at IS NULL
          GROUP BY catering_contratos.evento_id) catering ON catering.evento_id = e.id
  WHERE e.deleted_at IS NULL;
create policy "evento_servicios_delete_admin" on public.evento_servicios as PERMISSIVE for DELETE to public using (is_admin());
create policy "evento_servicios_insert_assigned" on public.evento_servicios as PERMISSIVE for INSERT to public with check (usuario_tiene_evento(evento_id));
create policy "evento_servicios_select_assigned" on public.evento_servicios as PERMISSIVE for SELECT to public using (usuario_tiene_evento(evento_id));
create policy "evento_servicios_update_assigned" on public.evento_servicios as PERMISSIVE for UPDATE to public using (usuario_tiene_evento(evento_id)) with check (usuario_tiene_evento(evento_id));
create policy "role permission deletes event services" on public.evento_servicios as RESTRICTIVE for DELETE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text], true));
create policy "role permission inserts event services" on public.evento_servicios as RESTRICTIVE for INSERT to authenticated with check (current_user_has_screen_permission(ARRAY['eventos'::text], true));
create policy "role permission reads event services" on public.evento_servicios as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'reportes'::text]));
create policy "role permission updates event services" on public.evento_servicios as RESTRICTIVE for UPDATE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text], true)) with check (current_user_has_screen_permission(ARRAY['eventos'::text], true));
create policy "software_eventos_active_users_only" on public.evento_servicios as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "audit_log_select_active_admin" on public.audit_log as PERMISSIVE for SELECT to authenticated using (audit_current_user_is_admin());
create policy "catering_contratos_delete_admin" on public.catering_contratos as PERMISSIVE for DELETE to public using (is_admin());
create policy "catering_contratos_insert_access" on public.catering_contratos as PERMISSIVE for INSERT to public with check ((current_user_is_active_admin() OR (current_user_is_active() AND (((evento_id IS NULL) AND (ejecutiva_id = auth.uid())) OR ((evento_id IS NOT NULL) AND usuario_tiene_evento(evento_id))))));
create policy "catering_contratos_insert_assigned" on public.catering_contratos as PERMISSIVE for INSERT to public with check (usuario_tiene_evento(evento_id));
create policy "catering_contratos_select_access" on public.catering_contratos as PERMISSIVE for SELECT to public using (usuario_tiene_catering_contrato(id));
create policy "catering_contratos_select_assigned" on public.catering_contratos as PERMISSIVE for SELECT to public using ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_evento(evento_id))));
create policy "catering_contratos_update_access" on public.catering_contratos as PERMISSIVE for UPDATE to public using (usuario_tiene_catering_contrato(id)) with check ((current_user_is_active_admin() OR (current_user_is_active() AND ((ejecutiva_id = auth.uid()) OR ((evento_id IS NOT NULL) AND usuario_tiene_evento(evento_id))))));
create policy "catering_contratos_update_assigned" on public.catering_contratos as PERMISSIVE for UPDATE to public using ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_evento(evento_id)))) with check ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_evento(evento_id))));
create policy "catering_externo_reportes_ejecutiva" on public.catering_contratos as PERMISSIVE for SELECT to authenticated using (((evento_id IS NULL) AND (deleted_at IS NULL) AND current_user_has_screen_permission(ARRAY['reportes'::text], false) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.rol = 'ejecutiva_catering'::rol_usuario) AND u.activo)))));
create policy "catering_vendedor_salon_restrict" on public.catering_contratos as RESTRICTIVE for SELECT to authenticated using ((current_user_is_active() AND ((NOT current_user_is_vendedor_active()) OR ((evento_id IS NOT NULL) AND usuario_tiene_evento(evento_id)))));
create policy "role permission deletes catering" on public.catering_contratos as RESTRICTIVE for DELETE to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "role permission inserts catering" on public.catering_contratos as RESTRICTIVE for INSERT to authenticated with check (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "role permission reads catering" on public.catering_contratos as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text, 'eventos'::text, 'reportes'::text]));
create policy "role permission updates catering" on public.catering_contratos as RESTRICTIVE for UPDATE to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text], true)) with check (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "software_eventos_active_users_only" on public.catering_contratos as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "catering_items_delete_admin" on public.catering_items as PERMISSIVE for DELETE to public using (is_admin());
create policy "catering_items_insert_assigned" on public.catering_items as PERMISSIVE for INSERT to public with check (usuario_tiene_catering_contrato(catering_contrato_id));
create policy "catering_items_select_assigned" on public.catering_items as PERMISSIVE for SELECT to public using (usuario_tiene_catering_contrato(catering_contrato_id));
create policy "catering_items_update_assigned" on public.catering_items as PERMISSIVE for UPDATE to public using (usuario_tiene_catering_contrato(catering_contrato_id)) with check (usuario_tiene_catering_contrato(catering_contrato_id));
create policy "role permission deletes catering items" on public.catering_items as RESTRICTIVE for DELETE to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "role permission inserts catering items" on public.catering_items as RESTRICTIVE for INSERT to authenticated with check (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "role permission reads catering items" on public.catering_items as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text, 'eventos'::text, 'reportes'::text]));
create policy "role permission updates catering items" on public.catering_items as RESTRICTIVE for UPDATE to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text], true)) with check (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "software_eventos_active_users_only" on public.catering_items as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "pagos_catering_insert" on public.pagos as PERMISSIVE for INSERT to public with check (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id)));
create policy "pagos_catering_select" on public.pagos as PERMISSIVE for SELECT to public using (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id)));
create policy "pagos_catering_update" on public.pagos as PERMISSIVE for UPDATE to public using (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id))) with check (((catering_contrato_id IS NOT NULL) AND current_user_is_active() AND usuario_tiene_catering_contrato(catering_contrato_id)));
create policy "pagos_delete_admin" on public.pagos as PERMISSIVE for DELETE to public using (is_admin());
create policy "pagos_externos_reportes_ejecutiva" on public.pagos as PERMISSIVE for SELECT to authenticated using (((catering_contrato_id IS NOT NULL) AND (deleted_at IS NULL) AND current_user_has_screen_permission(ARRAY['reportes'::text], false) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = ( SELECT auth.uid() AS uid)) AND (u.rol = 'ejecutiva_catering'::rol_usuario) AND u.activo))) AND (EXISTS ( SELECT 1
   FROM catering_contratos cc
  WHERE ((cc.id = pagos.catering_contrato_id) AND (cc.evento_id IS NULL) AND (cc.deleted_at IS NULL))))));
create policy "pagos_insert_assigned" on public.pagos as PERMISSIVE for INSERT to public with check ((is_admin() OR ((registrado_por = auth.uid()) AND usuario_tiene_evento(evento_id))));
create policy "pagos_select_assigned" on public.pagos as PERMISSIVE for SELECT to public using ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_evento(evento_id))));
create policy "pagos_update_assigned" on public.pagos as PERMISSIVE for UPDATE to public using ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_evento(evento_id)))) with check ((is_admin() OR ((registrado_por = auth.uid()) AND usuario_tiene_evento(evento_id))));
create policy "pagos_vendedor_salon_restrict" on public.pagos as RESTRICTIVE for SELECT to authenticated using ((current_user_is_active() AND ((NOT current_user_is_vendedor_active()) OR ((evento_id IS NOT NULL) AND usuario_tiene_evento(evento_id)))));
create policy "role permission deletes payments" on public.pagos as RESTRICTIVE for DELETE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text, 'pagos'::text], true));
create policy "role permission inserts payments" on public.pagos as RESTRICTIVE for INSERT to authenticated with check (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text, 'pagos'::text], true));
create policy "role permission reads payments" on public.pagos as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text, 'pagos'::text, 'reportes'::text]));
create policy "role permission updates payments" on public.pagos as RESTRICTIVE for UPDATE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text, 'pagos'::text], true)) with check (current_user_has_screen_permission(ARRAY['eventos'::text, 'catering'::text, 'pagos'::text], true));
create policy "software_eventos_active_users_only" on public.pagos as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "Admins can manage salones" on public.salones as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "Vendedores can read assigned salones" on public.salones as PERMISSIVE for SELECT to authenticated using (((activo = true) AND (deleted_at IS NULL) AND usuario_tiene_salon(id)));
create policy "role permission reads salons" on public.salones as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['salones'::text, 'eventos'::text, 'catering'::text, 'reportes'::text]));
create policy "role permission updates assigned salons" on public.salones as RESTRICTIVE for UPDATE to authenticated using ((current_user_has_screen_permission(ARRAY['salones'::text], true) AND (current_user_is_active_admin() OR usuario_tiene_salon(id)))) with check ((current_user_has_screen_permission(ARRAY['salones'::text], true) AND (current_user_is_active_admin() OR usuario_tiene_salon(id))));
create policy "salones_admin_delete" on public.salones as PERMISSIVE for DELETE to authenticated using (current_user_is_admin_active());
create policy "salones_admin_insert" on public.salones as PERMISSIVE for INSERT to authenticated with check (current_user_is_admin_active());
create policy "salones_admin_select_all" on public.salones as PERMISSIVE for SELECT to authenticated using (current_user_is_admin_active());
create policy "salones_admin_update" on public.salones as PERMISSIVE for UPDATE to authenticated using (current_user_is_admin_active()) with check (current_user_is_admin_active());
create policy "salones_vendedor_select_assigned_active" on public.salones as PERMISSIVE for SELECT to authenticated using (((activo = true) AND (deleted_at IS NULL) AND current_user_is_vendedor_active() AND usuario_asignado_a_salon(auth.uid(), id)));
create policy "software_eventos_active_users_only" on public.salones as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "servicios_catalogo_admin_all" on public.servicios_catalogo as PERMISSIVE for ALL to public using (is_admin()) with check (is_admin());
create policy "servicios_catalogo_select_authenticated" on public.servicios_catalogo as PERMISSIVE for SELECT to public using ((auth.uid() IS NOT NULL));
create policy "software_eventos_active_users_only" on public.servicios_catalogo as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "catering_precio_historial_insert" on public.catering_precio_historial as PERMISSIVE for INSERT to public with check ((usuario_tiene_catering_contrato(catering_contrato_id) AND (current_user_is_active_admin() OR (usuario_id = auth.uid()))));
create policy "catering_precio_historial_select" on public.catering_precio_historial as PERMISSIVE for SELECT to public using (usuario_tiene_catering_contrato(catering_contrato_id));
create policy "role permission deletes catering prices" on public.catering_precio_historial as RESTRICTIVE for DELETE to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "role permission inserts catering prices" on public.catering_precio_historial as RESTRICTIVE for INSERT to authenticated with check (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "role permission reads catering prices" on public.catering_precio_historial as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text, 'eventos'::text, 'reportes'::text]));
create policy "role permission updates catering prices" on public.catering_precio_historial as RESTRICTIVE for UPDATE to authenticated using (current_user_has_screen_permission(ARRAY['catering'::text], true)) with check (current_user_has_screen_permission(ARRAY['catering'::text], true));
create policy "software_eventos_active_users_only" on public.usuarios as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "software_eventos_usuarios_admin_select" on public.usuarios as PERMISSIVE for SELECT to authenticated using (current_user_is_active_admin());
create policy "software_eventos_usuarios_self_select" on public.usuarios as PERMISSIVE for SELECT to authenticated using ((id = auth.uid()));
create policy "usuarios_admin_all" on public.usuarios as PERMISSIVE for ALL to public using (is_admin()) with check (is_admin());
create policy "usuarios_admin_select_all" on public.usuarios as PERMISSIVE for SELECT to authenticated using (current_user_is_admin_active());
create policy "usuarios_admin_select_vendedores_activos" on public.usuarios as PERMISSIVE for SELECT to authenticated using ((current_user_is_admin_active() AND (rol = 'vendedor'::rol_usuario) AND (activo = true)));
create policy "usuarios_insert_self_vendedor" on public.usuarios as PERMISSIVE for INSERT to public with check (((id = auth.uid()) AND (rol = 'vendedor'::rol_usuario) AND (activo = true)));
create policy "usuarios_select_own_or_admin" on public.usuarios as PERMISSIVE for SELECT to authenticated using (((id = auth.uid()) OR is_admin()));
create policy "usuarios_select_self" on public.usuarios as PERMISSIVE for SELECT to authenticated using ((id = auth.uid()));
create policy "usuarios_select_self_or_admin" on public.usuarios as PERMISSIVE for SELECT to public using (((id = auth.uid()) OR is_admin()));
create policy "usuarios_update_admin" on public.usuarios as PERMISSIVE for UPDATE to public using (is_admin()) with check (is_admin());
create policy "usuarios_update_self_profile" on public.usuarios as PERMISSIVE for UPDATE to public using (((id = auth.uid()) AND (activo = true))) with check (((id = auth.uid()) AND (activo = true) AND (rol = current_user_role())));
create policy "Admins can manage usuario_salon" on public.usuario_salon as PERMISSIVE for ALL to authenticated using (is_admin()) with check (is_admin());
create policy "Vendedores can read own usuario_salon" on public.usuario_salon as PERMISSIVE for SELECT to authenticated using ((usuario_id = auth.uid()));
create policy "software_eventos_active_users_only" on public.usuario_salon as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "software_eventos_usuario_salon_admin_select" on public.usuario_salon as PERMISSIVE for SELECT to authenticated using (current_user_is_active_admin());
create policy "software_eventos_usuario_salon_self_select" on public.usuario_salon as PERMISSIVE for SELECT to authenticated using ((usuario_id = auth.uid()));
create policy "usuario_salon_admin_delete" on public.usuario_salon as PERMISSIVE for DELETE to authenticated using (current_user_is_admin_active());
create policy "usuario_salon_admin_insert" on public.usuario_salon as PERMISSIVE for INSERT to authenticated with check (current_user_is_admin_active());
create policy "usuario_salon_admin_select_all" on public.usuario_salon as PERMISSIVE for SELECT to authenticated using (current_user_is_admin_active());
create policy "usuario_salon_admin_update" on public.usuario_salon as PERMISSIVE for UPDATE to authenticated using (current_user_is_admin_active()) with check (current_user_is_admin_active());
create policy "usuario_salon_vendedor_select_own" on public.usuario_salon as PERMISSIVE for SELECT to authenticated using (((usuario_id = auth.uid()) AND current_user_is_vendedor_active()));
create policy "eventos_admin_delete_all" on public.eventos as PERMISSIVE for DELETE to authenticated using (current_user_is_admin_active());
create policy "eventos_admin_insert_for_assigned_vendedor" on public.eventos as PERMISSIVE for INSERT to authenticated with check ((current_user_is_admin_active() AND (deleted_at IS NULL) AND (EXISTS ( SELECT 1
   FROM salones s
  WHERE ((s.id = eventos.salon_id) AND (s.activo = true) AND (s.deleted_at IS NULL)))) AND (EXISTS ( SELECT 1
   FROM usuarios u
  WHERE ((u.id = eventos.vendedor_id) AND (u.rol = 'vendedor'::rol_usuario) AND (u.activo = true)))) AND usuario_asignado_a_salon(vendedor_id, salon_id)));
create policy "eventos_admin_select_all" on public.eventos as PERMISSIVE for SELECT to authenticated using ((current_user_is_admin_active() AND (deleted_at IS NULL)));
create policy "eventos_admin_update_all" on public.eventos as PERMISSIVE for UPDATE to authenticated using ((current_user_is_admin_active() AND (deleted_at IS NULL))) with check (current_user_is_admin_active());
create policy "eventos_delete_admin" on public.eventos as PERMISSIVE for DELETE to public using (is_admin());
create policy "eventos_insert_assigned" on public.eventos as PERMISSIVE for INSERT to public with check ((is_admin() OR ((vendedor_id = auth.uid()) AND usuario_tiene_salon(salon_id))));
create policy "eventos_select_assigned_or_admin" on public.eventos as PERMISSIVE for SELECT to public using ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_salon(salon_id))));
create policy "eventos_update_assigned" on public.eventos as PERMISSIVE for UPDATE to public using ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_salon(salon_id)))) with check ((is_admin() OR ((deleted_at IS NULL) AND usuario_tiene_salon(salon_id))));
create policy "eventos_vendedor_insert_own_assigned" on public.eventos as PERMISSIVE for INSERT to authenticated with check ((current_user_is_vendedor_active() AND (vendedor_id = auth.uid()) AND (deleted_at IS NULL) AND usuario_asignado_a_salon(auth.uid(), salon_id)));
create policy "eventos_vendedor_salon_restrict" on public.eventos as RESTRICTIVE for SELECT to authenticated using ((current_user_is_active() AND ((NOT current_user_is_vendedor_active()) OR usuario_tiene_evento(id))));
create policy "eventos_vendedor_select_own_assigned" on public.eventos as PERMISSIVE for SELECT to authenticated using ((current_user_is_vendedor_active() AND (deleted_at IS NULL) AND (vendedor_id = auth.uid()) AND usuario_asignado_a_salon(auth.uid(), salon_id)));
create policy "eventos_vendedor_update_own_assigned" on public.eventos as PERMISSIVE for UPDATE to authenticated using ((current_user_is_vendedor_active() AND (deleted_at IS NULL) AND (vendedor_id = auth.uid()) AND usuario_asignado_a_salon(auth.uid(), salon_id))) with check ((current_user_is_vendedor_active() AND (vendedor_id = auth.uid()) AND usuario_asignado_a_salon(auth.uid(), salon_id)));
create policy "role permission deletes events" on public.eventos as RESTRICTIVE for DELETE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text], true));
create policy "role permission inserts events" on public.eventos as RESTRICTIVE for INSERT to authenticated with check (current_user_has_screen_permission(ARRAY['eventos'::text], true));
create policy "role permission reads events" on public.eventos as RESTRICTIVE for SELECT to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text, 'reportes'::text]));
create policy "role permission updates events" on public.eventos as RESTRICTIVE for UPDATE to authenticated using (current_user_has_screen_permission(ARRAY['eventos'::text], true)) with check (current_user_has_screen_permission(ARRAY['eventos'::text], true));
create policy "software_eventos_active_users_only" on public.eventos as RESTRICTIVE for ALL to authenticated using (current_user_is_active()) with check (current_user_is_active());
create policy "active admins manage roles" on public.roles as PERMISSIVE for ALL to authenticated using (current_user_is_active_admin()) with check (current_user_is_active_admin());
create policy "active users can read roles" on public.roles as PERMISSIVE for SELECT to authenticated using (current_user_is_active());
create policy "active admins manage role permissions" on public.role_permissions as PERMISSIVE for ALL to authenticated using (current_user_is_active_admin()) with check (current_user_is_active_admin());
create policy "active admins manage user roles" on public.usuario_roles as PERMISSIVE for ALL to authenticated using (current_user_is_active_admin()) with check (current_user_is_active_admin());
create policy "active users can read their role" on public.usuario_roles as PERMISSIVE for SELECT to authenticated using ((usuario_id = auth.uid()));
alter table public.usuarios enable row level security;
alter table public.usuario_salon enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.usuario_roles enable row level security;
alter table public.salones enable row level security;
alter table public.eventos enable row level security;
alter table public.evento_servicios enable row level security;
alter table public.catering_contratos enable row level security;
alter table public.catering_items enable row level security;
alter table public.catering_precio_historial enable row level security;
alter table public.pagos enable row level security;
alter table public.audit_log enable row level security;
alter table public.servicios_catalogo enable row level security;
grant INSERT on public.evento_servicios to anon;
grant SELECT on public.evento_servicios to anon;
grant UPDATE on public.evento_servicios to anon;
grant DELETE on public.evento_servicios to anon;
grant TRUNCATE on public.evento_servicios to anon;
grant REFERENCES on public.evento_servicios to anon;
grant TRIGGER on public.evento_servicios to anon;
grant INSERT on public.evento_servicios to authenticated;
grant SELECT on public.evento_servicios to authenticated;
grant UPDATE on public.evento_servicios to authenticated;
grant DELETE on public.evento_servicios to authenticated;
grant TRUNCATE on public.evento_servicios to authenticated;
grant REFERENCES on public.evento_servicios to authenticated;
grant TRIGGER on public.evento_servicios to authenticated;
grant SELECT on public.audit_log to authenticated;
grant INSERT on public.catering_contratos to anon;
grant SELECT on public.catering_contratos to anon;
grant UPDATE on public.catering_contratos to anon;
grant TRUNCATE on public.catering_contratos to anon;
grant REFERENCES on public.catering_contratos to anon;
grant TRIGGER on public.catering_contratos to anon;
grant INSERT on public.catering_contratos to authenticated;
grant SELECT on public.catering_contratos to authenticated;
grant UPDATE on public.catering_contratos to authenticated;
grant TRUNCATE on public.catering_contratos to authenticated;
grant REFERENCES on public.catering_contratos to authenticated;
grant TRIGGER on public.catering_contratos to authenticated;
grant INSERT on public.v_resumen_evento to anon;
grant SELECT on public.v_resumen_evento to anon;
grant UPDATE on public.v_resumen_evento to anon;
grant DELETE on public.v_resumen_evento to anon;
grant TRUNCATE on public.v_resumen_evento to anon;
grant REFERENCES on public.v_resumen_evento to anon;
grant TRIGGER on public.v_resumen_evento to anon;
grant INSERT on public.v_resumen_evento to authenticated;
grant SELECT on public.v_resumen_evento to authenticated;
grant UPDATE on public.v_resumen_evento to authenticated;
grant DELETE on public.v_resumen_evento to authenticated;
grant TRUNCATE on public.v_resumen_evento to authenticated;
grant REFERENCES on public.v_resumen_evento to authenticated;
grant TRIGGER on public.v_resumen_evento to authenticated;
grant INSERT on public.catering_items to anon;
grant SELECT on public.catering_items to anon;
grant UPDATE on public.catering_items to anon;
grant DELETE on public.catering_items to anon;
grant TRUNCATE on public.catering_items to anon;
grant REFERENCES on public.catering_items to anon;
grant TRIGGER on public.catering_items to anon;
grant INSERT on public.catering_items to authenticated;
grant SELECT on public.catering_items to authenticated;
grant UPDATE on public.catering_items to authenticated;
grant DELETE on public.catering_items to authenticated;
grant TRUNCATE on public.catering_items to authenticated;
grant REFERENCES on public.catering_items to authenticated;
grant TRIGGER on public.catering_items to authenticated;
grant INSERT on public.pagos to anon;
grant SELECT on public.pagos to anon;
grant UPDATE on public.pagos to anon;
grant TRUNCATE on public.pagos to anon;
grant REFERENCES on public.pagos to anon;
grant TRIGGER on public.pagos to anon;
grant INSERT on public.pagos to authenticated;
grant SELECT on public.pagos to authenticated;
grant UPDATE on public.pagos to authenticated;
grant TRUNCATE on public.pagos to authenticated;
grant REFERENCES on public.pagos to authenticated;
grant TRIGGER on public.pagos to authenticated;
grant INSERT on public.salones to anon;
grant SELECT on public.salones to anon;
grant UPDATE on public.salones to anon;
grant DELETE on public.salones to anon;
grant TRUNCATE on public.salones to anon;
grant REFERENCES on public.salones to anon;
grant TRIGGER on public.salones to anon;
grant INSERT on public.salones to authenticated;
grant SELECT on public.salones to authenticated;
grant UPDATE on public.salones to authenticated;
grant TRUNCATE on public.salones to authenticated;
grant REFERENCES on public.salones to authenticated;
grant TRIGGER on public.salones to authenticated;
grant INSERT on public.servicios_catalogo to anon;
grant SELECT on public.servicios_catalogo to anon;
grant UPDATE on public.servicios_catalogo to anon;
grant DELETE on public.servicios_catalogo to anon;
grant TRUNCATE on public.servicios_catalogo to anon;
grant REFERENCES on public.servicios_catalogo to anon;
grant TRIGGER on public.servicios_catalogo to anon;
grant INSERT on public.servicios_catalogo to authenticated;
grant SELECT on public.servicios_catalogo to authenticated;
grant UPDATE on public.servicios_catalogo to authenticated;
grant DELETE on public.servicios_catalogo to authenticated;
grant TRUNCATE on public.servicios_catalogo to authenticated;
grant REFERENCES on public.servicios_catalogo to authenticated;
grant TRIGGER on public.servicios_catalogo to authenticated;
grant INSERT on public.catering_precio_historial to authenticated;
grant SELECT on public.catering_precio_historial to authenticated;
grant TRUNCATE on public.catering_precio_historial to authenticated;
grant REFERENCES on public.catering_precio_historial to authenticated;
grant TRIGGER on public.catering_precio_historial to authenticated;
grant SELECT on public.usuarios to anon;
grant TRUNCATE on public.usuarios to anon;
grant REFERENCES on public.usuarios to anon;
grant TRIGGER on public.usuarios to anon;
grant SELECT on public.usuarios to authenticated;
grant TRUNCATE on public.usuarios to authenticated;
grant REFERENCES on public.usuarios to authenticated;
grant TRIGGER on public.usuarios to authenticated;
grant SELECT on public.usuario_salon to anon;
grant TRUNCATE on public.usuario_salon to anon;
grant REFERENCES on public.usuario_salon to anon;
grant TRIGGER on public.usuario_salon to anon;
grant SELECT on public.usuario_salon to authenticated;
grant TRUNCATE on public.usuario_salon to authenticated;
grant REFERENCES on public.usuario_salon to authenticated;
grant TRIGGER on public.usuario_salon to authenticated;
grant INSERT on public.eventos to anon;
grant SELECT on public.eventos to anon;
grant UPDATE on public.eventos to anon;
grant DELETE on public.eventos to anon;
grant TRUNCATE on public.eventos to anon;
grant REFERENCES on public.eventos to anon;
grant TRIGGER on public.eventos to anon;
grant INSERT on public.eventos to authenticated;
grant SELECT on public.eventos to authenticated;
grant UPDATE on public.eventos to authenticated;
grant DELETE on public.eventos to authenticated;
grant TRUNCATE on public.eventos to authenticated;
grant REFERENCES on public.eventos to authenticated;
grant TRIGGER on public.eventos to authenticated;
grant INSERT on public.roles to anon;
grant SELECT on public.roles to anon;
grant UPDATE on public.roles to anon;
grant DELETE on public.roles to anon;
grant TRUNCATE on public.roles to anon;
grant REFERENCES on public.roles to anon;
grant TRIGGER on public.roles to anon;
grant INSERT on public.roles to authenticated;
grant SELECT on public.roles to authenticated;
grant UPDATE on public.roles to authenticated;
grant DELETE on public.roles to authenticated;
grant TRUNCATE on public.roles to authenticated;
grant REFERENCES on public.roles to authenticated;
grant TRIGGER on public.roles to authenticated;
grant INSERT on public.role_permissions to anon;
grant SELECT on public.role_permissions to anon;
grant UPDATE on public.role_permissions to anon;
grant DELETE on public.role_permissions to anon;
grant TRUNCATE on public.role_permissions to anon;
grant REFERENCES on public.role_permissions to anon;
grant TRIGGER on public.role_permissions to anon;
grant INSERT on public.role_permissions to authenticated;
grant SELECT on public.role_permissions to authenticated;
grant UPDATE on public.role_permissions to authenticated;
grant DELETE on public.role_permissions to authenticated;
grant TRUNCATE on public.role_permissions to authenticated;
grant REFERENCES on public.role_permissions to authenticated;
grant TRIGGER on public.role_permissions to authenticated;
grant INSERT on public.usuario_roles to anon;
grant SELECT on public.usuario_roles to anon;
grant UPDATE on public.usuario_roles to anon;
grant DELETE on public.usuario_roles to anon;
grant TRUNCATE on public.usuario_roles to anon;
grant REFERENCES on public.usuario_roles to anon;
grant TRIGGER on public.usuario_roles to anon;
grant INSERT on public.usuario_roles to authenticated;
grant SELECT on public.usuario_roles to authenticated;
grant UPDATE on public.usuario_roles to authenticated;
grant DELETE on public.usuario_roles to authenticated;
grant TRUNCATE on public.usuario_roles to authenticated;
grant REFERENCES on public.usuario_roles to authenticated;
grant TRIGGER on public.usuario_roles to authenticated;
set check_function_bodies = on;


-- ACL de funciones del catálogo real (roles de API probados).
revoke all on function public.aplicar_totales_evento_servicio() from public, anon, authenticated;
grant execute on function public.aplicar_totales_evento_servicio() to anon;
grant execute on function public.aplicar_totales_evento_servicio() to authenticated;
revoke all on function public.audit_current_user_is_admin() from public, anon, authenticated;
grant execute on function public.audit_current_user_is_admin() to authenticated;
revoke all on function public.audit_row_change() from public, anon, authenticated;
revoke all on function public.audit_sanitize_jsonb(p_value jsonb) from public, anon, authenticated;
revoke all on function public.calcular_totales_evento_servicio(p_precio_base numeric, p_adicionales_monto numeric, p_iva_base_imponible numeric, p_iva_porcentaje numeric, p_total_pagado numeric) from public, anon, authenticated;
grant execute on function public.calcular_totales_evento_servicio(p_precio_base numeric, p_adicionales_monto numeric, p_iva_base_imponible numeric, p_iva_porcentaje numeric, p_total_pagado numeric) to anon;
grant execute on function public.calcular_totales_evento_servicio(p_precio_base numeric, p_adicionales_monto numeric, p_iva_base_imponible numeric, p_iva_porcentaje numeric, p_total_pagado numeric) to authenticated;
revoke all on function public.current_user_has_screen_permission(p_screens text[], p_manage boolean) from public, anon, authenticated;
grant execute on function public.current_user_has_screen_permission(p_screens text[], p_manage boolean) to anon;
grant execute on function public.current_user_has_screen_permission(p_screens text[], p_manage boolean) to authenticated;
revoke all on function public.current_user_is_active() from public, anon, authenticated;
grant execute on function public.current_user_is_active() to anon;
grant execute on function public.current_user_is_active() to authenticated;
revoke all on function public.current_user_is_active_admin() from public, anon, authenticated;
grant execute on function public.current_user_is_active_admin() to anon;
grant execute on function public.current_user_is_active_admin() to authenticated;
revoke all on function public.current_user_is_admin_active() from public, anon, authenticated;
grant execute on function public.current_user_is_admin_active() to public;
grant execute on function public.current_user_is_admin_active() to anon;
grant execute on function public.current_user_is_admin_active() to authenticated;
revoke all on function public.current_user_is_vendedor_active() from public, anon, authenticated;
grant execute on function public.current_user_is_vendedor_active() to public;
grant execute on function public.current_user_is_vendedor_active() to anon;
grant execute on function public.current_user_is_vendedor_active() to authenticated;
revoke all on function public.current_user_role() from public, anon, authenticated;
grant execute on function public.current_user_role() to public;
grant execute on function public.current_user_role() to anon;
grant execute on function public.current_user_role() to authenticated;
revoke all on function public.fn_actualizar_totales_catering() from public, anon, authenticated;
grant execute on function public.fn_actualizar_totales_catering() to public;
grant execute on function public.fn_actualizar_totales_catering() to anon;
grant execute on function public.fn_actualizar_totales_catering() to authenticated;
revoke all on function public.fn_actualizar_totales_pagos() from public, anon, authenticated;
grant execute on function public.fn_actualizar_totales_pagos() to public;
grant execute on function public.fn_actualizar_totales_pagos() to anon;
grant execute on function public.fn_actualizar_totales_pagos() to authenticated;
revoke all on function public.fn_audit_log() from public, anon, authenticated;
grant execute on function public.fn_audit_log() to public;
grant execute on function public.fn_audit_log() to anon;
grant execute on function public.fn_audit_log() to authenticated;
revoke all on function public.fn_restrict_usuario_self_update() from public, anon, authenticated;
grant execute on function public.fn_restrict_usuario_self_update() to public;
grant execute on function public.fn_restrict_usuario_self_update() to anon;
grant execute on function public.fn_restrict_usuario_self_update() to authenticated;
revoke all on function public.fn_validar_pago_evento() from public, anon, authenticated;
grant execute on function public.fn_validar_pago_evento() to public;
grant execute on function public.fn_validar_pago_evento() to anon;
grant execute on function public.fn_validar_pago_evento() to authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
grant execute on function public.is_admin() to anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.recalcular_fecha_contrato_evento(p_evento_id uuid) from public, anon, authenticated;
grant execute on function public.recalcular_fecha_contrato_evento(p_evento_id uuid) to public;
grant execute on function public.recalcular_fecha_contrato_evento(p_evento_id uuid) to anon;
grant execute on function public.recalcular_fecha_contrato_evento(p_evento_id uuid) to authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to public;
grant execute on function public.set_updated_at() to anon;
grant execute on function public.set_updated_at() to authenticated;
revoke all on function public.trg_recalcular_fecha_contrato_evento() from public, anon, authenticated;
grant execute on function public.trg_recalcular_fecha_contrato_evento() to public;
grant execute on function public.trg_recalcular_fecha_contrato_evento() to anon;
grant execute on function public.trg_recalcular_fecha_contrato_evento() to authenticated;
revoke all on function public.usuario_asignado_a_salon(p_usuario_id uuid, p_salon_id uuid) from public, anon, authenticated;
grant execute on function public.usuario_asignado_a_salon(p_usuario_id uuid, p_salon_id uuid) to public;
grant execute on function public.usuario_asignado_a_salon(p_usuario_id uuid, p_salon_id uuid) to anon;
grant execute on function public.usuario_asignado_a_salon(p_usuario_id uuid, p_salon_id uuid) to authenticated;
revoke all on function public.usuario_tiene_catering_contrato(p_catering_contrato_id uuid) from public, anon, authenticated;
grant execute on function public.usuario_tiene_catering_contrato(p_catering_contrato_id uuid) to anon;
grant execute on function public.usuario_tiene_catering_contrato(p_catering_contrato_id uuid) to authenticated;
revoke all on function public.usuario_tiene_evento(p_evento_id uuid) from public, anon, authenticated;
grant execute on function public.usuario_tiene_evento(p_evento_id uuid) to public;
grant execute on function public.usuario_tiene_evento(p_evento_id uuid) to anon;
grant execute on function public.usuario_tiene_evento(p_evento_id uuid) to authenticated;
revoke all on function public.usuario_tiene_evento_servicio(p_evento_servicio_id uuid) from public, anon, authenticated;
grant execute on function public.usuario_tiene_evento_servicio(p_evento_servicio_id uuid) to public;
grant execute on function public.usuario_tiene_evento_servicio(p_evento_servicio_id uuid) to anon;
grant execute on function public.usuario_tiene_evento_servicio(p_evento_servicio_id uuid) to authenticated;
revoke all on function public.usuario_tiene_salon(p_salon_id uuid) from public, anon, authenticated;
grant execute on function public.usuario_tiene_salon(p_salon_id uuid) to anon;
grant execute on function public.usuario_tiene_salon(p_salon_id uuid) to authenticated;
revoke all on function public.validar_catering_contrato_write() from public, anon, authenticated;
revoke all on function public.validar_lugar_catering_externo() from public, anon, authenticated;
grant execute on function public.validar_lugar_catering_externo() to public;
grant execute on function public.validar_lugar_catering_externo() to anon;
grant execute on function public.validar_lugar_catering_externo() to authenticated;
revoke all on function public.validar_movimiento_evento_catering() from public, anon, authenticated;
