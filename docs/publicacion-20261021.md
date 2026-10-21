# Publicación de pagos y contactos — 2026-10-21

## Destino y base de datos

Rama `main`, remoto `git@github.com:doloressoria/software-eventos.git`.
Supabase `software-eventos-db` (`juxczmoqsiumphjwhhbc`), configurado en el entorno
local y perteneciente a la integración de Vercel. Proyecto frontend
`software-eventos`, equipo `zubillagasalvador1-5982s-projects`, conectado al mismo
repositorio y rama de producción. La base se actualizó antes del push.

Los informes anteriores describen la preparación y sus pendientes en ese momento.
Esta publicación completa la aplicación de base y la regeneración de tipos que
estaban pendientes, bajo autorización explícita del usuario.

Se ejecutaron los tres preflights y se compararon las funciones existentes con
el fixture probado. No había objetos de contactos en conflicto ni pagos con
combinaciones monetarias inválidas. Sólo estaba registrada la migración
`20260826211252_drop_conflicting_auth_user_trigger`.

Aplicadas en este orden, sin ejecutar el SQL de referencia ni hacer backfill:

1. `20261021145259_unblock_payments_and_summary_access.sql`
2. `20261021152307_evento_contactos.sql`
3. `20261021155412_payments_manual_usd.sql`

La herramienta MCP aplicó el SQL íntegro en transacciones y creó sus entradas de
historial. Como asigna timestamps de ejecución, se conciliaron inmediatamente
las versiones del historial con los nombres locales. Cada conciliación exigió
coincidencia exacta de nombre, versión creada y SQL almacenado; no se cambiaron
las sentencias. El historial final contiene la migración anterior y esas tres
versiones, sin duplicados ni repeticiones.

## Recuperación y respaldo

Se capturaron funciones, triggers, políticas, constraints, columnas, grants y
opciones de vista antes de aplicar. Las definiciones y los scripts de recuperación
están fuera del repositorio, en el directorio privado local
`~/.codex/backups/software-eventos/20261021-release` (directorio 0700, archivos 0600).
No contiene una copia de filas de clientes/pagos; se usaron huellas para comparar
su integridad. Los respaldos y resultados privados no se incluyen en Git.

Se probó la recuperación de USD y luego de las definiciones anteriores en un
cluster PostgreSQL efímero: 47 comprobaciones aprobadas, incluidas conservación
de filas de pagos y de la tabla de contactos, restauración de triggers y retirada
del trigger USD. La recuperación mantiene la vista segura. Tras una publicación,
las correcciones de DDL deben registrarse como nuevas migraciones; no se debe
borrar contactos ni modificar retroactivamente el historial aplicado.

La consulta de backups físicos por CLI devolvió 403. No se verificó disponibilidad
de un backup físico ni PITR y no se ejecutó una restauración del proyecto.
El respaldo preparado cubre DDL; no es un respaldo completo de datos.

## Verificación final

- Las diez funciones nuevas/reemplazadas coinciden exactamente con el catálogo
  obtenido al aplicar los mismos archivos en PostgreSQL aislado.
- Índices, constraints, tres políticas y triggers de contactos coinciden con ese
  catálogo. Se verificaron RLS, guard de contacto anterior, permisos de las RPC y
  el trigger de moneda. Supabase agrega el grant habitual de `service_role`,
  además del propietario y los grants explícitos a authenticated; anon no obtiene
  acceso a contactos ni a sus RPC.
- `tipo_cambio` no tiene DEFAULT; `importe_en_pesos` sigue generado. El trigger
  excluye garantías y reconoce efectivo USD. La vista usa security_invoker.
- Las huellas completas de pagos, eventos, servicios, contratos y auditoría son
  iguales antes y después de las migraciones. No se crearon eventos, contactos
  ni pagos ficticios en producción.
- Lecturas contra la base real con SET LOCAL ROLE e identidades existentes:
  admin ve cinco eventos/resúmenes y cinco contextos; vendedor ve tres y no
  puede leer resumen ni contactos de un evento fuera de su asignación. Anon no
  accede a resúmenes, tabla de contactos ni RPC. Son comprobaciones de RLS real,
  no sesiones HTTP independientes de cada rol.
- El advisor ya no informa la vista security definer. Permanecen avisos previos:
  dos search_path mutables, helpers SECURITY DEFINER ejecutables y protección de
  contraseñas filtradas desactivada. No se cambió configuración ajena al alcance.
  Referencias: [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
  [RPC anónimas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [RPC autenticadas](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Tipos y checks

`pnpm supabase:types` volvió a fallar por Docker apagado. La alternativa CLI remota
no tiene privilegios suficientes; el generador oficial vía MCP sí devolvió el
schema public completo de la base final. Se comprobó que incluye sus 21 tablas,
dos vistas y todos los enums/RPC anteriores, más contactos; no se usó un fixture
parcial ni se sobrescribió el archivo con una respuesta vacía.

Se mantuvieron anotaciones `never` de escritura para las seis columnas generadas
y el argumento nullable de creación de roles, que el generador no representa.
Los tipos reflejan ahora la categoría existente `tecnica` y full_name nullable.
Se añadieron sus etiquetas y manejo mínimo del nombre ausente; el rollback de Auth
preserva un nombre null. No se agregaron funciones comerciales nuevas.

Checks tras actualizar tipos:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (78 pruebas), `pnpm build`: aprobados.
- PostgreSQL aislado: pagos anteriores 66, USD 43, contactos 46 y concurrencia real:
  aprobados. Recuperación privada: 47 comprobaciones aprobadas.

La diferencia de fórmulas de catering SQL/TS y del saldo generado de servicios
permanece documentada en `pagos-usd.md`; esta publicación no corrige importes
históricos ni decide esas fórmulas.
