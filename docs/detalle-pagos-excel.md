# Detalle descargable de pagos del evento

En **Eventos → Ingresos**, **Descargar detalle de pagos** entrega un `.xlsx`
para adjuntar por mail. La ruta es `/eventos/[id]/ingresos/excel`. Parte de
`main` en `6c42a969`, con cheques, imputaciones, catering por personas e IPC
integrados. No agrega dependencias, plantillas ni migraciones.

## Contenido y conciliación

- **PAGOS:** cliente, evento, salón, fecha del evento y fecha del saldo en
  Argentina. Incluye total vigente, ajuste por cobertura histórica, cobrado
  ordinario acreditado, saldo, cheques pendientes y garantías. Cada cabecera
  aparece una vez, aunque se distribuya entre varios destinos. Las garantías
  tienen su propio bloque. Se muestran registro, pago/acreditación, concepto,
  medio, moneda, cotización histórica, importe original, equivalente ARS,
  estado, banco y número de cheque como texto.
- **IMPUTACIONES:** número del cobro dentro del archivo, destino, importe
  asignado en ARS y tipo (ordinario/garantía). No se suman otra vez al ingreso.
- **PAX:** resumen por contrato y categoría con contratados, cubiertos, por
  acreditar, pendientes, excedentes, saldo y precio vigente. El detalle por
  cobro conserva cantidad, precio e importe históricos, cantidades reasignadas
  y cobertura restante. Nunca se deducen PAX de un cobro por importe.

Pantalla y descarga comparten `loadEventoIngresos`. Se paginan los cobros,
contratos y tarifas, con orden estable. Se excluyen bajas lógicas y otros
eventos. Un error de lectura impide descargar un archivo parcial.

El saldo es el actual a la fecha indicada, no una reconstrucción histórica:
`max(total vigente + ajuste por cobertura histórica − cobrado ordinario, 0)`.
Las garantías y los cheques cuya acreditación es posterior al día argentino no
reducen ese saldo. Un USD histórico sin equivalente conserva la celda vacía y
un aviso de totales parciales; no se inventa una cotización actual.

En el caso ficticio combinado, el total vigente es ARS 13.600, el ajuste es
−800 y el cobrado ordinario es 3.000: saldo **9.800**. Incluye USD 2 a ARS
1.000, repartidos en 1.200/800; un cobro por dos adultos a 500 antes de recotizar
a 900; cheque pendiente de 900 y garantía de 300.

## Referencia y decisiones de negocio

Se inspeccionó la hoja **PAGOS** del XLS proporcionado, incluidas sus fórmulas.
`C5=E5*F5` aplica precio por cantidad de adultos; `C6=B5-C5-B6` calcula un
remanente después de otra deducción. Otras filas reparten el bruto por mitades.
Por lo tanto, **Monto neto no significa uniformemente importe sin IVA** y no
hay una correspondencia general segura con los campos del sistema. La descarga
usa etiquetas explícitas de importes e imputaciones, sin mapear bruto/neto.
Si se necesitan esos dos nombres, confirmar primero qué representan y qué
deducciones admiten. Esto no bloquea el historial solicitado.

No se incorporó el XLS original ni la foto del talonario. Se reutilizan sólo
estilos de la plantilla comercial `evento.xlsx`, ya limpia. Las tres hojas se
crean desde cero con etiquetas y datos del sistema; no se copian valores,
fórmulas, contactos, comentarios ni metadatos del ejemplo original. La entrega
es el historial completo de cobros activos, no un recibo individual.

## Permisos y base desplegada

La descarga utiliza la sesión del usuario y exige perfil activo y lectura del
módulo **eventos**. No exige gestión. Antes de consultar pagos comprueba que
el evento esté activo y visible bajo RLS. Respeta el mismo acceso a catering
vinculado que Ingresos; no cambia el exportador comercial de catering externo.
Respuestas y errores son `private, no-store`, con `Vary: Cookie`. No usa una
clave de servicio ni registra datos financieros. El proxy devuelve JSON
401/403 para errores de sesión/permisos en esta ruta.

Se contrastó `schema.sql.txt` con tipos, migraciones, fixtures y el catálogo
de `software-eventos-db` mediante consultas de **solo lectura** el 10/11/2026:

| Referencia parcial | Repo y catálogo desplegado confirmado |
| --- | --- |
| `pagos.evento_id` y `catering_contratos.evento_id` obligatorios | Admiten nulos para catering externo; el contrato también tiene `lugar_evento`. |
| `importe_en_pesos` como default y cotización con default 1 | Equivalente generado como original × cotización, dos decimales; cotización con cuatro decimales y sin default. |
| Saldo del catering como default | Columna ordinaria calculada por los mecanismos de catering; la vista del evento incorpora `ajuste_cobertura_catering`. |
| Sin imputaciones ni cobertura histórica | Existen `pagos.distribuido`, `pago_imputaciones`, `catering_coberturas`, `catering_items.categorias_pax` y `v_catering_tarifas`. |
| Sin definiciones completas de permisos/vistas | RLS activa en eventos, pagos, imputaciones y coberturas; vistas consultadas con `security_invoker=true`. Auditoría activa en pagos, imputaciones y coberturas. |

El historial remoto contiene las versiones `20261110211110`, `20261110211121`,
`20261110211132`, `20261110215027`, `20261110224729` y `20261110224738`.
No se detectó una diferencia de las interfaces necesarias para esta descarga.
En la revisión previa al push se confirmó una diferencia histórica de registro:
la versión local `20261005154547_catering_externo_lugar_y_pax` no figura en
`supabase_migrations.schema_migrations`. Su columna, funciones, trigger y siete
políticas ya existen en la base desplegada. No se reejecutó ese SQL ni se
modificó el historial remoto; conciliar ese registro requiere revisar las
definiciones completas en un trabajo separado y no bloquea esta descarga.
Queda verificar con sesiones reales la descarga sobre el despliegue final;
las pruebas autenticadas de esta entrega usan fronteras simuladas y RLS real
con datos ficticios en PostgreSQL aislado.

## Publicación manual

1. Ejecutar en SQL Editor
   [detalle-pagos.sql](../supabase/verification/detalle-pagos.sql) como
   prevalidación de solo lectura. Todos los indicadores deben ser verdaderos;
   revisar además las políticas listadas. Si faltan las migraciones previas,
   seguir sus procedimientos en [imputaciones](imputaciones-cobros.md) y
   [catering por personas](catering-por-personas.md) antes de publicar.
2. Publicar el frontend. **Este cambio no necesita SQL de migración**, ni
   regenerar tipos. Es compatible con la base actual y con volver al frontend
   previo a este cambio: no se escriben ni transforman datos al descargar.
3. Repetir el mismo script como posvalidación. Descargar un evento autorizado
   y conciliar saldo, cobros, cheque pendiente, imputaciones y cobertura con
   Ingresos. Probar que otra sesión de distinto salón reciba 404 al pedir la
   URL directa, y una sesión sin permiso de eventos reciba 403.
4. Abrir el archivo en Microsoft Excel y adjuntarlo por mail manualmente.
   La apertura del ejemplo ficticio ya se verificó en Excel web.
   Este trabajo no envía correos ni publica el frontend.

`supabase/tests/detalle-pagos.sql` es exclusivamente una prueba con escrituras
ficticias para el runner aislado: **no ejecutarla en la base compartida**.

## Archivos y pruebas

- Ruta/página de Ingresos, botón comercial y proxy: nueva descarga, manejo de
  errores y registro de borradores/guardados de pagos y reasignaciones.
- `commercial-export/{data,rows,types,response,workbook}` y
  `pagos/{queries,ingresos-data}`: lectura compartida y las tres hojas.
- `next.config.ts`: incluye la plantilla limpia en el bundle de la ruta nueva.
- Pruebas comerciales, fixtures, runner PostgreSQL, comando de pruebas,
  generador de ejemplos y este documento. El único ejemplo nuevo es
  `outputs/commercial-excel/detalle-pagos.xlsx`, con datos ficticios.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
PG_BIN=/opt/homebrew/opt/postgresql@17/bin pnpm test:detalle-pagos:db
pnpm excel:examples
```

La suite SQL crea y elimina su propio clúster PostgreSQL 17. Prueba escrituras
USD, reparto, recotización, cobertura y cheques, garantías, bajas, auditoría y
acceso de lectura sin gestión, otro salón e inactivos. Las pruebas unitarias
ejecutan loader, respuesta XLSX, ruta, proxy y botón con fronteras simuladas.
Incluyen más de 1.000 cabeceras, errores sin archivo parcial, literalidad de
textos, tipos de celdas y reapertura con ExcelJS y SheetJS.

Se inspeccionaron visualmente las tres hojas con Artifact Tool y se verificó
que no hubiera errores de fórmula ni datos identificatorios del original.
Con autorización del usuario se subió sólo el ejemplo ficticio a su cuenta
personal de Microsoft. **Excel web abrió el XLSX sin pedir reparación**. Se
verificaron por la interfaz los siguientes valores:

| Hoja | Celdas y valores comprobados en Excel web |
| --- | --- |
| PAGOS | L4: 13.600; L5: −800; L6: 3.000; L7: 9.800; L8: 900; L9: 300. |
| PAGOS | G13: 1.000; H13: 2; I13: 2.000. Cotización, importe USD y equivalente ARS históricos. L14 conserva `0000123` como texto. |
| IMPUTACIONES | A4 y A5: mismo cobro 1; C4: 1.200 y C5: 800; D8 identifica la garantía. |
| PAX | E4: 2 cubiertos; F4: 1 por acreditar; J4: precio vigente 900; G8: precio histórico 500; H8: importe histórico 1.000; J7: por acreditar. |

La copia de prueba quedó en la cuenta personal elegida. No se probó Excel de
escritorio, que no está instalado en este equipo. No se aplicaron migraciones
ni se hizo deploy en producción.

Resultados: lint, typecheck y build correctos; **128 pruebas unitarias y 83
comprobaciones SQL aprobadas**, ninguna omitida. El trace de producción de la
ruta nueva incluye la plantilla. El XLSX se reabre con ExcelJS, SheetJS y
Artifact Tool; no contiene macros, vínculos externos ni comentarios.
