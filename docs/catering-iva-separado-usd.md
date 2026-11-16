# Catering: IVA parcial, capital separado y redondeo USD

Implementación local del 15/11/2026, partiendo de `main` en
`a265db73ef2b166728f4d37800240e1912212218`. La migración se aplicó al proyecto remoto
el 16/11/2026; los controles de aplicación se detallan al final de este documento.
El pedido pegado se tomó como instrucción; el documento adjunto, como diagnóstico
que debía contrastarse con el código y el catálogo.

## Modelo y fuente de verdad

`porcentaje_facturado` usa porcentajes **0..100, con dos decimales**. No usa la
escala de `iva_porcentaje` ni de `iva_comision`, que siguen siendo alícuotas:
`0.21` en SQL y `21` en formulario. UI, validación de servidor y constraint SQL
controlan el nuevo porcentaje.

El neto gravable contiene precio base por categoría × PAX, adicionales de cada
categoría × sus PAX y cargos fijos una sola vez. Una categoría sin precio propio
usa el general; un precio propio cero se conserva. Un ítem sin `categorias_pax`
es fijo, sin multiplicarlo por su antiguo campo `pax`.

- Base imponible comercial = neto gravable vigente × porcentaje / 100.
- IVA comercial = `round(base imponible × iva_porcentaje, 2)`.
- `total_sin_iva` ya incluye comisión: no se vuelve a sumar.
- Total comercial = neto + comisión + IVA catering + IVA comisión + IPC.
- IVA comisión conserva su alícuota y no recibe el porcentaje de facturación.
- IPC sigue siendo un cargo separado del IVA, que se cobra por importe.

`emite_factura`, `monto_con_factura` y `monto_sin_factura` son metadatos de
facturación mostrados en Excel; no se reinterpretaron como base imponible.
`catering_costos`, `catering_tarifas` y el nuevo `catering_fiscal` comparten el
cálculo SQL de contratos, vistas, saldos y Excel. No hay una segunda fórmula
fiscal en el formulario.

## Transición explícita

Los contratos existentes reciben **100% y versión 1**, sin UPDATE de sus saldos,
pagos, coberturas ni precios. Mantienen cobertura con IVA incluido y sus totales
almacenados hasta su siguiente operación habitual. El preflight permite guardar
el inventario y las definiciones; la prueba compara todos los saldos legacy
antes y después de migrar.

El frontend nuevo crea **versión 2**, inicialmente también 100% (no supone 30%).
La RPC mantiene versión 1 si un cliente anterior omite ese dato. La edición
permite adoptar versión 2 sólo si **nunca hubo cobros ordinarios ni coberturas**,
incluidos los dados de baja. SQL impide convertir historia o volver a versión 1.
Las garantías solas no impiden la adopción.

Una cobertura legacy no se presenta como capital puro. Los nuevos cobros por
PAX sobre versión 1 pueden recibir un ajuste USD, pero su componente conserva
capital/IVA NULL y un objetivo legacy con IVA incluido. Los pagos anteriores
quedan sin desglose, identificados como pendientes de conciliación. No se
infiere IVA histórico a partir del medio, el precio actual ni la cotización.
La conciliación de contratos con historia requiere evidencia y una operación
posterior específica; esta entrega no inventa ese desglose ni habilita una
conversión automática.

## Cobros y deuda de versión 2

**Capital / PAX e IVA** permite cobrar PAX, otro capital por importe, IVA o una
combinación. No exige PAX para cobrar sólo IVA. El botón de IVA incluye el
pendiente disponible, descontando las reservas de cheques, sin seleccionarlo
por defecto. Otro capital puede cubrir cargos fijos, comisión, su IVA, IPC o
anticipos y no cubre personas. **Pagar por importe** sigue disponible: sus
imputaciones de catering se persisten como capital sin PAX ni IVA catering.

`catering_cobro_componentes` registra, por pago y contrato, objetivo, capital,
IVA, ajustes y capital real reasignado. Los objetivos son cancelación nominal;
el componente monetario real es objetivo menos ajuste. Las coberturas sólo
consumen capital PAX. La cabecera `pagos` guarda el dinero realmente recibido y
los reportes/flujo suman cada cabecera una vez. El desglose no es otro ingreso.
Los cobros explícitos se corrigen por baja y alta, sin editar su historia.

La RPC existente guarda cabecera, componentes y coberturas en una transacción.
Conserva controles de identidad, permisos y pertenencia, bloqueo de solicitud,
pago, evento y contrato. Comprueba tarifa, disponibilidad PAX e IVA después del
bloqueo. Un reintento idéntico devuelve el mismo pago; otro contenido con esa
solicitud se rechaza. Los errores distinguen USD fuera de política (`P2001`),
tarifa cambiada (`P2002`), PAX insuficientes (`P2003`), IVA reservado/cambiado
(`P2004`) y permisos (`42501`). El borrador y el modo elegido se conservan.

El neto exigible fiscal es **capital PAX histórico aún cubierto + PAX pendientes
a tarifa vigente + cargos fijos vigentes**. Las personas excedentes mantienen
su cobertura hasta reasignarla. El IVA exigible aplica porcentaje y alícuota
actuales a ese neto. IVA pendiente = IVA exigible − IVA nominal ya cancelado.
IVA cobrado real y ajuste IVA se muestran aparte. Una reducción puede producir
IVA a favor: no borra el cobro ni crea una devolución. Comisión, su IVA y otros
capitales permanecen en el saldo general. Los saldos negativos se muestran en
Ingresos, flujo, detalle y Excel; los reportes financieros incluyen el ajuste
por historia/redondeo y conservan el saldo a favor. Los reportes mantienen sus
filtros de cobros por fecha; su saldo estimado refleja esos cobros filtrados.

Con neto 20.000.000, porcentaje 30% y alícuota 21%: base 6.000.000, IVA 1.260.000
y total 21.260.000. Cobrar 10 de 200 PAX a 100.000 más IVA completo registra
2.260.000 reales, deja 190 PAX y saldo 19.000.000. Otros 10 cobran 1.000.000 y
el saldo queda 18.000.000. Si después se recotiza a 110.000, el neto exigible es
2.000.000 históricos + 180 × 110.000 = 21.800.000; IVA exigible 1.373.400,
pendiente de IVA 113.400 y saldo 19.913.400.

Garantías no cancelan ni reservan. Un cheque futuro reserva PAX e IVA nominal,
pero ninguno cancela deuda hasta la fecha de acreditación argentina. Las vistas
lo reflejan sin esperar el Cron; el reconciliador existente sincroniza los
campos almacenados. La baja excluye cabecera, cobertura, componentes y ajustes
activos; no registra otra salida de caja.

La reasignación conserva el mecanismo existente y su auditoría. Transfiere
sólo capital real disponible: jamás IVA ni un ajuste como efectivo. El ajuste
queda en el contrato original y el cálculo compensa la diferencia entre capital
nominal liberado y dinero transferido. Con ajuste positivo, la última liberación
puede transferir menos que su valor nominal; con ajuste negativo puede quedar
un crédito monetario original. Ambas situaciones concilian. Se conserva el
rechazo existente si hay varias tarifas históricas y no está definida la
prioridad para liberar excedentes.

## Política USD exacta

Se conservan `numeric(12,2)` para dinero recibido y `numeric(10,4)` para la tasa.
El primer caso de la suite reproduce el rechazo anterior: 100.000 / 1.200 es
periódico; USD 83,33 equivale a ARS 99.996, distinto de 100.000.

1. Objetivo ARS = capital nominal + IVA nominal de **toda la operación**.
2. USD recomendado = `round(objetivo / tasa, 2)`, empates alejándose de cero.
3. Sólo ese importe USD cancela el objetivo. Otro centavo se rechaza, aunque sea
   cercano; un cobro parcial puede registrarse por importe, sin cobertura PAX.
4. Equivalente real = `round(USD recibido × tasa histórica, 2)`.
5. Ajuste = objetivo − equivalente real. Puede ser positivo, cero o negativo.
6. Ajuste IVA = `round(ajuste × IVA nominal / objetivo, 2)`; ajuste capital = resto.
   Así se aplica una vez por operación, sin tolerancia por persona. Sólo IVA
   recibe todo el ajuste cuando no hay capital; legacy no presume un reparto.

TS usa enteros escalados BigInt para dividir, multiplicar y validar; SQL usa
`numeric`. No se usa epsilon ni se modifica la tasa para forzar igualdad.
El formulario sugiere automáticamente y muestra equivalente/ajuste antes de
guardar. SQL recalcula la política y no confía en un ajuste enviado por cliente.
Ejemplos: objetivo 100.000, tasa 1.200 → USD 83,33, ajuste +4; objetivo 100.004
→ USD 83,34, ajuste −4. Base, caja, ajustes y cobros históricos no se reescriben.

## Aplicación manual y compatibilidad

El 15/11 se verificó el catálogo remoto `software-eventos-db` por SELECT y lista
de migraciones: están las dependencias hasta `20261110224738`, incluidos PAX e
IPC. Las firmas/precisiones coinciden. No se aplicó esta migración allí.
No usar el schema parcial adjunto como baseline, ni `db reset`/`db push` remoto.

1. En una copia aislada/staging, guardar backup, inventario, saldos y definiciones
   con `supabase/verification/preflight-catering-fiscal.sql`. Si falta alguna
   dependencia, conciliar/aplicar sus guías primero. El orden previo es USD,
   totales atómicos, cheques, imputaciones, PAX y `ipc_vigencia_programada`.
2. Ejecutar **completo**, incluido BEGIN/COMMIT, el archivo
   `supabase/migrations/20261115231648_catering_iva_separado_usd.sql` en SQL Editor.
   También es ejecutable con `psql -X -v ON_ERROR_STOP=1 -f <archivo>`.
   No envolverlo en un aplicador que ignore errores. Ante error, ROLLBACK.
3. Ejecutar `postflight-catering-fiscal.sql`, comparar el inventario legacy y
   saldos guardados, revisar advisors y probar permisos con cuentas ficticias.
   Los contadores de inconsistencias deben dar cero. Comprobar las vistas
   `security_invoker`, tabla con RLS y ausencia de EXECUTE implícito en triggers.
4. Regenerar tipos completos contra ese esquema y publicar el frontend nuevo
   sólo después de aplicar/verificar SQL. Repetir casos ARS/USD, cheque, baja,
   recotización, Excel y reportes por evento y catering externo.

El frontend anterior puede funcionar mientras todos los contratos sigan en
versión 1 y porcentaje 100. Tras adoptar versión 2 o porcentajes parciales,
sus textos no distinguen capital/IVA: no usarlo para seguir operando catering.
Las RPC rechazan editar desgloses explícitos y conservan sus datos. Para recuperar
servicio, conservar la migración y restaurar el frontend compatible; si no está
disponible, suspender temporalmente altas/ediciones de catering. No borrar la
tabla de componentes, bajar versiones ni reinterpretar cobros para un rollback.

## Archivos y comprobaciones

- Migración nueva y preflight/postflight: contrato, componentes, RPC, protección,
  tarifas, cálculo fiscal y vistas. No se editaron migraciones aplicadas.
- Formularios/acciones compartidas de pagos: desglose, USD exacto, borrador y
  mensajes; creación/edición de contrato: porcentaje y adopción controlada.
- Consultas/componentes de catering, ingresos del evento y flujo: desglose y
  saldos; exportación comercial: valores SQL y componentes sin duplicar caja.
- Reportes financieros: incorpora ajuste histórico/redondeo en el saldo,
  incluyendo catering externo; auditoría: nuevos nombres/campos.
- Tipos afectados, fixtures, pruebas TS/SQL y ejecutor PostgreSQL aislado.

Durante la preparación, `pnpm supabase:types` falló porque Docker Desktop estaba
apagado (socket `~/.docker/run/docker.sock` ausente). El 16/11, después de aplicar
la migración, se regeneró el archivo completo mediante el generador oficial del
conector Supabase contra el proyecto remoto actualizado. Se conservaron las 31
restricciones previas de escritura de columnas generadas/controladas por triggers
y argumentos SQL nullable que el generador no representa. El resultado incorpora
las relaciones reales de la tabla nueva y pasó los controles del proyecto.

Evidencia de validación y límites finales en la sección siguiente.

| Comprobación | Resultado |
| --- | --- |
| `pnpm lint` | Aprobado |
| `pnpm typecheck` | Aprobado |
| `pnpm test` | 138 pruebas aprobadas |
| `pnpm build` | Aprobado |
| `PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:cobertura:db` | 121 comprobaciones SQL + cotejo de columnas + concurrencia real |
| `… pnpm test:detalle-pagos:db` | 127 comprobaciones SQL + concurrencia |
| `… pnpm test:ipc:db` | 165 comprobaciones SQL + concurrencia de cobros/IPC |
| `… pnpm test:usd:db` | 43 comprobaciones SQL |
| `… pnpm test:catering:db` | 21 comprobaciones SQL + concurrencia de ítems/pagos |
| `pnpm supabase:types` | CLI local bloqueada por Docker; regeneración oficial remota completada el 16/11 |

Se probaron con datos ficticios: aceptación 20M/30%/21%, primer y segundo cobro,
sólo IVA, IVA parcial, sólo capital, 0/100% facturado, IVA cero, extras, fijo y
comisión; recotización y crédito; USD periódico/exacto, ambos signos, distribución
capital/IVA, tasa de cuatro decimales, fuera de política, escalas y límites;
baja, cheque reservado/acreditado, garantía, idempotencia, reasignación, auditoría,
RLS de vendedor ajeno y ejecutiva asignada, legados sin reinterpretación.

En Chrome se montaron los componentes reales en una aplicación temporal sólo
en `127.0.0.1`, con acción de prueba que ejecuta los validadores TS y la RPC real
en PostgreSQL efímero. Se observó: base 6M/IVA 1.26M, cobro 2.26M → saldo 19M,
segundo cobro 1M → saldo 18M y 180 PAX; USD recomendado 83.33 → equivalente 99996,
ajuste 4; rechazo de 83.34 conservando modo/cantidad/importe; corrección y guardado
→ un PAX cubierto, caja 99996, ajuste 4 y saldo 100000 sobre dos PAX.
El entorno temporal no se incorpora al producto y se elimina al terminar.

La prueba de navegador **no** incluye Supabase Auth/JWT ni transporte PostgREST:
la acción temporal usa psql contra la base aislada. Las acciones reales tienen
pruebas con el límite Supabase simulado y el SQL con roles reales. Falta la
validación HTTP completa en staging con Auth, PostgREST, migración y tipos
regenerados. No se validó carga productiva ni se ejecutaron cobros de prueba en
producción. La aplicación y los controles remotos del 16/11 se registran abajo.


## Aplicación remota confirmada — 16/11/2026

Autorizada expresamente por el usuario y ejecutada mediante el conector Supabase
en **software-eventos-db** (`juxczmoqsiumphjwhhbc`). El SQL aplicado corresponde al
archivo versionado en `main`, commit `25696b18`, sin modificar migraciones previas.
Se aplicó sólo esta migración, sin `db push/reset` global ni datos ficticios remotos.

Antes de aplicar se guardaron definiciones de 12 funciones, cinco vistas y los
triggers afectados, además de inventario y huellas de los datos. Se compararon
las huellas después: contratos (excluyendo las dos columnas nuevas), saldos de
la vista, pagos, coberturas y precios históricos **coinciden exactamente**.
No hubo un recálculo ni una conversión masiva de historia.

Resultados del postflight:

- Los nueve contratos, incluidos los cuatro dados de baja, siguen en versión 1
  y porcentaje 100. Los cinco activos conservan sus saldos.
- Se conserva el contrato con cobertura histórica. Seis contratos tienen cobros
  ordinarios históricos y requieren conciliación antes de cambiar de modelo.
- La tabla de componentes está vacía: no se inventaron desgloses antiguos.
- RLS habilitada y vistas `security_invoker` conservadas. Las funciones de
  triggers no son ejecutables por clientes y el esquema privado sigue oculto.
- Cero inconsistencias de componentes o saldos versión 2. Estos contadores son
  verificaciones de estructura inicial, no una prueba de nuevos cobros reales.
- Una transacción de sólo lectura con rol `anon` devuelve cero contratos,
  componentes y saldos visibles.
- Advisors no agregó ni retiró avisos respecto del preflight. Persisten avisos
  anteriores de [search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
  funciones definer ejecutables por [anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable)
  y [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable),
  y [protección de contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
  No se cambiaron permisos ajenos a esta migración para silenciar esos avisos.

El conector asignó inicialmente la versión de ejecución `20261116213142`. Se
alineó **sólo esa entrada recién creada** del historial a `20261115231648`, con
nombre `catering_iva_separado_usd`, para que coincida con el archivo del repositorio
y evitar una futura reaplicación. La lista remota confirma la versión canónica.

Los tipos se regeneraron contra el esquema aplicado, preservando las restricciones
TypeScript existentes. Lint, typecheck, las 138 pruebas TS y build se verifican
con ese resultado. Continúa pendiente la prueba completa del frontend publicado
con Supabase Auth/PostgREST; no se cargaron cobros de prueba en producción.
