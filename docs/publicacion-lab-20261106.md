# Publicación del lab — 06/11/2026

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

El advisor conserva avisos previos sobre search_path, helpers SECURITY DEFINER
ejecutables y contraseñas filtradas; la función de totales reemplazada dejó de
ser SECURITY DEFINER pública. No se amplió esta entrega a cambios de Auth.

## Publicación y prueba HTTP

Pendiente de completar al verificar la publicación en Chrome.
No hay otra cuenta disponible para probar vendedor por HTTP; las pruebas SQL
de permisos no reemplazan una sesión real. No se simularon fallos de red sobre
registros de clientes.
