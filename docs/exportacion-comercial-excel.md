# Exportación comercial a Excel

## Uso y alcance

En el detalle de un evento o catering, **Exportar a Excel** descarga los datos
guardados. El botón advierte si hay cambios pendientes y se deshabilita durante
un guardado. Un error de lectura impide entregar un archivo incompleto.

Se agregaron `GET /eventos/[id]/excel` y `GET /catering/[id]/excel`. Las respuestas
son privadas, sin caché compartida, y requieren sesión activa, permiso de lectura
del módulo y acceso al registro por RLS. No se usa el cliente administrador.
Los errores de descarga son JSON, incluidos los rechazos del proxy.

Los originales permanecen fuera del repositorio. `resources/commercial-excel/`
contiene únicamente plantillas limpias e inventario estructural sin valores del
ejemplo. Las plantillas se incluyen en el trace del servidor de Next.js, nunca
en `public`. No se hicieron migraciones, modificaciones financieras, push ni
despliegue.

## Lectura de la base configurada

El 21/10/2026 se identificó el proyecto `software-eventos-db` desde el host de
`NEXT_PUBLIC_SUPABASE_URL` de `.env.local`. Se consultaron catálogos de PostgreSQL
por el conector Supabase: funciones, triggers activos, columnas generadas,
restricciones, relaciones y políticas. No se modificó la base ni se descargaron
datos personales. Las consultas reproducibles están en
`supabase/verification/commercial-export.sql`.

Hallazgos comprobados en esa base, independientemente del SQL de referencia:

- `fn_actualizar_totales_catering`, ejecutada por cambios de `catering_items`,
  usa `SUM(catering_items.total)` y el IVA del contrato; `total` de cada ítem es
  `precio_unitario * pax`. Esa función no agrega el precio vigente por persona
  ni la comisión del organizador.
- `recalculateCateringTotals` de TypeScript usa precio vigente × suma de los
  cuatro PAX, suma de precios de los ítems, IVA, comisión e IVA de comisión.
  La exportación nunca ejecuta esta función porque escribe datos.
- `fn_actualizar_totales_pagos` acumula equivalentes ARS de pagos activos
  ordinarios, excluyendo garantías. Los importes ARS son `numeric(12,2)` y las
  cotizaciones tienen cuatro decimales.
- `v_resumen_evento` es `security_invoker=true`, pero suma servicios y contratos
  sin una relación que determine si contienen cargos compartidos. No se usa
  esa vista para exportar ni para recuperar información restringida.
- Las políticas de catering permiten ciertas lecturas por permisos de eventos
  o reportes. La exportación exige **además** el permiso propio de catering.
- `registrar_y_aplicar_ipc` guarda `porcentaje_aplicado` en unidades porcentuales:
  2 significa 2 %. Excel recibe 0,02 con formato porcentual. No se recalcula el IPC.
- La consulta agregada encontró **0 contratos activos**. Hay una divergencia
  comprobada entre definiciones, pero no contratos reales con los que medir
  discrepancias. Los casos con diferencias de esta entrega son ficticios.

### Tres fuentes que no se deben confundir

| Importe | Persistencia | Cálculo/presentación actual | Fuente del Excel |
|---|---|---|---|
| Total de cada servicio | `evento_servicios.total_con_iva` | El detalle muestra ese campo | Mismo campo |
| Total servicios | No hay campo único del evento | `getEventoValores`: suma redondeada de los servicios | Misma suma, nombre `TotalServiciosDetalle` |
| Pagado de un servicio | Existe `total_pagado` | `getEventoValores` lo reemplaza por pagos ordinarios activos | Pagos activos por `evento_servicio_id` |
| Saldo de un servicio | Existe `saldo_pendiente` | `getEventoValores`: total con IVA menos cobros recalculados, con signo | Saldo del detalle; diferencias persistidas se aclaran |
| Total catering | `catering_contratos.total_con_iva` | El detalle muestra el campo, con 0 si es nulo | `TotalCateringDetalle`, mismo tratamiento |
| Saldo catering | `catering_contratos.saldo_pendiente` | El detalle muestra el campo, con signo y 0 si es nulo | `SaldoCateringDetalle`, mismo tratamiento |
| Desglose actual catering | No es un total independiente guardado | `recalculateCateringTotals` puede escribir los totales al guardar | Diagnóstico que replica esa función, sin ejecutar escrituras |
| Cobros catering | Existe acumulado `total_pagado` | Ingresos suma los pagos ordinarios activos | Ambos, con etiquetas diferentes si no coinciden |
| Saldo en Ingresos catering | Derivado | `max(total - cobros ordinarios, 0)` | Se explica cuando difiere del detalle |

El diagnóstico está contrastado automáticamente contra la función TypeScript
real mediante una frontera Supabase simulada. No reemplaza el total visible.
El modelo SQL se documenta; no se introduce otro cálculo financiero en el Excel.

## Mapeo de datos y destinos

Las filas inferiores crecen según la cantidad de servicios, pagos, notas,
adicionales y contactos. `r` indica la fila efectiva dentro del bloque nombrado;
las referencias y los nombres definidos se generan después de ubicar los bloques.

### Evento — CLIENTE

| Destino | Fuente / regla |
|---|---|
| `B1` | `eventos.cliente_nombre` |
| `B2` | `fecha_evento`, fecha real de Excel |
| `D2`, `E6` | Suma de PAX y desglose de los cuatro campos guardados |
| `F2` | `salones.nombre` del evento autorizado |
| `B3` | Referencia a la hoja Catering o aviso de información no incluida |
| `F3`, `B5` | Tipo y nombre del evento |
| `B4` | Proveedores de servicios cuya categoría estable es `ambientacion` |
| `F4`, `A7` | Nombre y contactos guardados del organizador |
| `F5` | Comisión guardada del evento; no se agrega como cargo nuevo |
| `B6` | Nombre del vendedor; email como alternativa existente |
| Servicios, desde fila 10: `A:G` | Nombre catálogo, precio base, adicionales, participa en comisión, proveedor, neto y total con IVA |
| `TotalServiciosDetalle` | Total de los servicios del detalle; fórmula SUM con resultado guardado |
| IVA parcial, `A:G` de cada fila | Servicio, neto, base imponible, tasa, diferencia entre total y neto, cobros y saldo del detalle |
| Pagos, `A:G` de cada fila | Medio + moneda, fecha, banco, cheque, importe original, cotización, equivalente ARS guardado |
| `CobrosServicios`, `SaldoServiciosDetalle` | Pagos ordinarios activos y deuda menos dichos cobros |
| Garantías | Mismas columnas de pagos, únicamente `es_garantia=true`; no reducen la deuda |
| Facturación | Razón social, CUIT/DNI, direcciones y ciudad guardados del cliente |
| Contactos actuales | Nombre, principal, teléfono, correo, relación y observaciones de todos los contactos activos |
| Contacto anterior | Texto conservado, rotulado separadamente; nunca se interpreta ni mezcla con los actuales |

Servicios y pagos se relacionan por `evento_servicios.id` y
`pagos.evento_servicio_id`. La categoría proviene de `servicios_catalogo`, nunca
del nombre, importe o proveedor. Cada servicio conserva su propio bloque, aunque
comparta categoría. Se incluyen categorías como técnica, varios o catering sin
forzarlas dentro de salón, DJ o ambientación.

En **Actualizaciones**, `A:G` contiene servicio, fecha inicial, fecha de ajuste,
tipo, valor inicial, valor ajustado y porcentaje guardado. Son antecedentes
autorizados; no se vuelven a sumar al precio vigente ni se reconstruye una base
original restando aumentos históricos.

No existen datos específicos del evento para determinar empresa emisora o monto
final de factura. Se informa su ausencia, sin copiar el emisor del ejemplo ni
inventar una liquidación fiscal.

### Evento — hoja Catering

Cada contrato autorizado tiene su propio bloque: total y saldo del detalle,
cobrado acumulado guardado, cobros ordinarios registrados y garantías. Se incluyen
los pagos del contrato por su `catering_contrato_id`, una sola vez.

No se calcula un gran total sumando servicios y contratos. El vínculo común con
un evento **no prueba** que sean cargos independientes. Tampoco se infieren
equivalencias por categoría, nombre o importe. Por este motivo no se copia el
“Total general (con catering)” que actualmente muestra la aplicación.

Si no hay permiso de catering, no se consultan contratos ni sus pagos. La hoja
queda con un aviso genérico; no muestra IDs, cantidades, importes ni diferencias
que permitan deducir información restringida. Las lecturas adicionales siguen
RLS. Todos los resúmenes se identifican como limitados a información autorizada.

### Catering — DC

| Destino | Fuente / regla |
|---|---|
| `B1:B4` | Tipo de evento, tipo de servicio, cliente y fecha; evento vinculado sólo si está autorizado, de lo contrario datos propios disponibles del contrato |
| `C5:F5` | Adultos, jóvenes, menores y bebés guardados |
| `B5:B7` | `pax_comida`, `pax_post_postre`, `pax_final`; no se derivan de pagos |
| `B8` | Salón del evento autorizado; para externo, Kiria y lugar guardado |
| `B9` | Organizador del evento autorizado; ausencia explícita cuando no está disponible |
| `B10:B11` | Ejecutiva y razón social disponible |
| `B12` | Último precio por `fecha DESC, created_at DESC` del historial real |
| `B13:B14` | Precios de cierre guardados de alimentos y bebidas, sin asumir que componen el precio vigente |
| `C17`, `C19`, `G18:H19` | Precio vigente general, PAX actuales y producto precio × PAX |
| Ítems, desde fila 20: `A:B,C,H` | Categoría estable, descripción y precio guardado, aplicado una vez según el modelo TS actual |
| Columnas de precios restantes hasta Q | Reservadas, sin precios ni cantidades inventados |
| `TotalCateringDetalle`, `SaldoCateringDetalle` | Valores principales de la pantalla de detalle, ubicados después de los ítems |
| Pagos y garantías: `A:G` | Misma proyección tipada de pagos que en eventos; bloques separados |
| Comisión y revisión del desglose | Comisión guardada, IVA de comisión, IVA del precio y los ítems, diagnóstico TS y total sin IVA persistido |
| Facturación | Emisión, montos con/sin factura, razón social, CUIT, dirección, concepto y contacto administrativo del contrato |
| Contactos | Actuales y texto anterior del evento autorizado; texto propio del contrato si es externo |

Los ítems adicionales son importes fuera del precio por persona, como en la
pantalla actual. No se multiplican nuevamente por PAX. Si hay ítems antiguos de
alimentos/bebidas, se muestran como “ítem guardado”: el diagnóstico replica que
la función TS suma sus precios. El `total` SQL y el historial de cambios de un
ítem no se convierten en una versión histórica de la matriz de precios.

Si no existe acceso independiente al evento, no se consulta su fila ni sus
contactos, tampoco mediante RPC o joins. Los datos ausentes se identifican como
no disponibles para esa descarga. No se inventa un organizador para un externo.

### Hojas auxiliares de catering

- **Historial de precios:** `A:G` desde fila 3 contiene fecha, motivo, precio por
  persona y los cuatro PAX de cada entrada real, incluso si hay más de 15.
  Ninguna entrada se asigna a un pago.
- **INDEC** y **% FIJO ** conservan geometría y estilos limpios. No hay relación
  del contrato con índices o aplicaciones que habilite llenar estos cuadros.
  Se conservan vacíos con aviso, sin divisiones por cero ni IFERROR.
- **VALORES TOTALES POR SEPARADO:** `H3` es el precio general × PAX, `H4:H8` los
  precios agrupados por las cinco categorías estables, `H9` comisión, `H10` IVA
  del desglose, `H11` diagnóstico actual, `H12` referencia al total principal de
  DC y `H13` diferencia. Si es distinta de cero se declara la falta de
  conciliación; nunca se distribuye la diferencia entre alimentos o bebidas.

## Formato, fórmulas y limpieza

`reference-inventory.json` registra dimensiones, combinaciones, cantidad de
fórmulas, validaciones e impresión y hash de los originales, sin sus valores.
Las fórmulas originales no se generalizan: contenían ajustes manuales, importes
incrustados, PAX derivados de pagos y referencias incorrectas entre columnas.

La prueba de ida y vuelta con `xlsx@0.20.3` conservó las fórmulas, pero redujo
las fuentes de evento de 11 a 1, los bordes de 33 a 1 y perdió sus 11 validaciones
y configuración de impresión. En catering también perdió fuentes, bordes y
configuración. Se agregó **ExcelJS 4.4.0** sin cambiar la importación existente.

`scripts/prepare-commercial-templates.py` conserva sólo geometría, estilos y una
lista explícita de etiquetas estáticas. No copia valores, fórmulas, resultados
almacenados, shared strings, comentarios, metadatos, relaciones externas ni
archivos de impresora. Las listas y validaciones de datos del ejemplo se eliminan;
la aplicación crea validaciones acotadas para fechas y cotizaciones exportadas.
Las miles de referencias de validación fuera del área útil no se conservan.

Se mantienen los colores y estilos principales y el ancho original de CLIENTE.
DC conserva la distribución por secciones y las 15 columnas reservadas, con
anchos de la zona útil ajustados para lectura. Las celdas numéricas de totales
usan fondo neutro para que los negativos no queden ocultos por el rojo original.
CLIENTE y anexos imprimen en A4 apaisado; DC en A3 apaisado. Las columnas vacías
reservadas no se imprimen y los auxiliares vacíos sólo imprimen título y aviso.
Las referencias de área de impresión tienen filas y columnas absolutas: sin ello,
Calc ignoraba el límite y reducía innecesariamente la escala del documento.

Sólo se conservan SUM y referencias entre hojas que representan los valores
exportados, siempre con resultado numérico guardado. El resto son importes
numéricos definitivos o diagnósticos identificados. No hace falta recalcular para
verlos al abrir. Se usan fechas reales, formatos numéricos, CUIT y cheques como
texto y valores literales para textos que empiezan con `=`, `+`, `-` o `@`.
Un pago USD sin equivalente histórico conserva esa celda vacía y un aviso; su
subtotal de equivalentes disponibles se identifica como parcial. No se calcula
una cotización alternativa. Sin precio vigente no se declara conciliación del
desglose, aunque los números disponibles coincidan.
Si un texto supera la capacidad de una celda o la altura imprimible de una fila,
la descarga falla con un mensaje explícito en lugar de recortarlo silenciosamente.

## Reproducción y verificaciones

```sh
pnpm excel:examples
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Los cinco archivos ficticios se generan en `outputs/commercial-excel/`: evento,
catering asociado, externo sin pagos, catering con discrepancia y muchos
registros, y evento con permisos parciales. Incluyen cuatro contactos, medios y
monedas diferentes, garantías, más pagos/ítems que los originales y 17 precios
históricos. No se utilizan clientes ni pagos de la base compartida.

Las pruebas cubren autorización antes de leer datos relacionados, filtrado por
destino, páginas de más de 1000 registros y límites de respuesta menores al
solicitado, fallos sin archivos parciales, deduplicación por ID, texto literal,
tipos, fórmulas con caché, ausencia de valores del ejemplo, estilos, validaciones,
nombres seguros y discrepancias con fuentes distintas. Los módulos reales de
respuesta y proxy también se ejecutan con fronteras simuladas.

Se comprobó en un servidor local de producción que ambas rutas devuelven JSON
401 y `private, no-store` sin sesión. Los traces del build incluyen las plantillas.
En Chrome se probó el componente real de descarga y el registro de formularios
con un arnés ficticio: descarga, cancelar/aceptar aviso de cambios, guardado
pendiente, éxito, error al guardar, alta de contacto mediante campo oculto y
error de descarga, sin errores de página.

Se renderizaron las referencias y ejemplos con Artifact Tool. También se abrieron
los cinco ejemplos en LibreOffice para revisar impresión y recálculo, con PDFs
temporales fuera del repositorio. La inspección combina imágenes y extracción
de texto; no equivale a una prueba en Microsoft Excel.
Artifact Tool no resuelve el nombre auxiliar con espacio final `% FIJO `; esa
hoja se verificó en Calc/PDF, conservando el nombre original.

Resultado de la verificación local:

| Comprobación | Resultado |
|---|---|
| Lint, typecheck y build | Correctos |
| Pruebas automatizadas | 100 aprobadas, ninguna omitida |
| Apertura y recálculo de los cinco ejemplos en Calc | Sin errores; resultados iguales a las cachés numéricas exportadas |
| Impresión de las cinco variantes | Sin páginas vacías, errores de fórmula ni caracteres fuera de página; tamaño mínimo observado 10,78 pt |
| Limpieza de los siete XLSX, incluidas las plantillas | Sin nombres identificatorios del evento original, comentarios ni vínculos externos |
| Descarga sin sesión | JSON 401, sin caché compartida, en ambas rutas |
| Interacción en Chrome con datos ficticios | Descarga, avisos, guardados pendientes y errores correctos; sin errores de página |

Limitaciones de verificación: no se realizó una descarga con sesión real contra
un contrato de la base configurada, que no tenía contratos activos. La cobertura
autenticada usa datos ficticios y fronteras simuladas. No se modificaron políticas
RLS ni se escribió información de prueba en la base compartida.
