-- Read-only catalog inspection. Run against the database configured by the app.
-- This file never alters schema, triggers, calculations or commercial data.
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'fn_actualizar_totales_catering', 'fn_actualizar_totales_pagos',
  'aplicar_totales_evento_servicio', 'calcular_totales_evento_servicio',
  'registrar_y_aplicar_ipc', 'usuario_tiene_catering_contrato',
  'usuario_tiene_evento', 'current_user_has_screen_permission'
);

select c.relname, pg_get_viewdef(c.oid, true) as definition, c.reloptions
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'v_resumen_evento';

select table_name, column_name, data_type, numeric_precision, numeric_scale,
  column_default, generation_expression
from information_schema.columns
where table_schema = 'public' and table_name in (
  'catering_contratos', 'catering_items', 'catering_precio_historial',
  'evento_servicios', 'pagos', 'actualizaciones_ipc'
);

select c.relname, co.conname, pg_get_constraintdef(co.oid) as definition
from pg_constraint co join pg_class c on c.oid = co.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and co.contype in ('f', 'c')
  and c.relname in ('catering_contratos', 'evento_servicios', 'pagos');

select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in (
  'eventos', 'evento_servicios', 'catering_contratos', 'catering_items',
  'catering_precio_historial', 'pagos', 'evento_contactos', 'actualizaciones_ipc'
);

-- Counts only: no customer or payment details in the diagnostic output.
select count(*) as active_contracts from public.catering_contratos where deleted_at is null;
