# IPC con fecha de vigencia

## Límite histórico y recuperación

Antes de implementar la recuperación se revisaron las RPC desplegadas, las
migraciones de cheques, imputaciones y cobertura, y el disparador de auditoría.
La auditoría de UPDATE guarda sólo campos modificados. No hay un snapshot
completo por día de estados de eventos, destinos de pagos, bajas, PAX, tarifas
y coberturas. `fecha_pago` tampoco indica cuándo una edición estuvo vigente.
Por eso no es seguro reconstruir el saldo de un día pasado con el estado actual.

La ejecución automática sólo aplica durante el día de vigencia en Argentina.
Reintenta dentro de ese día, recalculando estados y saldos en la transacción.
Si la fecha ya pasó sin ejecución, queda en revisión con motivo visible y no
modifica contratos. No se retrodata ni se toma el saldo de hoy como histórico.
Para recuperar una fecha pasada hace falta reconstrucción y conciliación manual
con evidencia suficiente, o incorporar snapshots completos antes de habilitar
esa recuperación. Reprogramar una ejecución pendiente para hoy o una fecha
futura es una decisión administrativa explícita; no conserva la fecha original.

## Alcance y cálculo

Se conserva el permiso actual: administrador activo. Se incluyen servicios y
caterings vinculados a eventos activos, confirmados y con fecha de evento igual
o posterior a la vigencia. Los caterings externos quedan excluidos por decisión
del usuario: falta su criterio de confirmación.

El IPC se calcula sobre el saldo positivo en ARS después de reconocer los
cheques vencidos, los pagos repartidos y la cobertura PAX. Las garantías no
reducen esa base. El ajuste es monetario sobre el saldo final, redondeado a
centavos; no cambia la cotización USD, las tarifas ni las coberturas históricas.
Se muestra separado del IVA y se cobra por importe. Pagar sólo los PAX
pendientes a su tarifa vigente no cancela por sí solo el cargo IPC separado.

La previsualización usa los datos actuales y la fecha elegida para acreditar
cheques; no pronostica pagos, confirmaciones ni cambios futuros. La ejecución
vuelve a evaluar todo y registra base, índice, vigencia, incremento y saldo.

## Publicación manual y compatibilidad

Las dos migraciones se aplicaron el 10/11/2026 mediante el conector de Supabase,
con autorización posterior del usuario. No volver a ejecutarlas en esa base.
El frontend queda preparado en la rama para su publicación.
La rama parte de `origin/main` en `0330fe98`, con las etapas anteriores integradas.

Ejecutar los SQL completos en este orden, como el propietario de las funciones
existentes (el catálogo consultado usa `postgres`):

1. [Prevalidación](../supabase/verification/preflight-ipc-programado.sql).
   Confirmar PostgreSQL 17 o superior, propietarios iguales, Cron instalado,
   RLS activa y vistas invoker. Los totales y saldos de servicios deben ser
   generados; el saldo de catering debe ser derivado por trigger. Deben existir
   las funciones de cheques y catering por personas. Guardar conteos históricos,
   definiciones de funciones, políticas y restricciones; `indices_invalidos`
   debe ser cero. La tabla `ipc_indices` no debe tener ya un trigger llamado
   `audit_row_change`. Revisar toda diferencia antes de continuar.
2. [Migración de datos y RPC](../supabase/migrations/20261110224729_ipc_vigencia_programada.sql).
   Incluye su propia transacción y recarga de PostgREST. Agrega dos tablas y
   dos columnas derivadas, conserva los registros anteriores y no aplica IPC
   histórico ni recalcula precios. El cambio de expresión de las columnas
   generadas reescribe totales con un ajuste inicial cero.
3. [Registro de Cron](../supabase/migrations/20261110224738_programar_ipc_cron.sql).
   Registra `software-eventos-aplicar-ipc` cada minuto. La fecha se resuelve
   dentro de PostgreSQL en `America/Argentina/Buenos_Aires`, independientemente
   del huso del servidor. El primer intento del día ocurre en el primer tick
   del Cron; una programación guardada para hoy se procesa en el próximo tick.
   La tarea sigue funcionando aunque el frontend esté cerrado.
4. [Posvalidación de datos y permisos](../supabase/verification/postflight-ipc-programado.sql)
   y [posvalidación del Cron](../supabase/verification/postflight-ipc-cron.sql).
   Esperar RLS y permisos correctos, tres triggers de auditoría, vistas invoker,
   cero inconsistencias del registro y de ajustes acumulados. Guardar y comparar
   los conteos previos de índices, pagos y coberturas. Revisar por separado
   diferencias preexistentes de saldos almacenados frente a las vistas; las
   vistas reconocen cheques incluso antes de que corra su Cron. El job debe ser
   único, activo, con el comando y propietario indicados. Después del próximo
   minuto debe haber una ejecución `succeeded`, aun sin programaciones pendientes.
5. Publicar el frontend nuevo. El anterior sigue pudiendo operar eventos,
   cobros y catering, pero su botón de aplicación inmediata de IPC queda
   bloqueado por la RPC con un error explícito. Reservar una ventana corta
   para este módulo entre SQL y frontend. El frontend nuevo requiere ambas
   migraciones. Tras registrar ajustes, conservar el esquema y corregir hacia
   adelante si hubiera que recuperar el frontend; no borrar el registro ni
   retirar columnas para intentar un rollback.
6. Conciliar las dos versiones ejecutadas desde SQL Editor con el historial
   remoto antes de volver a usar despliegues por CLI. No hacer `db push` o
   `db reset` global: falta el baseline completo en el repositorio.

Las programaciones pueden modificarse antes de su aplicación, conservando la
misma identidad por período y dejando auditoría. Un índice cargado es inmutable;
no se reutilizan índices históricos del flujo anterior para volver a ajustar.
Los reintentos de una programación aplicada devuelven el mismo ID y no escriben.
La fecha de ejecución y el resultado quedan consultables en la pantalla; el
registro por destino queda en `ipc_aplicaciones` y en la auditoría administrativa.

La tarea toma el bloqueo existente de IPC y bloqueos breves de escritura sobre
los datos financieros y eventos mientras ejecuta cada programación. Si no puede
obtenerlos en cinco segundos, revierte ese intento y reintenta durante ese día.
Cada programación es atómica: un error revierte sincronización de cheques,
ajustes y registros del intento, y deja el motivo. Si el día cambia mientras
espera o calcula, revierte y exige revisión histórica. La duración de estos
bloqueos debe observarse con volumen real; si resulta necesario, se reemplazarán
por una coordinación por destino sin perder la consistencia con pagos y PAX.

Los cargos IPC quedan separados del IVA y visibles en servicios, catering y
Excel. Los saldos, resúmenes y reportes consumen los totales SQL que ya incorporan
el ajuste. Se conservan las bajas lógicas existentes. La eliminación existente
de servicios sin pagos sigue disponible: el registro IPC retiene el identificador
del servicio eliminado para conservar su resultado histórico.

## Contraste con `schema.sql.txt` y la base

Se leyó `/Users/franciscolang/Downloads/schema.sql.txt`, se contrastó con tipos,
fixtures y migraciones, y se consultó sólo el catálogo de la base desplegada el
10/11/2026, sin escrituras:

| Referencia parcial | Repo y catálogo desplegado antes de este cambio |
| --- | --- |
| No contiene `ipc_indices` ni relación del índice en `actualizaciones_ipc` | Existen ambos, además de las RPC de preview y aplicación inmediata. La RPC excluye cualquier servicio con pagos ordinarios y aplica a servicios confirmados y vigentes. |
| `evento_id` obligatorio en pagos, egresos y catering | Los tres admiten nulos para catering externo. |
| Equivalente ARS de pagos como default | Es generado a partir del importe original y su cotización histórica. |
| Saldo de servicio con IVA sobre toda la base | Es generado con IVA parcial sobre `iva_base_imponible`. |
| Saldo de catering como default | Es una columna ordinaria derivada por trigger; contempla la cobertura PAX. |
| Sin repartos ni cobertura por categoría | El repo y las migraciones previas contienen imputaciones distribuidas, precios por categoría y coberturas históricas. |
| Sin políticas, funciones, triggers ni Cron completos | El catálogo de IPC sólo permite cargar/aplicar a administradores activos. La auditoría de UPDATE guarda diferencias, no snapshots completos. |

La prevalidación y las posvalidaciones se ejecutaron contra el catálogo
desplegado: propietarios y ACL correctos, cero inconsistencias y sin cambios
en los 21 pagos anteriores. Las nuevas columnas, tablas, RPC y tarea ya están
instaladas. El adjunto sigue siendo insuficiente para reconstruir fechas pasadas.
Antes de repetir el procedimiento en otro entorno hay que volver a validar su
catálogo y comparar los conteos.

## Verificación aislada

```sh
pnpm test
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:ipc:db
# Requiere una instalación local de PostgreSQL 17 con pg_cron disponible:
PG_BIN=/ruta/a/postgresql17/con/pg_cron/bin pnpm test:ipc:cron
pnpm lint
pnpm typecheck
pnpm build
pnpm supabase:types
```

Los dos comandos SQL crean y destruyen su propio clúster y no aceptan URL remota.
La variante Cron usa la migración real, verifica su configuración y acelera
únicamente la tarea de ese clúster a un segundo para comprobar su ejecución.
Los tests verifican saldo parcial, cheque del mismo día y futuro, reparto,
USD histórico, garantías, bajas, PAX, cambios posteriores a preview, falta de
índice, recuperación durante el día, revisión al vencer, reducciones, rollback,
RLS, auditoría, intentos concurrentes y concurrencia con un cobro en curso.

Se probaron además las Server Actions y el formulario en Chrome con
PostgreSQL/PostgREST locales y Auth simulada: previsualización, confirmación,
guardado, índice faltante y presentación en escritorio/móvil. No reemplaza una
prueba con Supabase Auth real en staging.

El comando local `pnpm supabase:types` no pudo usar Docker. La regeneración
completa se resolvió con la herramienta oficial del conector de Supabase,
contra el esquema ya migrado. Se conservaron las restricciones de escritura
`never` y los argumentos RPC nullable que el generador no representa. Las
columnas se contrastan además contra el catálogo del clúster aislado.
No se cambiaron dependencias.

## Aplicación y posvalidación del 10/11/2026

| Versión registrada y archivo del repo | Resultado |
| --- | --- |
| `20261110224729_ipc_vigencia_programada.sql` | Aplicada correctamente, como `postgres`. |
| `20261110224738_programar_ipc_cron.sql` | Aplicada correctamente; tarea única y activa cada minuto. |

Los nombres locales se alinearon con las versiones asignadas por el conector.
El historial remoto ya está conciliado; no requiere reparación manual.
La posvalidación confirmó RLS, ausencia de escrituras directas del cliente,
worker privado, RPC restringida a autenticados, tres triggers de auditoría y
vistas invoker. Dio cero inconsistencias de registro, acumulados y saldos frente
a sus vistas. Se conservaron 21 pagos, cero índices, cero actualizaciones y cero
coberturas. No se cargaron índices ni programaciones ficticias en producción.

El job `software-eventos-aplicar-ipc` registró una ejecución `succeeded` a las
19:48 de Argentina, sin sesión de usuario. El Cron de cheques se conserva.
Los advisors señalan las dos RPC nuevas como `SECURITY DEFINER` ejecutables por
usuarios autenticados: es intencional, ambas validan administrador activo antes
de leer o escribir. El worker no es ejecutable por clientes. Las demás
observaciones son previas a esta migración; no se modificaron fuera de alcance.
Ver [criterio del advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Archivos y resultados

- SQL: dos migraciones nuevas, prevalidación, dos posvalidaciones,
  `supabase/tests/ipc-programado.sql` y `supabase/tests/fixtures/ipc-baseline.sql`.
- Interfaz: página y acción de `admin/actualizaciones-ipc`, formulario IPC,
  detalle de catering y sección de valores de servicios.
- Contratos y lecturas: `src/lib/ipc/validation.ts`,
  `src/lib/evento-servicios/queries.ts`, filtro de entidades de auditoría y
  `src/types/database.types.ts`.
- Excel: `workbook.ts`, fixtures y regresión que verifica IPC separado de IVA.
- Pruebas: validación y Server Action de IPC, runner PostgreSQL y comandos de
  `package.json`. README enlaza este procedimiento.

Resultados: `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm build` aprobados.
Las suites SQL aisladas verifican además las columnas de las tablas y vistas
modificadas contra los tipos compartidos. Cron real y dos tipos de concurrencia
se probaron con PostgreSQL 17.11 local. La regeneración completa de tipos está resuelta. El
recorrido con Supabase Auth real en staging sigue pendiente; la prueba local usó
Auth simulada. La recuperación histórica automática permanece deshabilitada;
no queda pendiente una regla de confirmación de catering externo: se excluyó
según la decisión del usuario.
