-- SQL Editor: ejecutar completo después de catering_iva_separado_usd.
begin;
set local lock_timeout = '5s';

-- La cobertura se selecciona explícitamente por cobro + categoría, sin FIFO/LIFO.
create or replace function software_eventos_private.reasignar_excedente_catering(
  p_catering uuid, p_pago uuid, p_categoria text, p_cantidad integer,
  p_destino uuid, p_es_catering boolean, p_liberada_esperada integer, p_importe_esperado numeric
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  servicio uuid := case when not p_es_catering then p_destino end;
  otro_catering uuid := case when p_es_catering then p_destino end;
  dia date := software_eventos_private.dia_argentina();
  pago public.pagos;
  cobertura public.catering_coberturas;
  contrato public.catering_contratos;
  excedente bigint;
  importe numeric;
  destinos jsonb;
  componente public.catering_cobro_componentes;
begin
  if actor is null or not public.current_user_is_active()
    or not public.current_user_has_screen_permission(array['eventos'], true)
    or p_destino is null or p_es_catering is null or otro_catering = p_catering
    or p_cantidad is null or p_cantidad <= 0 or p_liberada_esperada is null then
    raise exception 'Reasignación no autorizada o inválida' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_pago::text, 0));
  select * into pago from public.pagos where id = p_pago and deleted_at is null for update;
  if not found or pago.evento_id is null or not public.usuario_tiene_evento(pago.evento_id)
    or (pago.registrado_por is distinct from actor and not public.current_user_is_active_admin())
    or pago.es_garantia or (pago.forma_pago = 'cheque' and pago.fecha_pago > dia) then
    raise exception 'El cobro no está disponible o acreditado' using errcode = '42501';
  end if;
  perform 1 from public.eventos where id = pago.evento_id and deleted_at is null for no key update;
  if not found then raise exception 'Evento no disponible' using errcode = '42501'; end if;

  perform 1 from public.evento_servicios s where s.evento_id = pago.evento_id and
    (s.id = servicio or exists (select 1 from public.pago_imputaciones i where i.pago_id = p_pago and i.evento_servicio_id = s.id))
    order by s.id for no key update;
  perform 1 from public.catering_contratos c where c.evento_id = pago.evento_id and
    (c.id in (p_catering, otro_catering) or exists (select 1 from public.pago_imputaciones i where i.pago_id = p_pago and i.catering_contrato_id = c.id))
    order by c.id for no key update;
  select * into contrato from public.catering_contratos where id = p_catering and evento_id = pago.evento_id and deleted_at is null;
  if not found then raise exception 'Catering no disponible' using errcode = '42501'; end if;

  select * into cobertura from public.catering_coberturas x
  where x.pago_id = p_pago and x.catering_contrato_id = p_catering and x.categoria = p_categoria;
  select t.cubiertos - t.pax into excedente
  from software_eventos_private.catering_tarifas(contrato, dia) t where t.categoria = p_categoria;

  if cobertura.pago_id is null or cobertura.liberada <> p_liberada_esperada
    or p_cantidad > least(excedente, cobertura.cantidad - cobertura.liberada) then
    raise exception 'Revisá el excedente disponible y recargá la página' using errcode = '23514';
  end if;

  importe := cobertura.precio_aplicado * p_cantidad;
  select * into componente from public.catering_cobro_componentes
    where pago_id = p_pago and catering_contrato_id = p_catering;
  if componente.pago_id is not null then
    importe := least(importe, coalesce(componente.capital_ars, componente.objetivo_ars)
      - (componente.ajuste_ars - componente.ajuste_iva_ars) - componente.capital_reasignado_ars);
    if importe <= 0 then raise exception 'Sin capital real para reasignar' using errcode = '23514'; end if;
  end if;
  if p_importe_esperado is null or importe is distinct from p_importe_esperado then
    raise exception 'Cambió el capital disponible. Recargá y confirmá el importe' using errcode = '40001';
  end if;
  select jsonb_agg(to_jsonb(d)) into destinos from (
    select evento_servicio_id, catering_contrato_id, sum(importe_ars) as importe_ars
    from (
      select i.evento_servicio_id, i.catering_contrato_id, i.importe_ars from public.pago_imputaciones i where i.pago_id = p_pago
      union all select null, pago.catering_contrato_id, pago.importe_en_pesos where not pago.distribuido and pago.catering_contrato_id = p_catering
      union all select null, p_catering, -importe
      union all select servicio, otro_catering, importe
    ) lineas group by evento_servicio_id, catering_contrato_id having sum(importe_ars) <> 0
  ) d;
  perform software_eventos_private.guardar_pago_distribuido(pago.evento_id, p_pago, true, to_jsonb(pago), destinos);
  update public.catering_cobro_componentes set capital_reasignado_ars = capital_reasignado_ars + importe
    where pago_id = p_pago and catering_contrato_id = p_catering;
  update public.catering_coberturas set liberada = liberada + p_cantidad where pago_id = p_pago and categoria = p_categoria;
  update public.catering_contratos set updated_at = now() where id = p_catering;
end;
$$;


revoke all on function software_eventos_private.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer,numeric) from public, anon, authenticated, service_role;
grant execute on function software_eventos_private.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer,numeric) to authenticated;
create function public.reasignar_excedente_catering(
  p_catering uuid, p_pago uuid, p_categoria text, p_cantidad integer,
  p_destino uuid, p_es_catering boolean, p_liberada_esperada integer, p_importe_esperado numeric
) returns void language sql security invoker set search_path = ''
return software_eventos_private.reasignar_excedente_catering(p_catering,p_pago,p_categoria,p_cantidad,p_destino,p_es_catering,p_liberada_esperada,p_importe_esperado);
revoke all on function public.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer,numeric) from public, anon, authenticated, service_role;
grant execute on function public.reasignar_excedente_catering(uuid,uuid,text,integer,uuid,boolean,integer,numeric) to authenticated;

create table public.recibo_emisores (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid references public.salones(id),
  marca text not null check (length(trim(marca)) between 1 and 200),
  logo_data_url text check (logo_data_url is null or (length(logo_data_url) <= 500000 and logo_data_url ~ '^data:image/(png|jpeg);base64,[A-Za-z0-9+/=]+$')),
  unique nulls not distinct (salon_id)
);
alter table public.recibo_emisores enable row level security;
revoke all on public.recibo_emisores from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.recibo_emisores to authenticated;
create policy recibo_emisores_admin on public.recibo_emisores for all to authenticated
using (public.current_user_is_active_admin()) with check (public.current_user_is_active_admin());
create trigger audit_row_change after insert or update or delete on public.recibo_emisores
for each row execute function public.audit_row_change('id');

create sequence software_eventos_private.recibo_numero_seq;
revoke all on sequence software_eventos_private.recibo_numero_seq from public,anon,authenticated,service_role;
create table public.recibos (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete restrict,
  evento_id uuid references public.eventos(id) on delete restrict,
  catering_contrato_id uuid references public.catering_contratos(id) on delete restrict,
  serie text not null default 'REC' check (serie = 'REC'),
  numero bigint not null default nextval('software_eventos_private.recibo_numero_seq'),
  revision integer not null check (revision > 0),
  tipo text not null check (tipo in ('recibo','modificacion','anulacion')),
  anterior_id uuid references public.recibos(id) on delete restrict,
  emitido_at timestamptz not null default clock_timestamp(),
  emitido_por uuid references public.usuarios(id),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  fuente jsonb not null,
  unique (serie,numero), unique (pago_id,revision), unique (anterior_id),
  check (num_nonnulls(evento_id,catering_contrato_id) = 1),
  check ((revision = 1 and anterior_id is null and tipo = 'recibo') or (revision > 1 and anterior_id is not null and tipo <> 'recibo'))
);
create index recibos_evento_idx on public.recibos(evento_id,numero) where evento_id is not null;
create index recibos_catering_idx on public.recibos(catering_contrato_id,numero) where catering_contrato_id is not null;
alter table public.recibos enable row level security;
revoke all on public.recibos from public,anon,authenticated,service_role;
grant select on public.recibos to authenticated;

create function software_eventos_private.recibo_acceso(p_evento uuid,p_catering uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.current_user_is_active() and
  case when p_evento is not null then
    public.current_user_has_screen_permission(array['eventos'],false)
    and public.usuario_tiene_evento(p_evento)
    and exists(select 1 from public.eventos where id=p_evento and deleted_at is null)
  else public.current_user_has_screen_permission(array['catering'],false)
    and public.usuario_tiene_catering_contrato(p_catering)
    and exists(select 1 from public.catering_contratos where id=p_catering and evento_id is null and deleted_at is null)
  end
$$;
revoke all on function software_eventos_private.recibo_acceso(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function software_eventos_private.recibo_acceso(uuid,uuid) to authenticated;
create policy recibos_select on public.recibos for select to authenticated using (
  software_eventos_private.recibo_acceso(evento_id,catering_contrato_id)
  and exists (select 1 from public.pagos p where p.id=pago_id and
    software_eventos_private.recibo_acceso(p.evento_id,case when p.evento_id is null then p.catering_contrato_id end))
);

-- Sólo campos pertinentes al comprobante; nunca notas internas o datos de otros cobros.
create function software_eventos_private.recibo_fuente(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pago',jsonb_build_object('id',p.id,'concepto',p.concepto,'fecha_pago',p.fecha_pago,
      'forma_pago',p.forma_pago,'moneda',p.moneda,'importe_moneda_original',p.importe_moneda_original,
      'tipo_cambio',p.tipo_cambio,'importe_en_pesos',p.importe_en_pesos,'banco',p.banco,
      'numero_cheque',p.numero_cheque,'es_garantia',p.es_garantia,'deleted_at',p.deleted_at,
      'evento_id',p.evento_id,'catering_contrato_id',p.catering_contrato_id,'evento_servicio_id',p.evento_servicio_id),
    'imputaciones',coalesce((select jsonb_agg(jsonb_build_object('evento_servicio_id',i.evento_servicio_id,
      'catering_contrato_id',i.catering_contrato_id,'importe_ars',i.importe_ars) order by i.evento_servicio_id,i.catering_contrato_id)
      from public.pago_imputaciones i where i.pago_id=p.id),'[]'::jsonb),
    'coberturas',coalesce((select jsonb_agg(to_jsonb(x) order by x.catering_contrato_id,x.categoria)
      from public.catering_coberturas x where x.pago_id=p.id),'[]'::jsonb),
    'componentes',coalesce((select jsonb_agg(to_jsonb(d) order by d.catering_contrato_id)
      from public.catering_cobro_componentes d where d.pago_id=p.id),'[]'::jsonb))
  from public.pagos p where p.id=p_id
$$;

create function software_eventos_private.recibo_snapshot(p_id uuid)
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
    'importe_ars',d.importe_ars,'catering_contrato_id',d.catering_contrato_id) order by d.evento_servicio_id,d.catering_contrato_id),'[]'::jsonb)
  into destinos from (
    select i.evento_servicio_id,i.catering_contrato_id,i.importe_ars from public.pago_imputaciones i where p.distribuido and i.pago_id=p.id
    union all select p.evento_servicio_id,p.catering_contrato_id,p.importe_en_pesos where not p.distribuido
  ) d left join public.evento_servicios s on s.id=d.evento_servicio_id
  left join public.servicios_catalogo sc on sc.id=s.servicio_id
  left join public.catering_contratos cc on cc.id=d.catering_contrato_id;
  return jsonb_build_object('version',1,'marca',marca,'logo_data_url',em.logo_data_url,
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

create function software_eventos_private.emitir_recibo(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.pagos; r public.recibos; resultado uuid; s jsonb;
begin
  select * into p from public.pagos where id=p_id for no key update;
  if not found or not software_eventos_private.recibo_acceso(p.evento_id,case when p.evento_id is null then p.catering_contrato_id end) then
    raise exception 'No tenés acceso al cobro completo. Un acceso parcial a catering no habilita este recibo' using errcode='42501';
  end if;
  select * into r from public.recibos where pago_id=p_id order by revision limit 1;
  if found then
    if not software_eventos_private.recibo_acceso(r.evento_id,r.catering_contrato_id) then raise exception 'Recibo no autorizado' using errcode='42501'; end if;
    return r.id;
  end if;
  if p.deleted_at is not null then raise exception 'El cobro está anulado y no tiene recibo emitido' using errcode='23514'; end if;
  s := software_eventos_private.recibo_snapshot(p_id);
  insert into public.recibos(pago_id,evento_id,catering_contrato_id,revision,tipo,snapshot,fuente,emitido_por)
  values(p_id,p.evento_id,case when p.evento_id is null then p.catering_contrato_id end,1,'recibo',s,
    software_eventos_private.recibo_fuente(p_id),auth.uid()) returning id into resultado;
  return resultado;
end $$;
create function public.emitir_recibo(p_pago uuid) returns uuid language sql security invoker set search_path=''
return software_eventos_private.emitir_recibo(p_pago);

create function software_eventos_private.previsualizar_recibo(p_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pagos;
begin
  select * into p from public.pagos where id=p_id;
  if not found or p.deleted_at is not null or not software_eventos_private.recibo_acceso(p.evento_id,case when p.evento_id is null then p.catering_contrato_id end) then
    raise exception 'No tenés acceso al cobro completo' using errcode='42501';
  end if;
  return software_eventos_private.recibo_snapshot(p_id);
end $$;
create function public.previsualizar_recibo(p_pago uuid) returns jsonb language sql security invoker set search_path=''
return software_eventos_private.previsualizar_recibo(p_pago);
revoke all on function software_eventos_private.previsualizar_recibo(uuid),public.previsualizar_recibo(uuid) from public,anon,authenticated,service_role;
grant execute on function software_eventos_private.previsualizar_recibo(uuid),public.previsualizar_recibo(uuid) to authenticated;

-- Diferido: captura el resultado final de la transacción, nunca repartos intermedios.
create function software_eventos_private.recibo_registrar_modificacion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid; r public.recibos; f jsonb; s jsonb;
begin
  if tg_table_name='pagos' then pid := coalesce(new.id,old.id); else pid := coalesce(new.pago_id,old.pago_id); end if;
  if not exists(select 1 from public.recibos where pago_id=pid) then return null; end if;
  perform 1 from public.pagos where id=pid for no key update;
  select * into r from public.recibos where pago_id=pid order by revision desc limit 1;
  f := software_eventos_private.recibo_fuente(pid);
  if f is null or f = r.fuente then return null; end if;
  s := software_eventos_private.recibo_snapshot(pid);
  insert into public.recibos(pago_id,evento_id,catering_contrato_id,revision,tipo,anterior_id,snapshot,fuente,emitido_por)
  values(pid,r.evento_id,r.catering_contrato_id,r.revision+1,
    case when f#>>'{pago,deleted_at}' is not null then 'anulacion' else 'modificacion' end,r.id,s,f,auth.uid());
  return null;
end $$;
create constraint trigger recibo_pago_modificado after update on public.pagos deferrable initially deferred
for each row execute function software_eventos_private.recibo_registrar_modificacion();
create constraint trigger recibo_imputacion_modificada after insert or update or delete on public.pago_imputaciones deferrable initially deferred
for each row execute function software_eventos_private.recibo_registrar_modificacion();
create constraint trigger recibo_cobertura_modificada after insert or update or delete on public.catering_coberturas deferrable initially deferred
for each row execute function software_eventos_private.recibo_registrar_modificacion();
create constraint trigger recibo_componente_modificado after insert or update or delete on public.catering_cobro_componentes deferrable initially deferred
for each row execute function software_eventos_private.recibo_registrar_modificacion();

create function software_eventos_private.recibo_inmutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Los recibos emitidos son inmutables' using errcode='23514'; end $$;
create trigger recibo_inmutable before update or delete on public.recibos for each row execute function software_eventos_private.recibo_inmutable();
create trigger audit_row_change after insert on public.recibos for each row execute function public.audit_row_change('id,pago_id');

revoke all on function software_eventos_private.recibo_fuente(uuid),software_eventos_private.recibo_snapshot(uuid),
software_eventos_private.emitir_recibo(uuid),software_eventos_private.recibo_registrar_modificacion(),software_eventos_private.recibo_inmutable(),public.emitir_recibo(uuid)
from public,anon,authenticated,service_role;
grant execute on function software_eventos_private.emitir_recibo(uuid),public.emitir_recibo(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
