import assert from "node:assert/strict";
import { test } from "node:test";
import { lineasCobertura, totalVistaPrevia } from "./coberturas";
import { validateCateringItemForm } from "./item-validation";
import { camposPreciosCategoria, validarPreciosCategoria } from "./precios-categoria";

test("la vista previa suma centavos de distintas tarifas y el formulario rechaza fracciones de persona", () => {
  const form = new FormData();
  form.set("cantidad_adultos", "3");
  form.set("aplicado_adultos", "100.02");
  form.set("cantidad_jovenes", "2");
  form.set("aplicado_jovenes", "80.03");
  const lineas = lineasCobertura(form);
  assert.ok(lineas);
  assert.deepEqual(lineas, [
    { categoria: "adultos", cantidad: 3, precio_aplicado: 100.02 },
    { categoria: "jovenes", cantidad: 2, precio_aplicado: 80.03 },
  ]);
  assert.equal(totalVistaPrevia(lineas, { adultos: "3", jovenes: "2" }), 460.12);
  form.set("cantidad_jovenes", "2.5");
  assert.equal(lineasCobertura(form), null);
  form.set("cantidad_jovenes", "2147483648");
  assert.equal(lineasCobertura(form), null);
});

test("los precios por categoría distinguen explícitamente cero de un campo vacío", () => {
  const form = new FormData();
  form.set("precio_adultos", "40000,50");
  form.set("precio_jovenes", "0");
  form.set("precio_bebes", "1.001");
  const errors = {};
  assert.deepEqual(validarPreciosCategoria(camposPreciosCategoria(form), errors), {
    precio_adultos: 40000.5, precio_jovenes: 0, precio_menores: null, precio_bebes: null,
  });
  assert.ok("precio_bebes" in errors);
});

test("un adicional fijo conserva su modo histórico y uno por persona exige categorías válidas", () => {
  const form = new FormData();
  form.set("categoria", "adicional_otros");
  form.set("descripcion", "Extra de prueba");
  form.set("precio_unitario", "1000");
  assert.equal(validateCateringItemForm(form).payload?.categorias_pax, null);
  form.set("modo", "persona");
  assert.equal(validateCateringItemForm(form).payload, null);
  form.append("categorias_pax", "adultos");
  form.append("categorias_pax", "jovenes");
  assert.deepEqual(validateCateringItemForm(form).payload?.categorias_pax, ["adultos", "jovenes"]);
  form.append("categorias_pax", "desconocido");
  assert.equal(validateCateringItemForm(form).payload, null);
});

import { cateringRounding, recommendedUsd } from "./cobro-calculos";
import { paymentEquivalent } from "../pagos/validation";

test("USD periódico: reproduce la desigualdad y limita el ajuste al único centavo USD recomendado", () => {
  assert.equal(paymentEquivalent("83.33", "1200"), 99996);
  assert.notEqual(paymentEquivalent("83.33", "1200"), 100000);
  assert.equal(recommendedUsd("100000", "1200"), "83.33");
  assert.deepEqual(cateringRounding("100000", "0", "83,33", "1200", "USD"), {
    target: 100000, equivalent: 99996, adjustment: 4, capitalAdjustment: 4, ivaAdjustment: 0,
  });
  assert.equal(cateringRounding("100000", "0", "83.34", "1200", "USD"), null);
  assert.equal(cateringRounding("100000", "0", "83.32", "1200", "USD"), null);
  assert.equal(cateringRounding("100000", "0", "100000", "1", "ARS")?.adjustment, 0);
  assert.equal(cateringRounding("100000", "0", "99999.99", "1", "ARS"), null);
});

test("redondeo exacto con ambos signos, IVA parcial y escalas/límites SQL", () => {
  assert.equal(recommendedUsd("100004", "1200"), "83.34");
  assert.equal(cateringRounding("100004", "0", "83.34", "1200", "USD")?.adjustment, -4);
  const split = cateringRounding("60000", "40000", "83.33", "1200", "USD");
  assert.equal(split?.capitalAdjustment, 2.4);
  assert.equal(split?.ivaAdjustment, 1.6);
  assert.equal(recommendedUsd("120312.37", "1200.1234"), "100.25");
  assert.equal(recommendedUsd("1", "0.0001"), "10000.00");
  assert.equal(recommendedUsd("9999999999.99", "1"), "9999999999.99");
  for (const rate of ["0", "-1", "NaN", "1200.12345", "1000000", "1e3"]) assert.equal(recommendedUsd("100000", rate), null);
  assert.equal(recommendedUsd("0.01", "1200"), null);
  assert.equal(cateringRounding("9999999999.99", "0.01", "1", "1", "USD"), null);
  assert.equal(cateringRounding("0", "100000", "83.33", "1200", "USD")?.ivaAdjustment, 4);
});

import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as pagosValidation from "../pagos/validation";
import * as cobroCalculos from "./cobro-calculos";
import * as coberturasModule from "./coberturas";

test("acción de cobro valida USD exacto antes de RPC, persiste desglose y conserva borrador por error", async () => {
  const form = new FormData();
  for (const [k,v] of Object.entries({ ...pagosValidation.getEmptyPagoFormState().fields, monto: "83.33", moneda: "USD", tipo_cambio: "1200", forma_pago: "transferencia" })) form.set(k,v);
  form.set("version_calculo", "2"); form.set("cantidad_adultos", "1"); form.set("aplicado_adultos", "100000");
  form.set("iva_ars", "0"); form.set("solicitud", "00000000-0000-4000-8000-000000000001");
  const writes: Record<string, unknown>[] = [];
  let errorCode: string | null = null;
  const exports: { guardarCobertura?: (...args: unknown[]) => Promise<pagosValidation.PagoFormState> } = {};
  runInNewContext(ts.transpileModule(readFileSync("src/lib/catering/guardar-cobertura.ts","utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name: string) => ({
    "@/lib/catering/cobro-calculos": cobroCalculos,
    "@/lib/catering/coberturas": coberturasModule,
    "@/lib/pagos/validation": pagosValidation,
    "@/lib/supabase/errors": { logSupabaseError() {} },
    "@/lib/supabase/server": { createClient: async () => ({ rpc: async (name:string,args:Record<string,unknown>) => {
      assert.equal(name,"guardar_pago_por_personas"); writes.push(args);
      return { data: errorCode ? null : "id", error: errorCode ? {code:errorCode} : null };
    } }) },
  } as Record<string, unknown>)[name] });
  const save = async () => {
    const { state,payload } = pagosValidation.validatePagoForm(form);
    return exports.guardarCobertura!(form,state,payload,{cateringId:"00000000-0000-4000-8000-000000000002"});
  };
  assert.ok((await save()).successMessage);
  assert.equal((writes[0].p_cabecera as Record<string,unknown>).capital_ars,"100000.00");
  assert.equal((writes[0].p_cabecera as Record<string,unknown>).importe_moneda_original,83.33);
  form.set("monto","83.34");
  assert.match((await save()).formError!,/recomendado/);
  assert.equal(writes.length,1);
  form.set("monto","83.33"); errorCode="P2003";
  const failed = await save();
  assert.match(failed.formError!,/PAX disponibles/);
  assert.equal(failed.fields.monto,"83.33");
  assert.equal(failed.successMessage,null);
  errorCode=null; form.set("cantidad_adultos","0"); form.set("iva_ars","100000");
  assert.ok((await save()).successMessage);
  assert.equal((writes.at(-1)!.p_cabecera as Record<string,unknown>).capital_ars,"0.00");
  assert.equal((writes.at(-1)!.p_coberturas as unknown[]).length,0);
});
