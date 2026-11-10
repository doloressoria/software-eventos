-- Run as the database owner from the SQL Editor, after acreditacion_cheques.
create extension if not exists pg_cron;
select cron.schedule('software-eventos-acreditar-cheques', '* * * * *',
  'select software_eventos_private.sincronizar_cheques()');
select software_eventos_private.sincronizar_cheques();
