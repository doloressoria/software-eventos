# Imputaciones de cobros del evento

En **Eventos → Ingresos**, un cobro tiene entre 1 y 50 destinos distintos. Se
puede elegir cualquier servicio del evento o un contrato de catering activo
vinculado al mismo evento. Cada línea se carga en ARS. La suma debe coincidir
al centavo con el equivalente de la cabecera. Si todavía no hay destinos,
primero se agrega un servicio o se vincula un contrato.

La fecha, forma, moneda, cotización histórica y garantía pertenecen a la
cabecera. Un cheque acredita todas sus líneas desde las 00:00 de Argentina en
la fecha indicada. El total de Ingresos y el flujo de dinero usan una sola
cabecera. Servicios, catering y sus exportaciones usan las partes en ARS.
Las garantías se registran por separado y quedan fuera de los saldos
ordinarios. La fecha de contrato conserva su regla previa.

La función SQL guarda cabecera y líneas en una transacción. Repetir la misma
solicitud de alta con el mismo identificador devuelve la cabecera existente.
Una baja lógica deja el detalle disponible para auditoría y lo excluye de
los saldos. Cambiar las imputaciones genera auditoría por línea con el
identificador del cobro y el actor. Un catering con imputaciones activas no se
puede desvincular, mover ni dar de baja hasta retirar esas imputaciones.

## Transición

Los pagos históricos se leen desde sus destinos originales sin backfill. Al
guardar una edición desde Ingresos del evento, la misma cabecera pasa al
formato distribuido. La conversión usa el permiso de escritura de pagos del
evento, que permite editar al autor o a un administrador. El alta y la
edición de destino único desde Catering siguen disponibles para contratos
vinculados y externos. En el detalle de un catering, un cobro
distribuido muestra sólo su parte y se edita o se da de baja desde el evento.
Una ejecutiva asignada al catering que no tiene acceso al salón puede ver
la parte de su contrato, conforme a los permisos de lectura del módulo.

## Publicación manual

1. Verificar la [acreditación de cheques](acreditacion-cheques.md). La base y
   el frontend de esa etapa se validan antes de habilitar imputaciones. Si
   faltan los dos SQL de cheques, aplicar y verificar esos pasos primero.
2. Ejecutar [preflight-imputaciones.sql](../supabase/verification/preflight-imputaciones.sql)
   en el SQL Editor. Verificar PostgreSQL 15 o superior, las vistas de
   acreditación con `security_invoker=true`, el disparador de auditoría y las
   políticas de acceso a pagos/catering. El esquema previo debe tener
   `pago_destino_exclusivo` para exactamente un destino directo, los triggers
   de pagos activos y `importe_en_pesos` generado a partir del importe y la
   cotización. Revisar cualquier discrepancia antes de aplicar. Los USD
   históricos sin equivalente se conservan sin asignarles una cotización.
3. Con las escrituras de pagos suspendidas, ejecutar en una transacción
   (`begin;` … `commit;`) el
   [SQL de imputaciones](../supabase/migrations/20261110200716_imputaciones_cobros.sql).
   Usar el propietario de la base, como en el runbook de cheques. El Cron
   existente adopta la nueva lógica sin registrar otra tarea.
4. Ejecutar [postflight-imputaciones.sql](../supabase/verification/postflight-imputaciones.sql).
   Las inconsistencias deben ser cero y los controles de permisos y auditoría,
   verdaderos. Verificar también la última ejecución del Cron con el postflight
   de cheques. Si se ejecuta el DDL manualmente, conciliar el historial de
   migraciones antes de volver a publicar con CLI.
5. Desplegar el frontend nuevo y reanudar las escrituras. El frontend nuevo
   requiere la tabla, la vista y la RPC. El anterior puede operar sobre los
   pagos históricos y los de catering mientras aún no existan repartos.
   Después del primer reparto, volver al frontend anterior deja incompletos
   sus listados y exportaciones por destino. En ese caso, mantener la operación
   de cobros suspendida y corregir hacia adelante.

## Diferencias por verificar en la base desplegada

El adjunto parcial declara `evento_id` obligatorio en pagos, contratos y
egresos. El esquema del repo admite nulos para catering externo. El adjunto
describe `importe_en_pesos` con un default, mientras que el esquema del repo
lo genera a partir del importe original y la cotización. El repo fija dos
decimales para importes y cuatro para cotización. El trigger de moneda fija
1 para ARS y exige cotización explícita para USD. La FK de pagos a eventos
tiene `ON DELETE CASCADE` en el esquema de pruebas del repo, mientras que el
adjunto usa la acción por defecto. Verificar también la restricción de
destino exclusivo y las políticas, triggers e historial remoto que el
adjunto no describe. El preflight y el runbook de cheques cubren
estos puntos. No se consultó la base desplegada durante este cambio.

## Pruebas aisladas

```sh
pnpm test
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:imputaciones:db
```

La suite SQL usa un clúster efímero y datos ficticios. Incluye el cheque de
ARS 1.000.000, repartido inicialmente en ARS 700.000 de catering y ARS 300.000
de salón, el cambio de día, el reintento, la edición, la baja, el rechazo de
destinos ajenos, las garantías y la conversión de un pago USD histórico.

En una corrida local con Chrome y PostgREST se verificó el formulario y dos
altas concurrentes de la misma solicitud. También se probó el job real de
`pg_cron` sin JWT con el reloj de prueba adelantado.
