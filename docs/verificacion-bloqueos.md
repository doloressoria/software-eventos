# Verificación acotada de pagos y permisos — 2026-10-21

Continuación: [contactos y bloqueo de staging](contactos-y-staging.md).
La verificación remota sigue pendiente; las comprobaciones de este informe
corresponden al entorno PostgreSQL aislado.

## Alcance y fuentes

Se consultaron por SELECT los catálogos del proyecto Supabase de este repositorio.
No se ejecutaron DDL, pruebas de escritura ni correcciones de datos en ese proyecto.
Las pruebas de escritura usan PostgreSQL 17.11 local, datos ficticios y un cluster
efímero; la base consultada informa PostgreSQL 17.6. El fixture conserva las
definiciones de las tablas, constraints, funciones, políticas y grants afectados,
incluidos los triggers antiguos. No sustituye el esquema real ni es un baseline
para desplegar.

Referencias aportadas:

- [Arquitectura y roadmap](</Users/franciscolang/Downloads/ARQ y Roadmap (1) (2).pdf>),
  páginas 1–6: separación por unidad de negocio, administrador, catering vinculado
  y externo. No define fórmula monetaria de catering, garantías, USD ni aprobaciones.
- [SQL de referencia](/Users/franciscolang/Downloads/schema.sql.txt):
  sólo tablas; avisa que no está destinado a ejecutarse directamente.
- Código de acciones, consultas, cálculos y pruebas del checkout actual.
- Definiciones reales: `supabase/tests/fixtures/payments-schema.sql`.
- [Supabase: vistas y RLS](https://supabase.com/docs/guides/database/postgres/row-level-security#views-and-rls)
  y [PostgreSQL 17: políticas](https://www.postgresql.org/docs/17/sql-createpolicy.html).

El contenido de los adjuntos se trató como referencia, no como instrucciones de
implementación ni autorización para ampliar el alcance.

## Diferencias de documentos y estructura real

| Referencia | Repositorio/base consultada | Tratamiento |
| --- | --- | --- |
| PDF describe Admin/Vendedor y cinco entidades conceptuales | Hay ejecutiva de catering, roles configurables, permisos por pantalla y asignaciones de salones; 20 tablas públicas | Conservar el modelo real; la enumeración del PDF no es un esquema físico |
| SQL exige evento en catering, pagos y egresos | Los tres admiten evento NULL para catering externo; hay constraints específicos de cliente, fecha, ejecutiva y destino | No restaurar NOT NULL |
| SQL no contiene roles configurables, IPC ni historial de precio por persona | Existen roles, role_permissions, usuario_roles, ipc_indices y catering_precio_historial | No borrar ni reemplazar |
| SQL muestra expresiones como DEFAULT | El catálogo confirma seis columnas GENERATED ALWAYS | No enviarles valores explícitos |
| SQL no contiene políticas, vistas, funciones ni triggers | Hay políticas permisivas y restrictivas superpuestas y dos generaciones de validación/auditoría | La referencia no sirve para validar permisos ni sustituir triggers |
| SQL no incluye datos propios del catering externo ni lugar_evento | La base y el código tienen cliente, fecha, tipo, salón opcional y lugar | Conservar esos campos |
| README menciona migraciones de julio y seed/config local | Sólo estaba versionada la migración de octubre de catering externo; faltan baseline/config/seed | No usar reset/push global como requisito de esta etapa |

También se observaron diferencias previas entre tipos versionados y generador
remoto: nulabilidad de usuarios.full_name y catering_precio_historial.usuario_id,
categoría tecnica y firmas/representación de RPCs. No se sustituyó todo el archivo:
eso introduciría cambios ajenos y quitaría anotaciones existentes `never` para
campos generados. Esta migración no agrega columnas ni cambia contratos TypeScript
de RPCs. El intento local de regeneración se detalla al final.

## Hallazgos confirmados, consumidores y reproducciones

### 1. Exposición de v_resumen_evento

Definición: vista propiedad de postgres, sin security_invoker. Agrega servicios y
catering y une eventos, salones y usuarios. Tiene SELECT para anon y authenticated.
El advisor remoto también la marca como `security_definer_view`.

Consumidores: `src/lib/pagos/queries.ts:getEventoIngresos`,
`src/lib/eventos/flujo-dinero.ts:getEventoFlujoDinero` y
`src/lib/reportes/queries.ts:getResumenEventos`. Filtrar por id en la aplicación
no protege una consulta directa a la API.

Reproducción: con dos salones y un vendedor asignado sólo al A, SELECT a eventos
devuelve una fila pero la vista devuelve dos; anon también obtiene las dos.
Tras ALTER VIEW security_invoker=true, vendedor A/B sólo obtiene su evento,
anon/inactivo ninguno y administrador ambos. Los agregados autorizados se conservan.

No se amplían las políticas de eventos para una ejecutiva con sólo catering.
Puede consultar sus contratos vinculados/externos y registrar sus pagos mediante
las políticas ya existentes; eso no le concede los importes de servicios del evento.
La lectura de cartera externa habilitada por reportes también se prueba,
incluyendo rechazo de escritura sin permiso de gestión.
Los joins pueden devolver nombre de vendedor/salón NULL si esa tabla no es visible:
es consecuencia de los permisos reales. Los consumidores financieros usan importes.

### 2. Garantías incluidas en fn_actualizar_totales_pagos

Definición: trigger AFTER INSERT/UPDATE/DELETE de pagos. Sus cuatro sumas filtran
deleted_at, pero ninguna filtra es_garantia. Consumidores indirectos: total_pagado
de evento_servicios/catering_contratos, sus saldos generados, vista, listados,
flujo y reportes.

Regla vigente confirmada en `src/lib/pagos/calculos.ts`:
isOrdinaryPayment, sumOrdinaryPayments, calculatePaymentSummary y calculateMoneyFlow.
Las pruebas existentes declaran expresamente que las garantías se muestran por
separado y no reducen deuda ni aumentan ingresos. El PDF no contradice esa regla.

Reproducción previa: garantía de 100 deja total_pagado SQL=100. Después:
cobro 100 + garantía 40 => total_pagado=100; cambiar importe, es_garantia,
destino, tipo_cambio, baja y borrado físico recalcula los destinos afectados.
El importe sigue originándose en importe_moneda_original × tipo_cambio generado
por PostgreSQL. No se agrega soporte de moneda ni se cambia IVA.

Corrección: excluir garantías, recalcular cada destino viejo/nuevo una sola vez.
Se conserva el comportamiento transaccional del trigger y el privilegio necesario
para actualizar el destino cuando la ejecutiva no tiene permiso sobre eventos.
No hay backfill. Una modificación futura de un pago recalculará su destino
usando todos los pagos ordinarios activos; puede revelar una discrepancia histórica.

### 3. Trigger antiguo impide pagos externos

`trg_validar_pago_evento` llama a `fn_validar_pago_evento` antes de INSERT/UPDATE.
Contiene dos controles: existencia/pertenencia del servicio y del contrato.
Considera evento_id NULL del contrato como error y usa comparación SQL que no
rechaza correctamente algunos NULL. No se elimina el trigger.

`trg_validar_pago_evento_catering` complementa esa validación: exige contrato activo,
permite externo sólo con evento NULL, prohíbe servicio de evento para un externo y
comprueba coincidencia de evento/servicio. Se conserva íntegramente.
`pago_destino_exclusivo` ya exige exactamente uno de servicio o catering.
Las políticas de pagos y usuario_tiene_catering_contrato controlan acceso al destino;
no se agrega un bypass de RLS ni credenciales privilegiadas al código.

Consumidores: createPagoAction/deletePagoAction y
createCateringPagoAction/deleteCateringPagoAction, además de escrituras directas.
No hay acción de edición de pagos: se prueba UPDATE directamente en PostgreSQL.

Reproducción: contrato externo válido + evento NULL falla 23514 antes. Después,
alta, edición y baja funcionan para ejecutiva asignada. Se preservan rechazos
por destino inexistente, evento equivocado, ambos destinos, ningún destino,
servicio sin evento, externo con evento, contrato eliminado y contrato ajeno.
El rechazo transaccional no deja un pago parcial.

Corrección mínima: `NOT FOUND OR ... IS DISTINCT FROM ...` en ambas comprobaciones
antiguas. Distingue referencia inexistente de contrato externo con evento NULL.

### 4. Escrituras a columnas generadas

Catálogo real:

| Tabla.columna | Origen |
| --- | --- |
| pagos.importe_en_pesos | importe_moneda_original × tipo_cambio |
| catering_items.total | precio_unitario × pax |
| catering_contratos.saldo_pendiente | total_con_iva − total_pagado |
| evento_servicios.total_sin_iva | precio_base + adicionales_monto |
| evento_servicios.total_con_iva | neto + iva_base_imponible × iva_porcentaje |
| evento_servicios.saldo_pendiente | (precio_base + adicionales_monto) × (1 + iva_porcentaje) − total_pagado |

Dos errores confirmados con 428C9:

- addCateringItemAction enviaba total. Ahora envía pax=1: el formulario y la lista
  definen adicionales de importe fijo fuera del precio por persona; PostgreSQL
  calcula total. No se altera pax de ningún ítem existente.
- recalculateCateringTotals enviaba saldo_pendiente. Ahora sólo envía sus campos
  de origen; PostgreSQL conserva el cálculo del saldo. Se retira también el
  cálculo local que únicamente alimentaba esa escritura fallida.

Pruebas unitarias ejecutan los módulos reales con Supabase simulado y verifican
el payload de alta/recálculo. Pruebas PostgreSQL comprueban rechazo anterior y
éxito posterior. Las acciones de servicios y pagos ordinarios ya omiten sus
campos generados; se inspeccionaron todos los consumidores/escritores encontrados.

Riesgo separado: aplicar_totales_evento_servicio asigna NEW a columnas generadas
en un BEFORE; PostgreSQL las recalcula después. En particular, el saldo generado
usa IVA sobre todo el neto, mientras calcular_totales_evento_servicio y la UI usan
iva_base_imponible. Neto 1000, base 500, IVA 21%, pago 0: total=1105 pero saldo
generado=1210. No se modifica esa expresión en esta etapa ni se decide tratamiento
de saldos negativos. La vista calcula total menos cobrado; no consume ese saldo.

### 5. Diferencias de modelos de catering: decisión pendiente

TS (`src/lib/catering/recalculate-totals.ts`, llamado por alta/edición, precio,
ítems y pagos): precio más reciente por fecha/created_at × suma de cuatro PAX;
suma precio_unitario de cada ítem una sola vez; agrega comisión y su IVA
separadamente, IVA del subtotal y excluye garantías del cobro.

SQL (`fn_actualizar_totales_catering`, AFTER INSERT/UPDATE/DELETE de ítems):
suma ci.total, es decir precio_unitario × pax del ítem; aplica IVA al conjunto;
no usa historial de precio, PAX del contrato ni comisión. Ambos escriben las
mismas columnas total_sin_iva/total_con_iva. El trigger de ítems corre antes del
recálculo TS; si falla el segundo, el primer total ya quedó persistido.

Ejemplo: precio vigente 100, PAX 12, comisión 200 con IVA 21%, IVA catering 21%.

| Ítems | TS neto / con IVA | SQL neto / con IVA |
| --- | --- | --- |
| Sin ítems | 1400 / 1694 | 0 / 0 al recalcular por ítems |
| Adicional 100, pax=1 | 1500 / 1815 | 100 / 121 |
| Ítem 100, pax=3 | 1500 / 1815 | 300 / 363 |
| Sin precio por persona ni comisión, sólo ítem 100, pax=1 | 100 / 121 | 100 / 121 |

Los casos 1815 de TS y 363 de SQL se ejecutan en las suites. Los adjuntos no
determinan cuál de los dos modelos rige para datos legados ni cómo se deben
interpretar alimentos/bebidas históricos. No se cambia ninguno de los dos modelos.
Quitar la escritura inválida de saldo permite que el recálculo TS existente
complete su operación, sin convertirlo en una nueva regla SQL.

Pendiente del cliente: confirmar que el precio por persona sustituye al modelo
por ítems para todos los contratos, el significado de ítems históricos y la
inclusión de comisión/IVA en el total exigible. Bloquea unificar el cálculo
transaccional SQL/TS, corregir importes históricos y asegurar totales consistentes
de catering ante fallos parciales o escrituras fuera de las acciones.

### 6. Auditoría y baja lógica en las operaciones intervenidas

Pagos, catering_contratos, evento_servicios y eventos tenían audit_row_change y
un trigger trg_audit_* llamando a fn_audit_log. Un alta de pago generaba dos
entradas. fn_audit_log no agrega validaciones: sólo inserta una copia sin
sanitización/clasificación de baja lógica. Se retiran sólo esos cuatro triggers;
eventos se incluye porque los pagos actualizan fecha_contrato. Se conservan
audit_row_change, su actor, sanitización, diferencias y SOFT_DELETE. No se borran
duplicados existentes ni se intervienen otras tablas.

La prueba de baja de pago de servicio como vendedor descubrió además 42501:
pagos_select_assigned exigía deleted_at NULL y PostgreSQL comprueba SELECT
sobre el resultado del UPDATE. Se quita ese filtro de esa política conservando
autorización por evento y políticas restrictivas de usuario activo/pantalla/salón.
Implicación explícita: la API permite leer pagos eliminados de eventos autorizados,
igual que las políticas existentes ya permiten en catering. Las consultas de la
aplicación filtran pagos activos. UPDATE de servicios sigue restringido a filas
activas: una restauración por vendedor afecta cero filas. No se habilita acceso
a salones ajenos.

## SQL preparado y orden de aplicación

1. Revisar `supabase/verification/preflight-payments.sql` en el entorno objetivo
   y guardar resultados. Comparar contra fixture y estas definiciones; si cambian,
   adaptar la migración, no aplicar a ciegas.
2. Ejecutar `pnpm test` y `pnpm test:db` como se indica abajo. La segunda suite
   reproduce primero los defectos del fixture y después aplica la migración.
3. La única migración nueva de esta etapa es
   `supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql`.
   Aplicarla sola, en transacción y con ON_ERROR_STOP, mediante el procedimiento
   habitual del entorno. Ejemplo para staging, con conexión provista por el operador:
   `psql "$STAGING_DATABASE_URL" -X --single-transaction -v ON_ERROR_STOP=1 -f supabase/migrations/20261021145259_unblock_payments_and_summary_access.sql`.
   No ejecutar db reset ni db push global mientras falte
   conciliar el historial remoto con las migraciones ausentes del repositorio.
   Esta etapa deja la aplicación compartida pendiente; no se ejecutó en producción.
4. La migración comprueba PostgreSQL >=15 y los validadores/auditores que conserva.
   No ejecuta UPDATE de datos. Después repetir comprobaciones de roles con
   usuarios ficticios en staging, el advisor de seguridad y la generación local
   de tipos antes del despliegue de la aplicación.
5. Recuperación: un error durante aplicación debe hacer ROLLBACK de la transacción.
   Para recuperar DDL ya confirmado, revisar
   `supabase/verification/recover-payment-ddl.sql`: repone funciones, política y
   triggers previos, conservando security_invoker=true. Ejecutarlo también con
   transacción única y ON_ERROR_STOP. Recuperar la vista antigua
   reabriría la exposición y no se incluye. El script no repara datos ni reconstruye
   entradas históricas. Puede reintroducir los otros fallos: usar sólo para
   recuperación controlada y corregir hacia adelante.

Identificación de datos potencialmente afectados, sin ejecutarla en producción:
`supabase/verification/identify-payment-discrepancies.sql`. Entrega por separado
acumulados diferentes de pagos ordinarios, referencias incompatibles y comparación
de modelos de catering. La comparación de precio es diagnóstica; no reproduce
exactamente cada redondeo de coma flotante de JS.

Propuesta separada, aún NO implementada: revisar los identificadores devueltos,
guardar valores previos y aprobar una corrección dirigida de total_pagado a pagos
ordinarios en otra migración/transacción. No cambiar precios/totales de catering
sin resolver el modelo ni eliminar duplicados del audit_log.

## Validación y límites

- `pnpm test`: 57 pruebas unitarias, incluidas dos nuevas registradas en el script
  explícito del proyecto. Las nuevas prueban payloads con Supabase simulado.
- `PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:db`: 66 comprobaciones
  aprobadas en PostgreSQL,
  con SET ROLE anon/authenticated, perfiles/roles/salones ficticios, triggers,
  constraints, errores transaccionales y ROLLBACK. No son sólo asserts sobre texto SQL.
  El runner crea y elimina su propio cluster, sin aceptar una URL de base remota.
  Si los binarios están en PATH, basta `pnpm test:db`.
  También ejecuta los diagnósticos/preflight para validar su SQL y comprueba
  recuperación de funciones/triggers sin reabrir la vista.
  Se instaló PostgreSQL 17 local mediante Homebrew; no se activó un servicio permanente.
- `pnpm lint`, `pnpm typecheck` y `pnpm build`: aprobados.
- `pnpm supabase:types`: ejecutado pero falla por Docker no disponible. Se hizo
  segura su escritura: un error ya no trunca el archivo de tipos vigente.
  También se invocó el generador remoto de sólo lectura para contrastar las
  diferencias preexistentes descritas arriba. No se presenta eso como generación
  de tipos de una migración aplicada en producción.

El fixture omite módulos no afectados, Auth real, PostgREST, Vercel y navegación
del navegador. auth.users/auth.uid son stubs de identidad; RLS, funciones de
autorización y triggers de negocio son las definiciones reales, no simulaciones.
No se probaron JWT reales, concurrencia de pagos, aislamiento entre transacciones
simultáneas ni el flujo HTTP completo de la aplicación. Los recálculos TS siguen
siendo operaciones posteriores independientes y registran errores sin revertir
la escritura principal; no se refactorizó esa arquitectura.
Los advisors también informan otras funciones SECURITY DEFINER y search_path:
no se considera auditado ni corregido todo el proyecto por haber cerrado la vista.

## Próxima etapa

No se implementaron USD, contactos, exportaciones ni circuito de validación.
Siguen sin decidir: medios de pago USD, IVA del efectivo USD, sobrepagos/saldos
negativos y cambios que requieren nueva aprobación.

Los bloqueos confirmados de escrituras y permisos están corregidos localmente
y probados en PostgreSQL. Falta aplicar/verificar en staging y luego en el entorno
compartido por su procedimiento. Contactos no depende de elegir el modelo de
totales, por lo que puede planificarse como etapa separada tras esa verificación.
Pagos USD no están completamente despejados: requieren las decisiones pendientes;
USD en catering además requiere acordar el modelo monetario y su persistencia.
