# Cotización automática por persona

En **Evento → Valores del evento**, la cotización por persona se calcula como
**total final de los servicios del evento ÷ PAX del evento**, redondeado a dos
decimales. El total incluye los adicionales, el IVA parcial y los ajustes IPC
ya incluidos en cada servicio. Los PAX son la suma de adultos, jóvenes,
menores y bebés del evento; no se usan las cantidades de un contrato de catering.

Se calcula al mostrar los datos actuales, sin guardar otro precio que pueda
quedar desactualizado. Guardar un servicio, eliminarlo o editar los PAX refresca
el detalle mediante las invalidaciones existentes. El Excel del evento usa
la misma función y los mismos importes. Sin PAX, la cotización queda vacía y
se solicita cargar las cantidades; sin servicios y con PAX, el resultado es cero.

El catering vinculado se presenta por separado y no se suma a «Total servicios».
Sus tarifas por categoría siguen siendo las tarifas de cobro de ese contrato;
no se convierten los servicios de salón en un segundo cargo de catering.
La pantalla identifica ese valor como «Tarifa base del catering x persona sin IVA».
La cotización de servicios no resta pagos ni modifica coberturas históricas,
recibos emitidos o movimientos financieros.

No hay cambios de esquema ni migraciones. Verificar con `pnpm test`, `pnpm lint`,
`pnpm typecheck` y `pnpm build`.
