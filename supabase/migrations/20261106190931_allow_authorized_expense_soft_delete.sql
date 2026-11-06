-- UPDATE/RETURNING must see the new tombstone through SELECT RLS.
-- Keep the existing event/salon scope and all restrictive role/active policies.
alter policy egresos_select_by_event_access on public.egresos
using (
  is_admin() or exists (
    select 1 from public.eventos e
    join public.usuario_salon us on us.salon_id = e.salon_id
    where e.id = egresos.evento_id and e.deleted_at is null
      and us.usuario_id = auth.uid()
  )
);
