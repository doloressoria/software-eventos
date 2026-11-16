-- Activar después de publicar el frontend que conserva el renderizador de versión 1.
begin;
set local lock_timeout = '5s';

create or replace function software_eventos_private.recibo_snapshot(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  p public.pagos;
  e public.eventos;
  c public.catering_contratos;
  em public.recibo_emisores;
  salon uuid;
  marca text;
  fuente jsonb;
  destinos jsonb;
begin
  select * into strict p from public.pagos where id=p_id;
  if p.evento_id is not null then
    select * into strict e from public.eventos where id=p.evento_id;
    salon := e.salon_id;
  else
    select * into strict c from public.catering_contratos where id=p.catering_contrato_id;
    salon := c.salon_id;
  end if;
  select * into em from public.recibo_emisores where salon_id is not distinct from salon;
  select nombre into marca from public.salones where id=salon;
  marca := coalesce(em.marca,marca);
  if marca is null then raise exception 'Configurá el emisor del recibo para catering externo' using errcode='23514'; end if;
  fuente := software_eventos_private.recibo_fuente(p_id);
  select coalesce(jsonb_agg(jsonb_build_object('concepto',coalesce(sc.nombre,cc.tipo_servicio,'Catering'),
    'categoria',case when d.catering_contrato_id is not null then 'catering' else sc.categoria::text end,
    'importe_ars',d.importe_ars,'catering_contrato_id',d.catering_contrato_id) order by d.evento_servicio_id,d.catering_contrato_id),'[]'::jsonb)
  into destinos from (
    select i.evento_servicio_id,i.catering_contrato_id,i.importe_ars from public.pago_imputaciones i where p.distribuido and i.pago_id=p.id
    union all select p.evento_servicio_id,p.catering_contrato_id,p.importe_en_pesos where not p.distribuido
  ) d left join public.evento_servicios s on s.id=d.evento_servicio_id
  left join public.servicios_catalogo sc on sc.id=s.servicio_id
  left join public.catering_contratos cc on cc.id=d.catering_contrato_id;
  return jsonb_build_object('version',2,'marca',marca,'logo_data_url',em.logo_data_url,
    'cliente',case when p.evento_id is not null then e.cliente_nombre else c.cliente_nombre end,
    'evento',case when p.evento_id is not null then coalesce(e.nombre_evento,e.tipo_evento,'Evento') else coalesce(c.tipo_evento,c.tipo_servicio,'Catering externo') end,
    'fecha_evento',coalesce(e.fecha_evento,c.fecha_evento),
    'lugar',coalesce(c.lugar_evento,(select nombre from public.salones where id=salon)),
    'pax_evento',jsonb_build_object('adultos',coalesce(e.pax_adultos,c.pax_adultos,0),'jovenes',coalesce(e.pax_jovenes,c.pax_jovenes,0),
      'menores',coalesce(e.pax_menores,c.pax_menores,0),'bebes',coalesce(e.pax_bebes,c.pax_bebes,0)),
    'pago',fuente->'pago','imputaciones',destinos,'coberturas',fuente->'coberturas','componentes',fuente->'componentes',
    'estado_acreditacion',case when p.deleted_at is not null then 'Anulado' when p.forma_pago='cheque' and p.fecha_pago>software_eventos_private.dia_argentina()
      then 'Recibido pendiente de acreditación' else 'Acreditado' end,
    'garantia',p.es_garantia);
end $$;

-- Las instantáneas emitidas y las firmas/ACL de las RPC se conservan.
notify pgrst, 'reload schema';
commit;
