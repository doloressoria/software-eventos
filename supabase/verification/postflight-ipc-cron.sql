-- Read-only, after installing the IPC Cron job. Expect exactly one active row,
-- same owner as the worker, and the precise command below.
select j.jobid,j.jobname,j.schedule,j.command,j.active,j.username,
  j.username=pg_get_userbyid(p.proowner) as propietario_correcto,
  j.schedule='* * * * *' and j.command='select software_eventos_private.ejecutar_ipc_programados()' as comando_correcto
from cron.job j cross join pg_proc p
where j.jobname='software-eventos-aplicar-ipc'
  and p.oid='software_eventos_private.ejecutar_ipc_programados()'::regprocedure;
select r.status,r.start_time,r.end_time,r.return_message from cron.job_run_details r
join cron.job j using(jobid) where j.jobname='software-eventos-aplicar-ipc'
order by r.start_time desc limit 10;
