-- Sólo lectura. Ejecutar en staging identificado y autorizado antes de aplicar.
select version();
select to_regclass('public.evento_contactos') as contactos_existentes,
  to_regnamespace('contactos_privado') as esquema_privado_existente;
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in (
  'current_user_is_active', 'current_user_has_screen_permission',
  'current_user_is_vendedor_active', 'usuario_tiene_evento',
  'usuario_tiene_catering_contrato', 'audit_row_change'
);
select c.relname, c.relrowsecurity from pg_class c
where c.oid in ('public.eventos'::regclass, 'public.catering_contratos'::regclass);
select column_name, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='eventos' order by ordinal_position;
select tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies where schemaname='public'
  and tablename in ('eventos','catering_contratos','evento_servicios');
select t.tgname, pg_get_triggerdef(t.oid)
from pg_trigger t where t.tgrelid='public.eventos'::regclass and not t.tgisinternal;
