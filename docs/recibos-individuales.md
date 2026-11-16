# Recibos individuales

Implementación del 16/11/2026. La migración `20261116222142` fue aplicada y
verificada en `software-eventos-db` con autorización posterior del usuario.
No reaplicarla. Ver el registro de publicación al final de la matriz de revisión.

## Operación

En Ingresos del evento, **Ver / emitir recibo** abre una vista previa PDF de un
cobro persistido. Previsualizar no escribe. **Emitir recibo y habilitar descarga**
hace una llamada autenticada a `emitir_recibo`; guarda la instantánea SQL y asigna
serie `REC` y número global de secuencia. Una secuencia puede dejar huecos ante
un rollback; nunca se reutilizan números ni se promete numeración fiscal.
El PDF dice «Documento no válido como factura».

La nueva sección de recibos emitidos permite encontrar también los comprobantes
de cobros dados de baja, aunque ya no aparezcan entre los ingresos activos.
El original conserva su fecha, cliente, conceptos, cobertura, importes, marca y
logo al emitir. La previsualización sin emitir puede cambiar. La emisión toma
el estado vigente en la transacción: el texto de confirmación lo informa.

Las rutas son `/eventos/[id]/ingresos/recibos/[pagoId]` y, para un cobro directo
de catering **externo**, `/catering/[id]/ingresos/recibos/[pagoId]`. Cada una tiene
su subruta `/pdf`. `?comprobante=<uuid>` identifica una revisión y `&descargar=1`
la descarga; sin comprobante emitido se rechaza descargar. Nunca se emite por GET.

## Alcance y permisos

Se usa el cliente Supabase de sesión, sin clave de servicio. RPC y RLS exigen
usuario activo, permiso de lectura del módulo y acceso al registro original y
al destino actual. Un evento debe estar activo y visible por salón. Un catering
externo debe estar activo y accesible según sus permisos vigentes.

**Un acceso parcial a catering no habilita un recibo completo ni parcial de una
cabecera del evento**, distribuida o directa. Se informa expresamente y la RPC
lo rechaza aunque se invoque por fuera de la UI. No se ocultan destinos dentro
de un recibo ni se presentan subtotales como dinero total recibido. Desde un
catering vinculado accesible se remite al recibo en el evento. La descarga de un
externo sólo contiene su cobro propio. No se exige permiso de gestión para emitir
o leer: no modifica el dinero ni las imputaciones; sí deja constancia de emisión.

Las tablas no conceden escrituras de recibos a clientes. Helpers de instantáneas
y triggers no son ejecutables por clientes. `recibo_acceso` devuelve únicamente
un booleano de autorización; las dos RPC públicas invoker delegan en funciones
privadas definer que verifican identidad, módulo y alcance antes de leer datos.
Las respuestas PDF y de error son `private, no-store`, con `Vary: Cookie`.

## Marca y logo

`recibo_emisores` permite una configuración por salón y una global
(`salon_id IS NULL`). Sólo un administrador activo puede administrarla, con RLS
y auditoría. La configuración global se usa para catering externo sin salón. Sin configuración
específica, un salón conserva su nombre como marca tipográfica; no adopta el
emisor del catering externo. No se inventa un logo.
Un externo sin salón necesita un emisor global o un emisor para su salón.

Preparar el valor real antes de ejecutar en el entorno elegido (el siguiente
es un ejemplo, **no ejecutarlo literalmente en producción**):

```sql
insert into public.recibo_emisores(salon_id,marca,logo_data_url)
values (null,'NOMBRE REAL DEL NEGOCIO',null)
on conflict (salon_id) do update set marca=excluded.marca,logo_data_url=excluded.logo_data_url;
```

El logo es opcional: un `data:image/png;base64,...` o JPEG real, de hasta 500.000
caracteres. Usar un archivo verificado; no se aceptan URL remotas ni SVG y no hay
fetch de imágenes desde el servidor. Puede utilizarse el logo existente de Kiria
si corresponde al emisor elegido: no se asume que identifica a todos los salones.
La instantánea incluye los bytes para que reemplazar el logo no altere lo emitido.
Esta entrega configura por SQL/RLS, no agrega otra pantalla administrativa.

## Historia, anulaciones y concurrencia

La emisión bloquea la fila del cobro; dos transacciones reciben el mismo recibo
original. Restricciones únicas protegen `(pago_id,revision)`, `(serie,numero)` y
la cadena `anterior_id`. La baja física de un cobro documentado queda bloqueada
por FK; la aplicación conserva su baja lógica.

Triggers diferidos sobre cabecera, imputaciones, coberturas y componentes capturan
el estado **final** de la transacción, sólo si cambió el contenido financiero.
Crean una revisión `modificacion` o `anulacion` con otro número y un vínculo al
anterior. Varias escrituras de una RPC producen un único documento final. Notas
internas y cambios de cliente/precios por sí solos no reescriben lo emitido.
La auditoría registra actor y alta de cada comprobante. La cadena vincula el
mismo pago y se conserva aun después de reasignar personas/dinero.

El original PDF permanece idéntico y expresa **estado al emitir**. Si se anula o
corrige el pago, la página advierte el cambio, muestra la última revisión y
permite descargar toda la cadena. El original no se convierte silenciosamente
en un comprobante nuevo. La anulación registra referencia histórica; no simula
una devolución de caja. Un cambio de día de un cheque no modifica documentos:
Ingresos muestra el estado actual y el PDF conserva el de emisión.

El renderizador consume sólo snapshot versión 1, con metadatos de fecha fijos;
la prueba compara bytes de dos descargas. Cambios futuros de formato requieren
conservar este renderizador y agregar una nueva versión. No se reconsulta el
cliente, la cotización, los precios ni la configuración para renderizar emitidos.

## Contenido monetario

Cada recibo tiene un medio, el de la cabecera. Imputaciones no son ingresos
adicionales. Se incluyen moneda/importe originales, cotización guardada, equivalente
ARS, banco/número de cheque, PAX y tarifas históricos cuando corresponden.
Un equivalente legacy ausente se informa, sin inventar tasa o total.

Capital, IVA y ajustes se imprimen sólo cuando existe desglose persistido. Legacy
se identifica sin presumir IVA. `objetivo = equivalente real + ajuste`; ajuste de
ARS 4 no es dinero recibido. Las reasignaciones muestran el capital transferido
y conservan el IVA en origen. Garantías y cheques pendientes indican que no
cancelan deuda ordinaria. Las modificaciones no se presentan como nuevos ingresos.

## Aplicación manual en orden

1. Revisar el historial remoto. El 16/11 se confirmó por lectura que
   `20261115231648_catering_iva_separado_usd` **ya está aplicada** en
   `software-eventos-db`, con dependencias PAX, IPC, imputaciones y cheques.
   No reaplicarla. Para otra base seguir primero los runbooks anteriores.
2. En copia aislada/staging, guardar inventario/saldos con el preflight fiscal.
   Ejecutar [preflight-recibos.sql](../supabase/verification/preflight-recibos.sql)
   y guardar sus resultados. Requiere el propietario de las funciones existentes.
3. Ejecutar **completo**, incluido BEGIN/COMMIT, el archivo
   [20261116222142_recibos_persistentes_y_excedentes.sql](../supabase/migrations/20261116222142_recibos_persistentes_y_excedentes.sql).
   Ante un error, ROLLBACK y revisar; no continuar con la transacción abortada.
   Se puede ejecutar con `psql -X -v ON_ERROR_STOP=1 -f <archivo>`.
4. Ejecutar [postflight-recibos.sql](../supabase/verification/postflight-recibos.sql).
   RLS activa, ACL revisadas, cuatro triggers diferidos; contadores de errores
   cero y conteos financieros iguales al preflight. Configurar el emisor real.
5. Regenerar tipos oficiales y preservar las restricciones de escritura existentes.
   Revisar advisors y verificar en staging con Auth real: lectura sin gestión,
   otro salón, ejecutiva parcial, externo propio/ajeno, anulación, reintento
   concurrente y descarga reproducible. Recién después publicar el frontend.
6. Si se aplica desde SQL Editor, conciliar la versión nueva en el historial
   según el procedimiento del entorno. No hacer `db push/reset` global: el repo
   no tiene baseline completo. Esta tarea no ejecuta estos pasos remotamente.

La sobrecarga de reasignación de ocho argumentos exige `p_importe_esperado`.
La anterior de siete se conserva, incluido su rechazo a varias tarifas cuando
no hay confirmación del importe; así no se cambia el comportamiento de clientes
anteriores. El nuevo frontend requiere la sobrecarga y las tablas/RPC de recibos.
Un rollback de frontend conserva esquema y documentos; no eliminar historia.

## Pruebas

`pnpm test:recibos:db` crea y destruye su propio PostgreSQL; no acepta URL remota.
Ejecuta migración, preflight/postflight y pruebas reales RLS/concurrencia. Los
fixtures son un catálogo parcial para pruebas, no un baseline desplegable.
`pnpm recibos:examples` crea tres PDF ficticios y elimina su compilación temporal.
Resultados y límites del recorrido integrado en la [matriz de revisión](revision-reunion-20261116.md).

## Aplicación autorizada del 16/11/2026

El usuario autorizó validar, migrar y pushear a main. Se aplicó mediante el conector
Supabase la versión `20261116222142`, con el contenido probado aislado. Se alineó
el nombre del archivo local a la versión que asignó el conector; no se alteró el
historial remoto ni el SQL una vez aplicado. Huella SHA-256 del archivo:
`a46de4e674f9740a49d0486042cb7f64c95417956d428eadae32d66adfa1d75b`.

Las huellas de 25 pagos, 9 contratos, 27 servicios, 2 coberturas, 0 componentes y
0 imputaciones coincidieron exactamente antes/después. El postflight confirmó
RLS, ACL sin escrituras de clientes, cuatro triggers diferidos y cero
inconsistencias. No se emitieron recibos de prueba en producción.

A elección explícita del usuario se configuró **Kiria**, usando los bytes de
`public/kiria-catering.png`, para externos sin salón. No se sustituyó la marca
de ningún salón. Los tipos se regeneraron con la herramienta oficial contra
el esquema remoto completo, conservando campos derivados/trigger como `never`,
argumentos nullable y escrituras de recibos restringidas a RPC.

La suite adicional `test:recibos:http` valida PostgREST 14.5 real con JWT firmado
ficticio, RLS, preview, emisión concurrente, corrección por HTTP y la sobrecarga
de reasignación. No usa Supabase Auth del proveedor ni datos de producción.
El acceso público real a Auth responde 200 y el de lectura de recibos responde
401, como corresponde. Esto no acredita un login ni una operación de cobro real.
