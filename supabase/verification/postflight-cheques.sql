-- Sólo lectura. Correr tras ambas migraciones y, para el historial, esperar un ciclo de Cron.
select software_eventos_private.dia_argentina() as dia_local,
  software_eventos_private.dia_argentina('2026-11-11T02:59:59Z') as antes_de_medianoche,
  software_eventos_private.dia_argentina('2026-11-11T03:00:00Z') as medianoche;

select oid::regclass as vista, reloptions from pg_class where oid in (
  'public.v_resumen_evento'::regclass,
  'public.v_evento_servicios_acreditados'::regclass, 'public.v_catering_acreditado'::regclass
);

select 'servicios' as tipo, count(*) as diferencias
from public.evento_servicios s join public.v_evento_servicios_acreditados v using (id)
where s.total_pagado is distinct from v.total_pagado
  or s.saldo_pendiente is distinct from v.saldo_pendiente
union all
select 'catering', count(*)
from public.catering_contratos c join public.v_catering_acreditado v using (id)
where c.deleted_at is null and (c.total_pagado is distinct from v.total_pagado
  or c.saldo_pendiente is distinct from v.saldo_pendiente);

select count(*) as servicios_con_saldo_incorrecto
from public.evento_servicios
where saldo_pendiente is distinct from round(coalesce(total_con_iva, 0) - coalesce(total_pagado, 0), 2);

select jobid, jobname, schedule, database, username, active
from cron.job where jobname = 'software-eventos-acreditar-cheques';
select r.status, r.return_message, r.start_time, r.end_time
from cron.job_run_details r join cron.job j using (jobid)
where j.jobname = 'software-eventos-acreditar-cheques'
order by r.start_time desc limit 5;
