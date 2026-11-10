# Catering por categoría y cobros por personas

## Precios y saldo

El historial de catering guarda el precio general y, en la misma versión, los
precios específicos de adultos, jóvenes, menores y bebés. Una categoría sin
precio específico usa el general. El precio específico puede ser cero. Los
adicionales por persona se suman a las categorías elegidas. Un adicional sin
categorías se cobra una sola vez, incluso si su campo histórico `pax` difiere
de 1. Se conserva el campo generado `catering_items.total` del esquema
anterior. Los totales del contrato, el desglose y el Excel usan el cálculo SQL
de catering.

El precio de cobertura que muestra Ingresos incluye el IVA del catering y los
adicionales por persona correspondientes. Comisión, su IVA y los cargos fijos
se siguen liquidando en el saldo del contrato. El importe del cobro es la suma
de cantidades por sus precios unitarios aplicados, redondeados a centavos.
Para USD se conserva el importe original y la cotización ingresada. El
equivalente debe coincidir al centavo con la cobertura.

El total comercial se muestra a precios vigentes. El saldo valora sólo los
PAX pendientes a precios vigentes y resta, por separado, los cobros ordinarios
por importe. Los importes históricos de cobertura siguen en el total recibido.
Si se cubrieron 10 jóvenes a ARS 40.000, una recotización a ARS 45.000 con 15
jóvenes mantiene ARS 400.000 cobrados y ARS 225.000 pendientes para esa
categoría. El IVA del saldo se redondea sobre el subtotal pendiente del
contrato, por lo que la suma de los saldos por categoría puede diferir por
redondeo.

Un cheque reserva la cantidad para evitar otra venta sobre los mismos PAX y la
cubre recién el día de la acreditación en Argentina. Las garantías se cargan
por importe. Las coberturas registradas conservan precio, cantidad e importe
originales. Para corregir el cobro completo, se usa la baja lógica y se
registra el cobro correcto. La baja conserva el historial y libera su cobertura.

Si el PAX baja, el excedente acreditado aparece por categoría. En Ingresos del
evento, el autor del cobro o un administrador con acceso al evento puede
reasignarlo a un servicio u otro catering activo del mismo evento. Se libera
la cantidad elegida a su tarifa histórica y se mueve la imputación dentro de
la misma cabecera. La operación es atómica y audita la cobertura y las
imputaciones. Si la categoría tiene más de una tarifa histórica activa, la
reasignación espera la definición de prioridad. Los caterings externos pueden
cobrar por personas y mostrar excedentes. El flujo de reasignación requiere
un evento compartido con el destino.

La hoja original DC de catering y la plantilla versionada no distinguen
pack y cubierto. En el Excel de evento, «pack» aparece para servicios como
DJ, ambientación, fotografía y video. Los precios de catering se toman de
las tarifas explícitas cargadas por categoría.

## Publicación manual

1. Confirmar las versiones de [cheques e imputaciones](imputaciones-cobros.md).
   Desde el SQL Editor ejecutar
   [preflight-catering-por-personas.sql](../supabase/verification/preflight-catering-por-personas.sql).
   Deben existir la vista acreditada, la tabla de imputaciones y la RPC
   distribuida. Confirmar PostgreSQL 15 o superior, el mismo propietario de
   las funciones en el SQL Editor, el saldo anterior generado y las políticas,
   triggers y tipos listados. Registrar los conteos históricos para comparar.
2. Ejecutar
   [20261110215027_catering_por_personas.sql](../supabase/migrations/20261110215027_catering_por_personas.sql)
   completo en el SQL Editor. El archivo contiene su transacción y solicita
   recargar el esquema de PostgREST. El Cron existente sigue acreditando
   cheques. El SQL conserva las filas y los saldos históricos almacenados.
3. Ejecutar
   [postflight-catering-por-personas.sql](../supabase/verification/postflight-catering-por-personas.sql).
   Esperar indicadores de permisos y auditoría verdaderos y cero
   inconsistencias de cabeceras, coberturas y vínculos. Si cambió el día de
   Argentina durante la ventana, revisar la última ejecución del Cron y
   repetir la consulta de saldos sincronizados. Las diferencias preexistentes
   entre totales guardados y el desglose se revisan por separado.
4. Publicar el frontend. El frontend anterior puede seguir haciendo
   operaciones ordinarias entre los pasos 2 y 4. El nuevo requiere las
   columnas, vistas y RPC de la migración. Después del primer cobro por
   personas, volver al frontend anterior oculta la cobertura y puede mostrar
   saldos de eventos y exportaciones que omiten el ajuste. Para recuperar
   esas pantallas, conservar el esquema y corregir el frontend hacia adelante.
5. Conciliar la versión aplicada a mano con el historial de migraciones antes
   del siguiente deploy por CLI.

El 10/11/2026 se aplicó esta migración mediante el conector de Supabase.
La versión del archivo coincide con el historial remoto. La posvalidación
confirmó permisos, auditoría, cero inconsistencias y Cron activo.

## Referencia parcial

El archivo `schema.sql.txt` se contrastó con los fixtures, las migraciones y
el catálogo desplegado mediante consultas de solo lectura del 10/11/2026.

| Referencia parcial | Repo y catálogo desplegado |
| --- | --- |
| `evento_id` obligatorio en pagos, egresos y contratos de catering | Los tres admiten nulos. Los contratos tienen además los campos propios de catering externo, incluido `lugar_evento`. |
| `importe_en_pesos` como valor por defecto, `tipo_cambio` con default 1 y numéricos sin escala declarada | El equivalente es generado como importe original × cotización. Los importes tienen dos decimales y la cotización cuatro. La columna no tiene default. |
| Saldo del catering y total de ítem declarados como defaults | Ambos son columnas generadas en el esquema previo. `saldo_pendiente` pasa a calcularse en el trigger con la migración nueva. |
| Saldo del servicio con IVA sobre el total base | La fórmula desplegada aplica IVA sobre `iva_base_imponible`. |
| FK de pagos al evento sin acción declarada | La FK desplegada tiene `ON DELETE CASCADE`. Los flujos de aplicación siguen usando bajas lógicas. |
| `catering_items_historial`, sin historial del precio general ni imputaciones distribuidas | La tabla de historial por ítem sigue existiendo. Las cotizaciones usan `catering_precio_historial`; también existen `pagos.distribuido`, `pago_imputaciones` y su restricción de destinos. |

Se confirmaron PostgreSQL 17.6, el propietario `postgres`, las tres versiones
previas de cheques e imputaciones, RLS activa y las vistas previas con
`security_invoker`. El historial de precios desplegado aún guarda un precio
general y carece de un trigger de auditoría propio. Para la publicación
quedan los conteos históricos del preflight, la revisión de las políticas
vigentes y las comprobaciones de posvalidación después de ejecutar el SQL.

## Pruebas aisladas

```sh
pnpm test
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:cobertura:db
```

El runner crea su propio clúster PostgreSQL 17 y usa datos ficticios. Ejecuta
los scripts de verificación y las regresiones de pagos distribuidos, cheques,
PAX por categoría, adicionales, recotización, baja y reasignación.
