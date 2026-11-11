-- Sólo lectura. Ejecutar antes y después del deploy; no es una migración.
-- Todos los controles deben ser verdaderos. No devuelve datos de clientes.
select objeto,
  to_regclass('public.' || objeto) is not null as existe,
  coalesce(case when vista then c.reloptions @> array['security_invoker=true']
    else c.relrowsecurity end, false) as seguridad_correcta
from (values ('eventos',false),('pagos',false),('pago_imputaciones',false),
  ('catering_coberturas',false),('v_resumen_evento',true),
  ('v_catering_acreditado',true),('v_catering_tarifas',true)) requeridos(objeto,vista)
left join pg_class c on c.oid=to_regclass('public.' || objeto);

select tabla,columna,exists(select 1 from information_schema.columns c
  where c.table_schema='public' and c.table_name=tabla and c.column_name=columna) as existe
from (values ('pagos','distribuido'),('pagos','tipo_cambio'),('pagos','importe_en_pesos'),
  ('v_resumen_evento','ajuste_cobertura_catering'),('catering_coberturas','precio_aplicado'),
  ('catering_coberturas','importe_historico'),('catering_coberturas','liberada'),
  ('v_catering_tarifas','por_acreditar')) requeridas(tabla,columna);

select tabla,exists(select 1 from pg_trigger t
  where t.tgrelid=to_regclass('public.' || tabla) and not t.tgisinternal
    and t.tgenabled<>'D' and t.tgname in ('audit_row_change','trg_audit_pagos')) as auditoria_activa
from (values ('pagos'),('pago_imputaciones'),('catering_coberturas')) requeridas(tabla);

select tablename,policyname,permissive,roles,cmd,qual
from pg_policies where schemaname='public' and cmd='SELECT'
  and tablename in ('eventos','pagos','pago_imputaciones','catering_coberturas')
order by tablename,policyname;
