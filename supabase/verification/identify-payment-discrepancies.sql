-- Diagnóstico propuesto; NO se ejecutó en producción. Sin UPDATE ni DELETE.
-- Destinos cuyo acumulado no coincide con pagos activos ordinarios.
with destinations as (
  select 'servicio' as kind, es.id, es.total_pagado as stored,
    coalesce(sum(p.importe_en_pesos) filter (where not p.es_garantia), 0) as ordinary,
    coalesce(sum(p.importe_en_pesos) filter (where p.es_garantia), 0) as guarantees
  from public.evento_servicios es
  left join public.pagos p on p.evento_servicio_id = es.id and p.deleted_at is null
  group by es.id, es.total_pagado
  union all
  select 'catering', cc.id, cc.total_pagado,
    coalesce(sum(p.importe_en_pesos) filter (where not p.es_garantia), 0),
    coalesce(sum(p.importe_en_pesos) filter (where p.es_garantia), 0)
  from public.catering_contratos cc
  left join public.pagos p on p.catering_contrato_id = cc.id and p.deleted_at is null
  group by cc.id, cc.total_pagado
)
select *, stored - ordinary as difference
from destinations where stored is distinct from ordinary
order by kind, id;

-- Referencias incompatibles; identificadores, sin datos de clientes.
select p.id, p.evento_id, p.evento_servicio_id, p.catering_contrato_id
from public.pagos p
left join public.evento_servicios es on es.id = p.evento_servicio_id
left join public.catering_contratos cc on cc.id = p.catering_contrato_id
where (p.evento_servicio_id is null) = (p.catering_contrato_id is null)
  or (p.evento_servicio_id is not null
    and (es.id is null or es.evento_id is distinct from p.evento_id))
  or (p.catering_contrato_id is not null
    and (cc.id is null or cc.evento_id is distinct from p.evento_id));

-- Comparación de modelos, no es una propuesta automática de precio.
with comparison as (
  select cc.id, cc.deleted_at, cc.total_con_iva as stored_total,
    coalesce(items.sql_net, 0) * (1 + coalesce(cc.iva_porcentaje, .21)) as sql_model,
    round((
      coalesce(price.precio_unitario, 0) *
        (coalesce(cc.pax_adultos, 0) + coalesce(cc.pax_jovenes, 0) +
         coalesce(cc.pax_menores, 0) + coalesce(cc.pax_bebes, 0)) +
      coalesce(items.ts_extras, 0)
    ) * (1 + coalesce(cc.iva_porcentaje, 0)) +
      coalesce(cc.comision_organizador_monto, 0) * (1 + coalesce(cc.iva_comision, 0)), 2) as ts_model
  from public.catering_contratos cc
  left join lateral (
    select sum(ci.total) as sql_net, sum(ci.precio_unitario) as ts_extras
    from public.catering_items ci where ci.catering_contrato_id = cc.id
  ) items on true
  left join lateral (
    select h.precio_unitario from public.catering_precio_historial h
    where h.catering_contrato_id = cc.id order by h.fecha desc, h.created_at desc limit 1
  ) price on true
)
select * from comparison where stored_total is distinct from sql_model
  or stored_total is distinct from ts_model;
