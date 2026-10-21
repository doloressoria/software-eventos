# Contactos y verificación de staging — 2026-10-21

## Resultado de staging: bloqueado, sin aplicar

Se revisaron `docs/verificacion-bloqueos.md`, la migración de pagos y las
conexiones/configuración disponibles. Supabase lista un único proyecto de esta
aplicación, `software-eventos-db`, y ninguna rama de desarrollo. La segunda
cuenta disponible contiene un proyecto de otra aplicación. El checkout tiene
variables Supabase comunes, sin conexión de staging ni configuración Vercel
que identifique un backend separado.

No se identificó un staging separado y autorizado al que conectar. No se creó
uno, no se usó otra aplicación como staging y no se ejecutó ninguna escritura
remota. La migración anterior sigue pendiente de aplicación compartida.
**No se verificaron en staging HTTP, JWT reales, permisos ni triggers.**
Se conserva como evidencia únicamente metadata de entornos; no se consultaron
registros de clientes ni se registraron credenciales.

Para desbloquear: disponer de un proyecto/rama de staging independiente con
esquema compatible, frontend configurado para esa base y acceso administrativo
de pruebas. Usar cuentas ficticias de administrador, vendedor de salón A/B,
ejecutiva asignada, lector e inactivo. Después aplicar las comprobaciones previas
de pagos y repetir por HTTP con JWT de cada cuenta las altas, garantías, pagos
externos, bajas y lecturas permitidas/denegadas. No usar datos ni usuarios reales.

## Funcionalidad local

- Contactos pertenecen al evento: nombre obligatorio, teléfono/correo opcionales,
  función o relación, observaciones y principal opcional.
- Alta y edición del evento incluyen el editor de múltiples contactos.
  El detalle del evento y del catering asociado comparten la misma colección.
- Desde el catering asociado se pueden editar contactos según el permiso de
  catering, sin habilitar la fila del evento ni su información financiera.
- Lectores ven la colección; gestores pueden agregar, editar y quitar.
  Quitar guarda una baja lógica. No hay borrado físico autenticado ni módulo
  global de clientes.
- Un índice único parcial garantiza un máximo de un principal activo por evento.
  El evento de un contacto es inmutable, también ante escrituras directas.

## Transición del contacto anterior

`eventos.cliente_contacto` no se elimina, migra, divide, interpreta ni copia.
Se conserva byte por byte, incluidos espacios y saltos de línea. Se muestra una
sola vez en la sección de contactos como “Contacto anterior · texto conservado”,
separado de los contactos estructurados. No se lo vuelve a mostrar como otro
campo del bloque Cliente ni del catering vinculado.

El editor de eventos dejó de escribirlo; el RPC comercial excluye esa clave y un
trigger impide sobrescribirla desde clientes anteriores o la API directa.
El campo sigue disponible para lectura y para el historial de auditoría.
Una futura decisión de migración manual queda fuera de esta entrega.

Se revisaron todos sus lectores/escritores en src: validación/acciones/formulario
y detalle de eventos; consultas, formato de visualización, formulario y acciones
de catering; tipos y presentación de auditoría. Catering vinculado usa la
proyección autorizada del evento. **El contacto de catering externo conserva su
formulario y comportamiento actual**, sin crear contactos de evento ficticios.

## Permisos e integridad

La tabla `evento_contactos` tiene RLS y grants explícitos por columna.
Las políticas exigen usuario activo y evento activo, además de acceso al evento
y permiso de pantalla, o acceso al catering vinculado y permiso de catering.
Se reutilizan los helpers reales de usuario/salón/catering; vendedor sigue
limitado por salón. No se concede acceso por tener sólo reportes de cartera externa.

`contactos_privado` contiene únicamente los helpers de esta funcionalidad y
no debe agregarse a los schemas expuestos por la Data API. Sus helpers con
SECURITY DEFINER comprueban autorización y usan search_path fijo; no escriben
eventos ni conceden acceso genérico a datos del evento. El RPC público de contexto
devuelve sólo legado, colección activa, versión y capacidad de editar.
Los RPCs de escritura son SECURITY INVOKER y ejecutan RLS.

El guardado conjunto usa `guardar_evento_con_contactos`: una transacción para el
evento, sus contactos y el desmarcado existente de servicios sin organizador.
El autocompletado existente de precios mensuales continúa después, como antes;
no cambia la transacción de contactos ni las fórmulas de servicios/catering.
Los datos de contacto no se envían a logs de errores.

Cada guardado de colección toma un lock por evento y compara una versión derivada
de los registros activos. Una versión obsoleta produce 40001: no sobrescribe
ediciones ajenas. El formulario conserva el borrador y muestra el error; se debe
recargar y revisar antes de reintentar. No se fusionan automáticamente listas
concurrentes ni se permite que un payload ausente se interprete como “quitar todos”.
El contexto devuelve versión y lista en una misma consulta.

Las bajas, desmarcados y altas se revierten juntos ante cualquier error, incluida
una referencia a un contacto de otro evento. Se conserva `audit_row_change`, con
actor y SOFT_DELETE; se agregó la entidad y sus campos al filtro/presentación.
Los registros eliminados permanecen en la tabla y auditoría, pero el contexto
de aplicación devuelve únicamente contactos activos. RLS impide restaurarlos
mediante una actualización ordinaria.

## SQL y despliegue

Nueva migración independiente:
`supabase/migrations/20261021152307_evento_contactos.sql`.
No modifica la migración de pagos ni datos históricos; crea una tabla, índices,
helpers, RPCs, políticas y triggers propios. No cambia fórmulas, IVA, monedas ni
estados de aprobación.

1. Identificar staging y conciliar su historial: el repositorio sigue sin tener
   el baseline completo, por lo que no corresponde ejecutar un push/reset global.
2. Ejecutar y revisar `supabase/verification/preflight-payments.sql` y después
   `supabase/verification/preflight-contactos.sql`. Comparar definiciones con el
   fixture inspeccionado; si tabla o schema de contactos ya existen, detener y
   resolver esa diferencia. No reemplazarlos.
3. Aplicar primero la migración de pagos y luego la de contactos, cada una con
   transacción única y ON_ERROR_STOP, usando el procedimiento del entorno.
   Ejemplo, con conexión de staging provista por el operador:

   `psql "$STAGING_DATABASE_URL" -X --single-transaction -v ON_ERROR_STOP=1 -f supabase/migrations/20261021152307_evento_contactos.sql`

4. Confirmar que public es un schema expuesto, que la tabla/RPCs sean accesibles
   para authenticated y que contactos_privado permanezca sin exponer.
   Revisar advisors y regenerar tipos completos desde el entorno actualizado.
5. Desplegar el código sólo con esta migración aplicada; la UI necesita los RPCs.
   Verificar HTTP/JWT con cuentas ficticias antes de seguir hacia producción.
   Esta entrega no autoriza ni ejecuta aplicación en producción.
6. Ante error de aplicación SQL: ROLLBACK. Una vez que existan contactos, no
   recuperar haciendo DROP TABLE ni borrando auditoría. Para retirar la UI,
   conservar tabla/datos y el guard de legado; planificar cualquier cambio de
   transición en una migración posterior. Los clientes antiguos que intenten
   editar cliente_contacto recibirán un error explícito, no sobrescribirán texto.

## Pruebas y limitaciones

- `pnpm test`: 63 pruebas aprobadas; validación de nombre/correo/tipos/ids/principal, payload explícito,
  preservación de borrador y versión ante error SQL o conflicto. Nuevos archivos
  incluidos en la enumeración explícita del script.
- `PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:contactos:db`:
  46 comprobaciones aprobadas sobre PostgreSQL con el catálogo aislado del proyecto y datos
  ficticios: CRUD/baja lógica, legado exacto, principal único, perfiles, permisos
  directos y por RPC, acceso por catering sin leer evento, referencias ajenas,
  alta conjunta, colección vacía, rollback de evento/contactos/auditoría.
  Además abre dos sesiones simultáneas: un cambio se confirma, el otro recibe
  40001 y queda exactamente un principal.
- `pnpm test:db`: 66 comprobaciones anteriores de pagos y recuperación aprobadas.
- `pnpm lint`, `pnpm typecheck` y `pnpm build`: aprobados.
- `pnpm supabase:types` se ejecutó y sigue bloqueado por Docker ausente. Para
  esta entrega sí se generaron los nuevos tipos desde el catálogo PostgreSQL
  aislado usando el motor oficial `@supabase/postgrest-typegen@0.6.0`. Se
  incorporaron únicamente la tabla nueva y los tres RPCs al archivo existente,
  evitando regenerar objetos ajenos desde un fixture parcial. No se añadió una
  dependencia al proyecto. Regenerar el esquema completo al disponer de staging.

Estas pruebas no usan Auth/PostgREST ni JWT reales: auth.uid del fixture representa
la identidad de prueba, mientras que las políticas, constraints y transacciones
se ejecutan en PostgreSQL. No se comprobó navegación en navegador ni flujo HTTP
integrado por la falta del entorno. La concurrencia probada corresponde al RPC
de guardado de contactos, no a todas las escrituras posibles de otros módulos.
