-- Sólo SELECT. Guardar el resultado para comparar y recuperar DDL antes de aplicar.
select version();
select c.relname, c.reloptions, pg_get_userbyid(c.relowner) as owner,
  pg_get_viewdef(c.oid, true) as definition
from pg_class c where c.oid = 'public.v_resumen_evento'::regclass;

select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'fn_validar_pago_evento', 'validar_movimiento_evento_catering',
  'fn_actualizar_totales_pagos', 'fn_actualizar_totales_catering',
  'audit_row_change', 'fn_audit_log', 'usuario_tiene_catering_contrato',
  'usuario_tiene_evento', 'usuario_tiene_salon', 'current_user_has_screen_permission'
);
select c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgrelid in ('public.pagos'::regclass, 'public.catering_contratos'::regclass,
  'public.evento_servicios'::regclass, 'public.eventos'::regclass)
  and not t.tgisinternal;
select * from pg_policies where schemaname = 'public'
  and tablename in ('eventos', 'evento_servicios', 'catering_contratos', 'pagos', 'salones', 'usuarios');
select table_name, column_name, is_nullable, is_generated, generation_expression, column_default
from information_schema.columns where table_schema = 'public'
  and table_name in ('pagos', 'evento_servicios', 'catering_contratos', 'catering_items');
select table_name, grantee, privilege_type
from information_schema.role_table_grants where table_schema = 'public'
  and table_name in ('v_resumen_evento', 'eventos', 'evento_servicios', 'catering_contratos', 'usuarios', 'salones');
select c.relname, co.conname, pg_get_constraintdef(co.oid)
from pg_constraint co join pg_class c on c.oid = co.conrelid
where c.oid = 'public.pagos'::regclass;
