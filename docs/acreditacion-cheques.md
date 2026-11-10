# Acreditación automática de cheques

El cheque permanece en el historial desde el alta. **Fecha de registro** es
`pagos.created_at`, mostrada en Argentina. **Fecha de acreditación** es
`pagos.fecha_pago` para la forma `cheque`. A las 00:00 de
`America/Argentina/Buenos_Aires` de esa fecha pasa de **Pendiente** a
**Acreditado** en la próxima lectura, sin modificar la fila del pago. Para otros
medios, `fecha_pago` sigue siendo la fecha de pago y no difiere la imputación.

Antes del cambio, `fecha_pago` ya era la fecha elegida en el formulario,
incluidos los cheques. No existía un estado bancario ni una fecha separada de
acreditación: los totales incluían el cheque desde que se registraba. Se
conservan ambos valores históricos sin backfill. Un cheque de fecha pasada o
del día sigue acreditado; si hubiera uno histórico con fecha futura, queda
pendiente hasta esa misma fecha. El 10/11/2026 el catálogo y un conteo de sólo
lectura confirmaron que no había cheques registrados en producción.

Las garantías siguen separadas aun cuando su cheque alcance la fecha. Los
pagos con baja lógica quedan fuera. Los USD continúan usando el importe en
pesos generado con la cotización de cada pago. La base de IVA de servicios
conserva la regla vigente: el cobro no efectivo acreditado puede elevarla,
hasta el neto del servicio. Mover o dar de baja un pago no deshace un IVA ya
consolidado. LAB-006 ya está aplicado: el saldo del servicio es el total con IVA
parcial menos el cobrado, redondeado a centavos. El mínimo cero de los resúmenes
de Ingresos se conserva.

`fecha_contrato` es un flujo separado. Sigue siendo el mínimo `fecha_pago` de
los pagos activos del evento según el trigger vigente, inclusive garantías y
cheques pendientes. Si el primer registro es un cheque futuro, esa fecha puede
quedar en el contrato desde el alta; el cambio de día por sí solo no la
reescribe. Confirmar por separado si comercialmente debería significar
«primer cobro ordinario acreditado» y cómo tratar garantías en ese caso.

## Publicación manual en Supabase SQL Editor

1. Ejecutar [preflight-cheques.sql](../supabase/verification/preflight-cheques.sql).
   Confirmar la columna generada `importe_en_pesos`, el validador USD, el saldo
   de LAB-006, `security_invoker=true` en `v_resumen_evento` y el trigger de
   catering atómico. Confirmar que `pg_cron` esté disponible y precargado, y
   que `cron.database_name` coincida con la base del SQL Editor. Si aparecen
   cheques ordinarios futuros previos al cambio, revisar su impacto: el
   primer script corrige sus cobros persistidos sin alterar fechas ni reducir
   una base de IVA que ya estaba guardada.
2. Coordinar una ventana sin altas ni ediciones de pagos. En una transacción
   (`begin;` … `commit;`), ejecutar
   [20261110160147_acreditacion_cheques.sql](../supabase/migrations/20261110160147_acreditacion_cheques.sql).
   Reutiliza LAB-006 y catering atómico; no volver a aplicar sus migraciones.
   Las vistas leen el día argentino al consultar. Los triggers actualizan
   los totales derivados en la transacción de cada escritura acreditada.
3. En otra transacción, ejecutar
   [20261110160420_programar_acreditacion_cheques.sql](../supabase/migrations/20261110160420_programar_acreditacion_cheques.sql)
   como propietario de la base. Instala [Supabase Cron](https://supabase.com/docs/guides/cron/install)
   si falta, registra una sola tarea por nombre y sincroniza una vez. La tarea
   reconcilia totales guardados cada minuto y recupera días omitidos. Los
   cambios del sistema quedan en la auditoría de servicios y contratos, sin
   atribuirlos a un usuario ni simular una edición del cheque.
4. Ejecutar [postflight-cheques.sql](../supabase/verification/postflight-cheques.sql).
   Esperar al menos un ciclo y comprobar `succeeded`, tarea activa y las tres
   vistas como invoker. El cheque se ve acreditado al día aunque la tarea
   aún no haya corrido. Si persisten diferencias de importes, investigar
   antes del deploy: el script no repara deudas históricas ajenas al cambio.
   Si la API aún no reconoce las vistas, recargar su
   [caché de esquema](https://docs.postgrest.org/en/stable/references/schema_cache.html).
5. Desplegar el frontend nuevo y reabrir las escrituras. La versión nueva
   requiere las vistas. La versión previa puede leer y escribir el esquema,
   pero interpreta como cobrados los cheques futuros en sus sumas TypeScript
   y puede sobrescribir un acumulado de servicio. Por eso el intervalo entre
   migración y deploy, incluido un eventual rollback al frontend anterior,
   debe quedar sin escrituras de pagos. Si el proyecto registra migraciones
   por CLI, conciliar el historial después de la aplicación manual para que
   no intente ejecutar de nuevo el DDL.

## Referencia parcial y catálogo desplegado

`schema.sql.txt` exige `evento_id` en contratos, pagos y egresos; las tres
columnas admiten nulos en el repo y en la base para catering externo. El
adjunto presenta cálculos como valores por defecto, pero producción tiene
seis columnas generadas. También muestra `tipo_cambio` con default 1; la
base y la migración USD lo dejan sin default y validan cada escritura.

El adjunto omite contactos estructurados, roles configurables, índices IPC,
historial de precios, `lugar_evento`, funciones, políticas y triggers. Se
confirmó en producción la vista de resumen con RLS, la fórmula de saldo de
LAB-006, el filtro de garantías, las restricciones de vendedor por salón y
los objetos de catering atómico. El historial remoto registra
`20260826211252` sin archivo equivalente en el repo. El repo versiona
`20261005154547` sin entrada remota, aunque sus objetos de catering externo
están presentes. Queda pendiente conciliar el origen y la equivalencia
completa de esas versiones; los scripts de cheques no intentan reconstruir
el esquema base ni requieren reaplicar esos DDL.

## Pruebas

`pnpm test` cubre el corte de medianoche de Argentina, el estado y los
cálculos del cliente. `PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm
test:cheques:db` verifica las escrituras, las lecturas sin esperar al Cron, la
sincronización sin JWT, los roles, la edición y la baja lógica con datos
ficticios en un PostgreSQL efímero. También prueba históricos, garantías, USD, IVA parcial,
catering vinculado y externo y que no se duplica el cobro. Una corrida aislada
con PostgREST 14.5 y pg_cron verificó los joins de la API con JWT ficticios y
ejecutó el job real sin JWT (intervalo acelerado sólo en la prueba).

`pnpm supabase:types` requiere Docker, que no estaba disponible. Se generaron
los tipos de las vistas con el generador oficial de Supabase sobre el clúster
efímero migrado y se conservaron los tipos completos existentes del proyecto.
