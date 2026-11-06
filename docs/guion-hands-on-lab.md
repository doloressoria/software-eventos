# Guion de hands-on lab

Duración sugerida: 25–35 minutos por participante. Usar un cliente nuevo con nombre
`LAB + fecha + participante`; no editar registros reales. Antes de comenzar,
consultar la [publicación verificada](publicacion-lab-20261106.md) y preparar
sesiones admin y vendedor con salones separados. Las correcciones de frontend,
saldo SQL, baja de egresos y transacciones de catering ya están publicadas.
La fase vendedor **no fue validada en Chrome** durante esta entrega por falta de
otra cuenta. No comenzar un lab completo con esa cobertura pendiente.

| Paso | Rol | Tarea | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Admin | Crear un salón LAB con capacidad 20; editarla a 21 y recargar | El listado conserva 21; capacidad negativa se rechaza sin perder nombre |
| 2 | Admin | Preparar asignaciones de la cuenta de prueba del vendedor | Sólo los salones previstos quedan asignados; no tocar cuentas reales |
| 3 | Vendedor | Entrar en su sesión y abrir Eventos; intentar URL de un evento del salón ajeno | Ve sus registros; el ajeno no se muestra ni permite cambios/exportación |
| 4 | Vendedor | Crear cliente/evento LAB con fecha explícita y 10 adultos | Aparece con la misma fecha en listado, detalle y calendario |
| 5 | Vendedor | Agregar contactos A y B; marcar B principal, guardar y recargar | Ambos persisten y hay un único principal; editar A y quitar B se conserva |
| 6 | Vendedor | Agregar servicio con base 1000, adicional 100, base IVA 500 | Total 1205; confirmar que pantalla y saldo persistido coinciden |
| 7 | Vendedor | Registrar USD 1 a cotización manual 100; editar a USD 2 | Equivalente 200 ARS, saldo del servicio 1005; banco/notas persisten |
| 8 | Vendedor | Registrar garantía ARS 50 y gasto ARS 30 | Garantía separada; cobrado 200, egresos 30, neto 170 |
| 9 | Admin o rol con catering | Crear catering vinculado; precio 100, PAX 10, comisión 50 e IVA 21% en ambos; agregar extra 20 | Total 1294,70; contactos vinculados compartidos |
| 10 | Rol con catering | Recotizar a 110 y 11 adultos; guardar Editar sin cambios | Mantiene 11 PAX y total 1548,80; no vuelve a 10 |
| 11 | Rol con catering | Crear externo LAB: lugar ficticio, 2 PAX, precio 10, IVA 21%; cobrar USD 0,10 a 100 | Total 24,20; cobrado 10; deuda 14,20 sin exigir evento de salón |
| 12 | Admin | Filtrar Reportes por salón LAB; comparar detalle/flujo y descargar Excel del evento | Importes concilian; archivo contiene datos guardados, no borradores |
| 13 | Admin | Abrir Auditoría y localizar altas/ediciones por fecha/registro | Actor, acción y cambios coinciden con las operaciones realizadas |
| 14 | Admin | Dar de baja movimientos y entidades LAB, desactivar salón | No integran reportes operativos; se conserva historial de auditoría |

Durante cada paso, probar Tab/Shift+Tab y abrir fechas por su etiqueta. Repetir el
detalle y la carga de un pago a ancho de teléfono. Registrar paso, URL, rol,
resultado y captura ante cualquier falla; detener ese caso si el saldo difiere o
el guardado queda ambiguo. Recargar para comprobar persistencia antes de repetir
un envío.

No incluir restauración de eventos, edición de egresos ni la pantalla global
`/pagos`: esas funciones no están implementadas. Los cambios pendientes se
descartan al salir salvo la advertencia específica de exportación; guardar o
cancelar conscientemente. No simular fallas de red sobre datos reales ni borrar
físicamente historiales como parte del ejercicio.
