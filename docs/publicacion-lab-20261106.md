# Publicación del lab — 06/11/2026

**Lista con observaciones para un lab guiado con la sesión admin disponible.**
Los bloqueos reproducidos se corrigieron y las migraciones están aplicadas.
La fase vendedor requiere una sesión propia y su prueba HTTP por salón antes de
habilitar el lab completo con varios roles. No se crearon cuentas ni se cambiaron
permisos/asignaciones de usuarios reales para suplir esa falta de cobertura.

Continuación del [informe inicial](qa-lab-20261106.md), autorizada por el usuario
para corregir, migrar y preparar la web del lab. Destino confirmado: Supabase
`juxczmoqsiumphjwhhbc`, Vercel `software-eventos`, proyecto
`prj_E2AmYFzJXDI2YMxlKvo6ZGpb1OqF`, equipo `team_rXWoLLYiF1LS4JyTcuZVVShY`.
La producción inicial servía el commit `d895e834384eaffd8441300143b395f53aa70b8b`.

## Base de datos aplicada

Se aplicaron únicamente estas tres migraciones mediante MCP, en transacciones:

1. `20261106190930_align_service_balance_with_partial_vat.sql`.
2. `20261106190931_allow_authorized_expense_soft_delete.sql`.
3. `20261106191328_atomic_catering_totals.sql`.

Los nombres locales usan los timestamps que asignó el historial remoto; no se
modificaron las sentencias después de aplicarlas ni se hizo push global del schema.
El saldo de servicios pasó de 15 diferencias a **0**. La huella de las columnas
de origen de esos servicios es idéntica antes y después. Las huellas completas de
contratos, adicionales e historial de precios tampoco cambiaron con el DDL.
No se hizo backfill de catering ni se tocaron usuarios/asignaciones.

Se guardó el catálogo anterior y las huellas, sin filas de clientes, fuera del
repositorio en `~/.codex/backups/software-eventos/20261106-release` (0700/0600).
Es un respaldo de definiciones, no un backup completo de datos ni una prueba PITR.

## Catering: LAB-007 corregido

Se reprodujo en PostgreSQL aislado: agregar un adicional dejaba total 121 donde
la fórmula comercial daba 1815, hasta que llegaba una segunda solicitud de la app.
La migración usa la fórmula ya implementada: precio vigente × suma de PAX,
adicionales por importe unitario, comisión, IVA del subtotal e IVA de comisión,
redondeados a centavos. Garantías y pagos eliminados siguen excluidos del cobrado.
La selección de precio desempata fecha, creación e ID, también en detalle y Excel.

El trigger del contrato calcula los totales en la misma transacción; los triggers
de adicionales y precio bloquean el padre antes de escribir. La recotización aplica
PAX y total junto con el historial; cualquier error revierte todo. El alta usa
`crear_catering_con_precio`, SECURITY INVOKER, y revierte contrato y precio juntos.
No hay nuevos permisos sobre filas. La función privilegiada interna del cálculo
vive en schema no expuesto y no es ejecutable por anon/authenticated. Se retiró
el recálculo TypeScript posterior, que podía fallar sin informar al usuario.

Pruebas: **21 comprobaciones SQL** más cuatro sesiones concurrentes reales
(dos adicionales y dos pagos; total 1875,50, cobrado 300, saldo 1575,50).
Incluyen falla forzada al actualizar PAX, alta con precio inválido, conservación
del estado anterior, pago USD, garantías, bajas, vendedor propio/ajeno,
ejecutiva externa, inactivo, anon y sólo lectura. Todo en cluster efímero.

## Tipos y controles

El comando local `pnpm supabase:types` sigue bloqueado por Docker apagado. Se
regeneraron los tipos completos del proyecto real con el generador oficial MCP;
incluyen la RPC nueva. Se conservaron las anotaciones de columnas generadas y
argumento nullable de roles, y se impide escribir los totales de catering que
ahora controla el trigger. No se usó un fixture parcial como schema de aplicación.

`pnpm test`: **103 aprobadas**. Regresiones nuevas comprueban alta atómica,
conservación de borradores ante error y recotización con una única escritura.
También pasaron lint, typecheck, build y las suites de saldo (10) y egresos (14).

El advisor conserva avisos previos sobre
[search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[helpers SECURITY DEFINER anónimos](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
[autenticados](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) y
[contraseñas filtradas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
La función de totales reemplazada dejó de ser SECURITY DEFINER pública.
No se amplió esta entrega a cambios de Auth.

## Publicación y prueba HTTP

Publicación de producción **READY**, mediante push a `main`, commit
`f67333fdde21f0d5b39f68531c65d08990571a46`.
Deployment `dpl_E8E5KazyiWpavY2pYiZQ1dALSikt`; build remoto de aproximadamente 36 s.
Se confirmó el SHA y la asignación del dominio
[software-eventos-lovat.vercel.app](https://software-eventos-lovat.vercel.app).
Las pruebas siguientes se hicieron en Chrome sobre ese dominio después de READY
y una recarga completa; no sobre el build local ni sobre la versión anterior.

| Recorrido admin / producción | Resultado |
| --- | --- |
| Alta de evento ficticio, fecha por etiqueta, recarga | Aprobado: 29/11/2026 sin desplazamiento |
| Servicio 1000 + 100 + IVA sobre 500; cobro 200 | Aprobado: total 1205, cobrado 200, saldo 1005 en UI y SQL |
| Alta y baja de egreso 30 desde la app | Aprobado: 30 → 0, fila con deleted_at; sin SQL administrativo de limpieza |
| Catering vinculado y precio inicial | Aprobado: 10 × 100 + comisión 50, ambos IVA 21%: 1270,50 |
| Adicional 20 | Aprobado: total 1294,70 sin segunda solicitud de recálculo |
| Recotizar 110 / 11 PAX, guardar Editar y recargar | Aprobado: ambos formularios en 11; total 1548,80; borrador de notas conservado y persistido |
| Cobro catering 100 y posterior baja | Aprobado: saldo 1448,80 y luego 1548,80; total sin cambios |
| Excel de catering sin editar | Aprobado: descarga sin aviso falso; TotalCateringDetalle=1548,80 y SaldoCateringDetalle=1448,80 |
| Alta de catering externo por la RPC nueva | Aprobado: 2 × 10, IVA 21%, total 24,20; fecha/lugar propios |
| Bajas de contratos/evento y vuelta al dashboard | Aprobado: listados vuelven a 3 contratos y 8 eventos activos |

La consulta de logs de esta publicación, niveles error/fatal y ventana de 30 min,
no devolvió entradas. Esto cubre los recorridos observados, no fallas futuras.
No se revisaron drains ni se instaló monitoreo nuevo.
El cierre documental y las capturas se agregan después en un commit separado,
sin cambios en la aplicación ni nuevas migraciones.
El XLSX se leyó estructuralmente con sus valores guardados; no se probó Microsoft
Excel ni su recálculo nativo. No se repitieron aquí las pruebas de Auth con
credenciales válidas, expiración ni fallos de red: siguen las limitaciones del
informe inicial. Login por POST quedó publicado, verificado en código y en el
build local durante la primera ronda.

Capturas anteriores a la limpieza: [PAX publicados](evidencias-lab-20261106/catering-publicado.jpg)
y [baja de egreso publicada](evidencias-lab-20261106/egreso-baja-publicada.jpg).

## Limpieza de esta publicación

Todos los registros nuevos usaron `LAB RELEASE 2026-11-06`. Se dieron de baja por
la interfaz los dos pagos, el egreso, los dos contratos y el evento. No se hizo
borrado físico de entidades ni se modificaron clientes reales.

- Evento: `bc14e924-b4ad-4e06-a135-f21be4a5d5c6`.
- Servicio: `12aa1779-b822-4f62-87cd-ee83093b66e0` (queda con padre eliminado).
- Catering vinculado: `1119a59d-60f8-43f2-b7dd-a1b9db1d3fb8`.
- Catering externo: `e359e2dc-ff28-4b4c-b340-7532a60d2ece`.
- Egreso: `31b3360f-9d0d-4b7b-aa8a-92db05f96ef9`.
- Pago evento: `c53a6e15-adc0-433b-a688-1a5a8c0c7193`.

SELECT final: **0 eventos, contratos, pagos y egresos RELEASE activos**;
**8 eventos y 3 contratos activos**, igual al inicio; **0 diferencias de saldo SQL**.
La huella de todos los contratos anteriores es idéntica a la inicial, incluso
después del recorrido y la limpieza. Historiales/adicionales quedan ligados a los
padres eliminados y se conserva auditoría. No queda limpieza operativa pendiente.
La consulta de auditoría confirmó INSERT/UPDATE/SOFT_DELETE del evento y los
contratos, e INSERT/SOFT_DELETE del egreso; todas esas entradas tienen actor Auth.
