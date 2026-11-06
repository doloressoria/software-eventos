set local role authenticated;
update catering_contratos set pax_adultos=12, comision_organizador_monto=200,
  iva_comision=.21, iva_porcentaje=.21 where id=pg_temp.id(60);
insert into catering_precio_historial(catering_contrato_id,precio_unitario,pax_adultos,motivo)
values(pg_temp.id(60),100,12,'Inicial');
insert into catering_items(catering_contrato_id,categoria,descripcion,precio_unitario,pax)
values(pg_temp.id(60),'adicional_otros','Prueba',100,1);
select pg_temp.check_true((select total_con_iva=121 from catering_contratos where id=pg_temp.id(60)),
  'reproduce trigger previo: adicional borra precio por PAX y comision');
reset role;
