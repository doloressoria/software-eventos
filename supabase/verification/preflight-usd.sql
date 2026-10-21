-- Sólo lectura; revisar en el destino antes de aplicar SQL. No corregir históricos automáticamente.
select pg_get_functiondef('public.fn_actualizar_totales_pagos()'::regprocedure),
       pg_get_functiondef('public.fn_validar_pago_evento()'::regprocedure);
select column_name, data_type, numeric_precision, numeric_scale, column_default, generation_expression
from information_schema.columns where table_schema='public' and table_name='pagos';
select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.pagos'::regclass;
select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid='public.pagos'::regclass and not tgisinternal;
select moneda, forma_pago, count(*) as registros_a_revisar
from public.pagos where tipo_cambio is null or tipo_cambio <= 0 or tipo_cambio = 'NaN'::numeric
  or importe_moneda_original <= 0 or importe_moneda_original = 'NaN'::numeric
  or moneda not in ('ARS','USD')
  or (moneda='ARS' and (tipo_cambio <> 1 or forma_pago not in ('efectivo_pesos','transferencia','cheque','retenciones')))
  or (moneda='USD' and forma_pago not in ('efectivo_dolares','transferencia'))
group by moneda, forma_pago;
