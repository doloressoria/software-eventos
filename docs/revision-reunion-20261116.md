# Revisión de reunión 10/11 y pedidos IVA/USD — 16/11/2026

> El diagnóstico y la matriz iniciales se conservan como evidencia. La aplicación remota, los tipos oficiales y la configuración de Kiria quedaron resueltos con autorización posterior; el estado actualizado se registra en la última sección.

## Alcance y referencia

La revisión comenzó en `main`, `25696b184e58dd6fa7708ed76db0ba956989480d`.
Había cambios previos en `src/types/database.types.ts` y `.pnpm-store/`.
Durante el trabajo se incorporó `8e4e398e1b943c8fbe543831021d0f52b2421eda`,
que sincroniza esos tipos y documenta la aplicación del IVA separado. Se conservó.
Esta entrega agrega cambios locales sobre ese estado; no crea commits, no hace
push, no ejecuta escrituras remotas ni publica frontend.

Se contrastaron los seis runbooks pedidos con UI, acciones, consultas, SQL,
fixtures, tipos y pruebas. `schema.sql.txt` y los fixtures son referencias
parciales: no se usaron como baseline ejecutable de producción.

## A. Diagnóstico y evidencia anterior a modificar

- `pnpm test`: 138 pruebas aprobadas.
- PostgreSQL 17 efímero, sólo datos ficticios: cheques 23, detalle-pagos 127,
  IPC 165, USD 43 y catering atómico 21 comprobaciones SQL aprobadas; también
  se ejecutaron las pruebas de concurrencia que acompaña cada suite.
- La lógica existente ya resuelve cheques por día argentino, cobertura entera,
  tarifas específicas/fallback/cero, adicionales, fijos, historia de PAX,
  repartos, IPC sobre saldos elegibles e IVA separado/redondeo USD.
  No se reimplementó ninguno de esos modelos financieros.
- Fallo verificable: el proxy de Excel autorizaba lectura y luego exigía gestión
  por segunda vez. El test nuevo reproduce un lector autorizado y comprueba que
  recibe la respuesta de sesión, sin redirección. La misma regla cubre recibos.
- Pendientes: Total de PAX, descarga individual persistente y varias tarifas
  históricas en reasignación. Ya existía selección de origen por pago/categoría,
  pero UI y SQL la bloqueaban cuando había dos tarifas. Se completó esa ruta,
  con preview del capital real y validación del importe después del bloqueo.

## Estado remoto comprobado por lecturas

Supabase `software-eventos-db` (`juxczmoqsiumphjwhhbc`): lista de migraciones
consultada el 16/11 confirma versiones de cheques, imputaciones, PAX, IPC y
`20261115231648_catering_iva_separado_usd`. También se verificaron las firmas
públicas/privadas de cobro PAX y reasignación, componentes con RLS y vistas de
catering invoker. Contador leído de desgloses inconsistentes: cero. La tabla
`recibos` todavía no existe remotamente. La presencia en catálogo no equivale
a una prueba de negocio con clientes reales. No se ejecutaron RPC de escritura.

Vercel, por `get_project` y `get_deployment`, informó producción `READY`,
`dpl_826YWbw6ULsSSBokJM5acDMAMHE5`, commit **8e4e398e**, rama `main`.
Esto acredita qué código está publicado; no acredita HTTP, Auth ni recorridos
financieros en ese sitio. Los cambios locales de esta entrega **no están
publicados**. No se publicó, promovió ni canceló ningún despliegue.

## Matriz requisito / evidencia / resultado

Los conteos de suites comparten regresiones; **no sumarlos** como pruebas únicas.
«DB previa» y «código previo publicado» se refieren a las lecturas anteriores.

| Requisito | Evidencia concreta | Resultado local | DB remota / despliegue |
| --- | --- | --- | --- |
| Cheque no cancela antes de fecha argentina; acredita una vez | `supabase/tests/cheques.sql`, `pagos/calculos.test.ts`; medianoche, cron de reconciliación invocado directamente, reintento y saldo | Aprobado | DB previa y código previo publicado; sin prueba HTTP de esta revisión |
| Cheques: garantía, baja, USD, IVA previo | Suites cheques e imputaciones; edición/baja, garantía fuera del cobrado, cotización histórica | Aprobado | Modelo previo confirmado por catálogo |
| Cantidades enteras, precios por categoría/fallback/cero | `catering/coberturas.test.ts`, `catering-cobertura.sql` | Aprobado | Modelo previo aplicado/publicado |
| Adicionales por categorías y cargos fijos una vez | `catering-cobertura.sql`, `catering-fiscal.sql`, workbook tests | Aprobado | Modelo previo aplicado/publicado |
| Recotización conserva cobertura histórica | Suites PAX, fiscal y Excel | Aprobado | Modelo previo aplicado/publicado |
| Excedentes 100 → 90 con dos tarifas | `recibos.sql`: 50 personas a 100 y 50 a 200; libera 10 del origen a 200 | Aprobado: 2.000 reales al salón; no toca el otro origen ni crea ingreso | Nueva sobrecarga local; pendiente aplicar/publicar |
| Excedentes: capital real, IVA, ajuste, pertenencia y reintento | Fiscal prueba ambos signos e IVA conservado; nuevo helper prueba preview real; nueva RPC comprueba importe y `liberada` bajo bloqueo; rechazo de actor no autorizado | Aprobado; API vieja conserva su comportamiento | Nueva confirmación pendiente; mecanismos previos aplicados |
| Un cobro distribuido, cabecera una vez | `imputaciones.sql`, `detalle-pagos.sql`, workbook tests | Aprobado; suma ARS conciliada y caja sin duplicar | Modelo previo aplicado/publicado |
| IPC: período mensual separado de vigencia concreta | `ipc-programado.sql`, validación/acciones IPC; confirmado, saldo parcial, PAX, cheques, garantía, preview cambiante, índice ausente y reintentos | 165 comprobaciones + workers/cobro concurrentes aprobados | DB/Cron registrados previamente; no se cambió su programación |
| IPC: no duplicar ni reconstruir pasado sin evidencia | Suite IPC verifica idempotencia y revisión de fecha vencida | Aprobado | Sin reinterpretación de historia |
| IVA 20M × 30% × 21% = 1,26M; total 21,26M | Primeras comprobaciones de `catering-fiscal.sql` | Aprobado | Migración fiscal ya aplicada, no reaplicada |
| IVA inicial no cubre personas ni se cobra dos veces | Fiscal: sólo IVA y dos cobros de capital; cobertura pendiente verificada | Aprobado | Modelo previo aplicado/publicado |
| USD 83,33 × 1200 = 99.996 y ajuste 4 | Tests TS exactos, fiscal SQL, ejemplo PDF | Aprobado; ajuste separado del ingreso | Modelo previo aplicado/publicado |
| Legacy y versiones sin reconstruir capital/IVA | Inventario anterior/posterior en suite fiscal; límites de adopción y bajas históricas | Aprobado | Sin conversiones de historia |
| Total contratados/cubiertos/por acreditar/pendientes/excedentes/saldo PAX | Helper compartido, render SSR real de `CoberturaResumen`, test de fila Total XLSX | Aprobado; no suma tarifas ni duplica «por acreditar» | UI/Excel locales, pendientes publicar |
| Cantidad × tarifa/base/adicionales y subtotal por categoría | Resumen desplegable UI y Excel de catering; distinción versión 1/2 y saldo general | Implementado; render SSR y workbook aprobados | Local |
| Recibo individual: preview, emisión y PDF | Nuevas rutas evento/externo; acción y respuesta con fronteras Supabase simuladas, SQL real aislado, PDF inspeccionados | Aprobado por capas; no se probó HTTP/Auth completo | Nueva migración pendiente; no publicado |
| Identidad, cliente, evento, lugar, PAX y conceptos | Snapshot SQL de datos pertinentes; PDF ficticio y extenso inspeccionados/extractados | Aprobado; marcas ficticias sólo en ejemplos | Configurar emisor real en staging |
| Marca/logo sin inventar | Nombre configurado del salón o `recibo_emisores`; bytes de logo opcionales en snapshot | Implementado; ejemplo sin logo inventado | Configuración y nueva tabla pendientes |
| Medio único, moneda original, tasa histórica, equivalente; cheque/banco | PDF y pruebas de loader/respuesta/SQL; número de cheque preservado como texto | Aprobado; no se reformó cabecera | Local para recibo; dinero previo intacto |
| Cheque pendiente y garantía no cancelan deuda | Estado de emisión y avisos explícitos en ejemplo PDF cheque/garantía; SQL contra fecha futura | Aprobado | Local para recibo |
| Snapshot y numeración atómica, concurrencia y re-descarga | SQL: dos emisiones simultáneas devuelven mismo UUID/número; constraints; PDF idéntico byte a byte con snapshot fijo | Aprobado | Local, pendiente aplicar |
| Cambio posterior de cliente/precios | SQL compara original después de modificar cliente; renderer no consulta cotizaciones ni configuración | Aprobado | Local |
| Baja conserva original y señala anulación | Trigger diferido crea revisión `anulacion`; historia accesible tras baja, UI advierte estado | Aprobado | Local |
| Corrección/reasignación documentada | SQL: revisión enlazada, conceptos finales y dinero conciliado; original inmutable incluso al propietario | Aprobado | Local |
| Usuario parcial no ve datos de otros destinos | RLS real: ejecutiva ve su imputación pero cero recibos; RPC preview/emisión rechazan | Aprobado, sin recibo parcial engañoso | Local |
| Lectura sin gestión, externo propio/ajeno, inactivo, otro salón, anon | SQL real con roles; loader/acción/proxy/response unitarios | Aprobado | Local para recibos y corrección proxy |
| Excel general separado del recibo, adjuntable por mail | Ruta existente preservada; XLSX reabierto con ExcelJS/SheetJS, cabeceras, PAX, IVA/ajustes, garantías y cheques | Aprobado; 6 ejemplos regenerados | Mejora de Total/proxy local; sin envíos de correo |
| PDF largo sin cortes | 50 conceptos numerados, 4 páginas; original y cheque 1 página; inspección visual de las 6 páginas y comprobación de márgenes/textos | Aprobado | Ejemplos ficticios locales |

## B. Cambios de PAX y correcciones

`totalesCobertura` suma cantidades y centavos, nunca precios unitarios. Se usa en
UI y ambos Excel de PAX. La fila Total mantiene «Por acreditar» como subconjunto
de Pendientes. Se explica que saldo PAX no es saldo general: cargos fijos,
comisión, IVA separado y cobros por importe pueden producir otra deuda.

La nueva reasignación conserva los controles existentes y selecciona un origen
por `(pago,catering,categoría)`. No asigna prioridad FIFO/LIFO. El formulario
muestra el dinero real después de ajuste y capital ya transferido; SQL rechaza
un preview desactualizado. No se modifica la migración fiscal aplicada.

## C. Modelo y emisión de recibos

[Runbook de recibos](recibos-individuales.md): dos tablas con RLS, secuencia de
serie explícita, RPC autorizadas, snapshot inmutable y documentos vinculados
por corrección o baja. No se agregaron medios múltiples, facturación fiscal,
correos ni una nueva pantalla de configuración. Una dependencia de producción
nueva: PDFKit fijada en 0.17.2, más sus tipos de desarrollo, para layout/PDF de
varias páginas. El build incluye las métricas Helvetica utilizadas.

La autorización es total por evento, o de un cobro directo de catering externo.
Un permiso parcial a catering no autoriza ninguna descarga completa del evento.
El original PDF declara estado **al emitir**; la página presenta anulación y
modificaciones con la última revisión, conservando el original descargable.
La firma y aclaración quedan listas para imprimir.

SQL completo, en orden:

1. [Preflight](../supabase/verification/preflight-recibos.sql).
2. [Migración con BEGIN/COMMIT](../supabase/migrations/20261116222142_recibos_persistentes_y_excedentes.sql).
3. [Postflight](../supabase/verification/postflight-recibos.sql).

Estos tres archivos se ejecutaron en el clúster **aislado** de pruebas. En un
SQL Editor real se guardan inventarios/saldos previos, se revisan permisos,
configura emisor y concilia el historial de la nueva migración. No reaplicar la
fiscal que ya existe ni usar el schema parcial para reconstruir una base.

## D. Verificación y pendientes reales

| Comando/control | Resultado de esta revisión |
| --- | --- |
| `pnpm test` | 149 pruebas aprobadas |
| `pnpm lint` | Aprobado |
| `pnpm typecheck` | Aprobado |
| `pnpm build` | Aprobado; rutas PDF y métricas de fuentes incluidas |
| `… pnpm test:recibos:db` | 157 comprobaciones SQL, tipos cotejados y emisión concurrente real |
| `… pnpm test:ipc:db` | 165 comprobaciones y concurrencia real |
| `… pnpm test:detalle-pagos:db` | 127 comprobaciones y concurrencia |
| `… pnpm test:cheques:db` | 23 comprobaciones |
| `… pnpm test:usd:db` | 43 comprobaciones |
| `… pnpm test:catering:db` | 21 comprobaciones y concurrencia |
| `pnpm excel:examples` | 6 XLSX ficticios regenerados |
| `pnpm recibos:examples` | 3 PDF ficticios; normales 1 página, extenso 4 |
| PDF: Poppler + pdfplumber + inspección visual | 6 páginas sin cortes; 50 conceptos, importes, cheque, firmas y márgenes verificados |
| `pnpm supabase:types` | Falló: Docker daemon apagado. Tipos nuevos ampliados y cotejados contra catálogo aislado; falta regeneración oficial de esta migración |
| `… pnpm test:ipc:cron` | Falló al iniciar PostgreSQL: falta la biblioteca `pg_cron`. No se ejecutó el job real en esta revisión |

`…` equivale a `PG_BIN=/opt/homebrew/opt/postgresql@17/bin`.

El recorrido verificado por capas es UI renderizada/acción y loader con límites
simulados → RPC/roles/SQL reales aislados → saldos y exportación Excel/PDF.
**No** se presenta como una prueba HTTP de extremo a extremo ni como Supabase
Auth real. Para completarla hace falta staging aislado con Auth/PostgREST y la
migración nueva, además de las sesiones de roles ficticios. No usar clientes
reales de producción para estos escenarios.

Pendientes: regenerar tipos oficiales con Docker/local Supabase disponible;
validar el Cron con PostgreSQL que tenga `pg_cron`; configurar marca/logo reales,
aplicar SQL y revisar advisors en el entorno elegido; recorrido HTTP/Auth en
staging; publicar sólo con autorización posterior. Apertura del Excel actual
en Excel de escritorio/web no realizada en esta revisión. Tampoco se midió carga
productiva. La foto de referencia no pudo identificarse en el adjunto actual;
se siguió la estructura detallada por el usuario, sin copiar identidad ajena.

Ejemplos: [normal](../output/pdf/recibo-ficticio.pdf),
[50 imputaciones](../output/pdf/recibo-ficticio-extenso.pdf),
[cheque/garantía](../output/pdf/recibo-cheque-garantia-ficticio.pdf).
Todo su contenido es ficticio y los números no provienen de una emisión real.

## Validación y aplicación autorizadas para push a main

Tras la entrega local, el usuario pidió «Valida lo que haya que validar y despues
migra y pushea a main». Esa instrucción autoriza esta etapa remota y el despliegue
que dispara la integración Git de main en Vercel.

- Lint, typecheck, build y las 149 pruebas TS volvieron a pasar con los tipos
  oficiales regenerados del esquema aplicado. Incluyen el logo real de Kiria
  en la prueba de reproducción byte a byte del PDF.
- La suite de recibos tiene ahora **159 comprobaciones SQL**, agregando que el
  emisor global externo no sustituye al salón. La suite HTTP con PostgREST 14.5
  real también pasa: JWT ficticio firmado, RLS de otro salón/ejecutiva parcial,
  preview, dos emisiones concurrentes idénticas, modificación y RPC de ocho
  argumentos de reasignación. Sólo escribe en su PostgreSQL efímero.
- Regresiones repetidas: IPC 165, detalle-pagos 127, cheques 23 y USD 43,
  con sus comprobaciones de concurrencia. El build incorpora las rutas PDF y
  sus métricas de fuente. Los ejemplos PDF ya inspeccionados se conservan.
- Preflight remoto aprobado. Migración aplicada como **20261116222142**, nombre
  `recibos_persistentes_y_excedentes`. El archivo local se alineó con esa versión,
  con el mismo contenido SHA-256 `a46de4e674f9740a49d0486042cb7f64c95417956d428eadae32d66adfa1d75b`.
  No se modificó ninguna migración anterior ni se ejecutó push/reset global.
- Comparación de huellas JSON completas: 25 pagos, 9 contratos, 27 servicios,
  2 coberturas, 0 componentes y 0 imputaciones, todos idénticos antes/después.
  No hubo recálculo financiero, conversiones ni cobros ficticios remotos.
- Postflight: RLS activa, cero inconsistencias, RPC sólo autenticadas, helpers
  privados y cuatro triggers diferidos. Recibos emitidos en producción: cero
  al terminar la aplicación. Configuración de marca/logo de Kiria aplicada
  por pedido explícito del usuario, sólo para externos sin salón.
- Tipos oficiales completos regenerados desde Supabase. Se mantuvieron las
  restricciones `never` y argumentos nullable. Queda superado el bloqueo de
  generación por Docker local; ese comando sigue requiriendo Docker.
- Advisors sin diferencias: avisos previos de search_path (2), definer para
  anon (24), definer para authenticated (33) y protección de contraseñas (1).
  No se cambiaron permisos ajenos para silenciarlos. Referencias de diagnóstico:
  [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
  [anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
  [contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Los Cron remotos de cheques e IPC están activos, cada minuto, y sus últimas
  ejecuciones leídas terminaron `succeeded`. No se invocaron manualmente ni
  se cambió su programación. La instalación local sigue sin `pg_cron`.
- Smoke HTTP remoto de sólo lectura: Auth/settings 200, lectura anónima de
  recibos 401. No se realizó login con una cuenta real ni se registraron cobros
  reales para probar; no se afirma un recorrido completo de Supabase Auth.

El código y los SQL se entregan en main. El seguimiento del push y del despliegue
correspondiente se comunica en el chat; el registro anterior de Vercel en 8e4e398e
corresponde al diagnóstico inicial, no al commit de esta entrega.

### Empaquetado de PDF en Vercel

El primer despliegue del commit `0be5568c` compiló correctamente pero Vercel
rechazó el paquete de funciones por archivos dentro de directorios enlazados.
La inclusión manual `node_modules/pdfkit/js/data/*.afm` agregaba rutas hijas
del symlink de pnpm además de las rutas físicas que Next ya detectaba.
Se retiraron esas dos inclusiones redundantes. El tracing automático sigue
incluyendo `Helvetica.afm` y `Helvetica-Bold.afm` en ambas rutas PDF, comprobadas
como archivos existentes sin rutas hijas del symlink. Lint, typecheck y build
volvieron a pasar con esa corrección. La migración aplicada no cambió.
