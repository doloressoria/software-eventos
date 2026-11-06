-- Use the same partial VAT base as total_con_iva and the commercial detail.
-- PostgreSQL 17 rewrites existing generated balances; payment origins stay intact.
set local lock_timeout = '5s';
alter table public.evento_servicios
  alter column saldo_pendiente set expression as (
    coalesce(precio_base, 0) + coalesce(adicionales_monto, 0)
    + coalesce(iva_base_imponible, 0) * coalesce(iva_porcentaje, 0)
    - coalesce(total_pagado, 0)
  );
