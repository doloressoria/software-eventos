begin;
-- Run as the same database owner as the existing cheque job.
select cron.schedule('software-eventos-aplicar-ipc', '* * * * *',
  'select software_eventos_private.ejecutar_ipc_programados()');
commit;
