# Pagos en USD con cotización manual — 2026-10-21

## Cambios locales

Eventos, catering asociado y catering externo comparten los campos monetarios y la
validación de servidor. ARS usa tasa 1. USD exige una cotización explícita positiva
en ARS por USD, sin precargar 1 al cambiar desde pesos. Se reutilizan `moneda`,
`tipo_cambio`, `importe_moneda_original` y el `importe_en_pesos` generado.

La representación conserva los enums actuales:

| Moneda | Medios admitidos |
| --- | --- |
| ARS | efectivo_pesos, transferencia, cheque, retenciones |
| USD | efectivo_dolares, transferencia |

Los formularios muestran importe original, cotización y equivalente antes de
guardar; conservan banco/referencia, número de cheque, notas y garantía. `Editar
pago` recupera los datos históricos y permite corregirlos. Las acciones acotan la
escritura al pago activo y a su evento/contrato autorizado, mantienen el autor
original y recalculan los destinos afectados. Los pagos de catering que aparecen
en el historial de un evento se editan mediante su acción de catering.

El historial de ingresos y el detalle de ingresos del flujo de dinero muestran
moneda/importe original, cotización y equivalente en ARS. Los reportes mantienen
sus sumas de `importe_en_pesos`; el agrupado por moneda suma originales sólo dentro
de cada moneda. Se incorporó moneda a las consultas de acumulados para impedir
que un legado USD sin equivalente se interprete como pesos.

Efectivo USD comparte el tratamiento de efectivo ARS; transferencia USD comparte
el de transferencia ARS. El trigger de acumulados replica para servicios la regla
TS existente: suma equivalentes ARS ordinarios activos, separa IVA incluido de los
medios no efectivos por pago, usa tasa 21%, limita base al neto y conserva una base
histórica ya aumentada al editar/bajar pagos. Actualiza ambos destinos si cambian.
Las garantías no aumentan cobro ni reducen deuda. Se conserva el saldo SQL negativo
ante sobrepago y el saldo visible limitado a cero donde ya se aplicaba esa regla.

La nueva validación de base es un trigger `SECURITY INVOKER`, sin acceso RPC público.
Valida altas y modificaciones de dinero; no modifica las políticas RLS, auditoría,
permisos de usuario, ni validadores de pertenencia existentes. Se elimina el
DEFAULT 1 de la tasa: USD sin tasa falla, mientras el trigger normaliza ARS a 1
para conservar compatibilidad con clientes ARS anteriores. No se reescriben pagos
históricos: un legado monetario inválido puede darse de baja o modificar metadatos;
cambiar sus datos monetarios exige una combinación válida. No se amplía soporte a
EUR ni se deducen cotizaciones ausentes. No hay backfill.

La regla IPC fue inspeccionada en las dos RPC reales (preview/aplicación): ambas
excluyen de elegibilidad un servicio con cualquier pago ordinario activo, sin
filtrar moneda o monto; una garantía no lo bloquea. Se conserva ese código.

## Precisión y redondeo

- Importe original: hasta 2 decimales, conforme `numeric(12,2)`.
- Cotización: hasta 4 decimales, conforme `numeric(10,4)` (máximo 999999.9999).
- El servidor rechaza exceso de decimales y desbordes del equivalente.
- La vista previa multiplica enteros escalados con BigInt y redondea una vez a
  centavos; los empates se alejan de cero, igual que el producto almacenado en la
  columna generada PostgreSQL `numeric(12,2)`. Los importes nuevos son positivos.
- Ejemplos comprobados en TS y SQL: 1.01 × 1.5 = 1.52;
  100.25 × 1200.1234 = 120312.37.
- El cálculo vigente de IVA redondea el neto por pago antes de acumularlo.
  Ningún reporte convierte de nuevo un pago usando otra tasa.

## Estado remoto realmente comprobado

Se consultó por SELECT el proyecto configurado por `.env.local`
(`juxczmoqsiumphjwhhbc`). No se hicieron escrituras ni DDL remotos.

El catálogo todavía tiene `fn_actualizar_totales_pagos` que incluye garantías,
`fn_validar_pago_evento` que rechaza catering externo, `trg_audit_pagos` duplicado,
y `v_resumen_evento` sin security_invoker. `evento_contactos` no existe. El
historial de migraciones consultado sólo enumera `20260826211252`.
Por lo tanto, las correcciones previas de pagos y contactos NO están aplicadas
en ese proyecto. No se presupuso aplicación por la presencia de archivos locales.

La consulta agrupada de pagos remotos encontró sólo ARS (efectivo y transferencia),
sin tasas nulas/no positivas ni tasa ARS distinta de 1. Es una observación del
momento, no una autorización para aplicar SQL ni un reemplazo del preflight.
La búsqueda de funciones del schema público cuyo cuerpo contiene
`efectivo_pesos` no encontró cálculos SQL adicionales en el catálogo remoto.

## SQL preparado y orden de aplicación

No usar `supabase db push/reset` global: este repositorio no tiene el baseline
completo. Identificar staging, conciliar su historial y guardar las definiciones
actuales antes de intervenir. No aplicar estas instrucciones automáticamente a
producción.

1. Ejecutar y revisar `supabase/verification/preflight-payments.sql` y el
   procedimiento de `docs/verificacion-bloqueos.md`. Aplicar, si corresponde,
   `20261021145259_unblock_payments_and_summary_access.sql` en transacción única.
2. Seguir `docs/contactos-y-staging.md`: preflight de contactos y aplicación de
   `20261021152307_evento_contactos.sql`, sin modificar esa corrección.
3. Revisar `supabase/verification/preflight-usd.sql`, en especial columnas
   generadas, constraints, triggers, funciones y el inventario de legados.
4. Aplicar `20261021155412_payments_manual_usd.sql` en una transacción única,
   con ON_ERROR_STOP. La migración comprueba la presencia de la corrección de
   pagos anterior y aborta si falta. No requiere cambiar enums ni columnas.

   ```bash
   psql "$STAGING_DATABASE_URL" -X --single-transaction -v ON_ERROR_STOP=1 \
     -f supabase/migrations/20261021155412_payments_manual_usd.sql
   ```

5. Revisar advisors y ejecutar las pruebas de interfaz con cuentas ficticias
   autorizadas en staging. Regenerar tipos completos desde ese entorno y desplegar
   el código sólo después de aplicar el SQL. Ante error en aplicación: ROLLBACK.
   No recuperar datos históricos rellenando tasas arbitrarias ni borrando pagos.

`pnpm supabase:types` fue ejecutado: falla porque Docker no está disponible.
Se preservó el archivo de tipos previo, incluidos los cambios locales de contactos.
No cambian los contratos TypeScript de tablas/enums/RPC: la función nueva retorna
trigger y no constituye una RPC de la aplicación. Queda pendiente regenerar desde
un Supabase actualizado disponible.

## Pruebas y evidencia

| Comprobación | Resultado |
| --- | --- |
| `pnpm lint` | Aprobado |
| `pnpm typecheck` | Aprobado |
| `pnpm test` | 78 pruebas aprobadas |
| `pnpm build` | Aprobado |
| `PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:usd:db` | 43 comprobaciones SQL aprobadas |
| `PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:db` | 66 comprobaciones anteriores aprobadas |
| `PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:contactos:db` | 46 comprobaciones y concurrencia real aprobadas |
| `pnpm supabase:types` | Bloqueado por Docker apagado |

Las pruebas unitarias ejecutan validadores, cálculos/reportes y acciones reales con
el límite Supabase simulado: altas/ediciones/bajas en los tres recorridos, payloads
sin columnas generadas, banco/garantía/cotización histórica, errores y permisos.
Prueban la suma 100 USD × 1200 + 100 USD × 1300 = ARS 250000, mezclas con ARS,
redondeo, tasas inválidas, IVA equivalente y legados sin tasa inventada.

Las pruebas SQL usan PostgreSQL 17 efímero y datos ficticios: ejecutan las
migraciones previas y nueva, constraints, RLS con roles reales, triggers y auditoría.
Comprueban ambos medios USD en eventos/catering asociado/externo, edición/baja,
garantías, tasas inválidas/omitidas, referencias ajenas/incompatibles, anónimo e
inactivo, paridad IVA, decimales, legado y cliente ARS anterior. Para IPC ejecutan
la RPC real de preview recuperada por SELECT sobre un fixture mínimo de índices;
no ejecutan la RPC de aplicación. `auth.uid()` se representa con identidad de
prueba: no son tests HTTP/JWT de Supabase Auth/PostgREST.

Navegación real en Chrome, usando `pnpm start` y una sesión existente de admin:
se comprobó la pantalla de ingresos, historial ARS, apertura de edición con datos
originales, cambio a USD con tasa vacía, vistas previas ARS 120000 y 130000, y
respuesta de validación del servidor por cotización vacía conservando el borrador.
No se guardó ningún pago válido ni se modificaron pagos remotos. No había contratos
de catering para navegar sus ingresos. La persistencia HTTP con Auth real,
roles no administradores y los recorridos completos de catering quedan pendientes
en staging con migraciones aplicadas y datos ficticios.

## Limitación concreta de catering

Se conservan los dos cálculos pendientes descritos en `docs/verificacion-bloqueos.md`:
TS usa precio histórico por persona × PAX, adicionales y comisión/IVA; SQL de ítems
suma precio_unitario × pax de cada ítem con otro subtotal. No hay una decisión
confirmada para unificarlos. Los pagos nuevos acumulan su equivalente ARS y excluyen
garantías en ambos destinos, pero no se puede certificar un único total/deuda final
de catering frente a cambios de ítems o fallos parciales del recálculo TS. Tampoco
se define aquí un IVA de catering dependiente del medio: su fórmula vigente aplica
IVA del contrato; ambos medios/monedas conservan ese comportamiento.

También se conserva la diferencia previa de servicios: el saldo SQL generado usa
IVA sobre todo el neto y la UI usa la base imponible. No se cambia esa expresión
ni se corrigen saldos anteriores en este alcance.

## Pasos de interfaz en staging

1. Con las tres migraciones aplicadas, iniciar sesión con una cuenta habilitada.
   Abrir **Eventos → evento de prueba → Ingresos** y seleccionar un servicio.
2. Elegir USD, Efectivo USD, importe 100 y cotización 1200. Confirmar equivalente
   ARS 120000 antes de registrar. Cargar otra transferencia USD 100 a 1300 con
   su referencia bancaria: el cobro ordinario debe sumar ARS 250000.
3. Agregar un pago ARS (cotización 1). Verificar suma de equivalentes en historial,
   saldo, flujo de dinero y reportes, y tasas distintas conservadas.
4. Abrir **Editar pago**: comprobar datos originales; cambiar la cotización de uno
   solo y guardar. El otro mantiene su tasa. Darlo de baja y comprobar acumulados.
5. Registrar una garantía USD: aparece marcada, no aumenta cobro ni reduce deuda.
   En un servicio sin pagos ordinarios, la garantía permite IPC; un pago ordinario
   activo lo bloquea y su baja vuelve a habilitarlo.
6. Comparar servicios equivalentes: efectivo ARS 121000 / efectivo USD 100 a 1210;
   transferencia ARS 121000 / transferencia USD 100 a 1210. Cada par debe conservar
   el mismo tratamiento de IVA. Una base IVA ya aumentada no disminuye con la baja.
7. Repetir carga, edición y baja desde **Catering → contrato → Ingresos** para un
   asociado y otro externo. Verificar cobro ARS; evaluar total/deuda final con la
   limitación de fórmula anterior presente.
8. Probar tasa vacía/cero/negativa, importes con decimales y un vendedor/ejecutiva
   sin asignación al destino. Deben rechazarse sin alterar pagos ni acumulados.

No se modificaron contactos ni se implementaron Excel o el circuito de validación.
