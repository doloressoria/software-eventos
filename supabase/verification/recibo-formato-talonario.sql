-- Sólo lectura. Repetir antes y después de activar, y comparar el inventario.
select current_user,pg_get_userbyid(proowner) as propietario,prosecdef,proacl,pg_get_functiondef(oid)
from pg_proc where oid='software_eventos_private.recibo_snapshot(uuid)'::regprocedure;
select snapshot->>'version' as formato,count(*) from public.recibos group by 1 order by 1;
select count(*) as formatos_desconocidos from public.recibos where snapshot->>'version' not in ('1','2');
select count(*) as recibos_antes_o_despues,md5(coalesce(string_agg(to_jsonb(r)::text,'' order by id),'')) as huella_recibos from public.recibos r;
select not has_function_privilege('authenticated','software_eventos_private.recibo_snapshot(uuid)','EXECUTE')
  and not has_function_privilege('anon','software_eventos_private.recibo_snapshot(uuid)','EXECUTE') as snapshot_privado;
select count(*) as cadenas_invalidas from public.recibos r left join public.recibos a on a.id=r.anterior_id
where r.revision>1 and (a.id is null or a.pago_id<>r.pago_id or a.revision<>r.revision-1);
