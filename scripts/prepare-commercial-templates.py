"""Build private, value-free templates from two local references; never copy personal content.

Usage: python3 scripts/prepare-commercial-templates.py EVENT.xlsx CATERING.xlsx
Only geometry, styles, and explicitly approved static labels survive.
"""
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
ET.register_namespace("", NS)
ET.register_namespace("r", REL)
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources/commercial-excel"

EVENT_LABELS = {
    "A1": "CLIENTE", "A2": "FECHA", "C2": "PAX", "E2": "SALÓN",
    "A3": "CATERING", "A4": "AMBIENTACIÓN", "E4": "ORGANIZADOR",
    "E5": "COMISIÓN", "A6": "VENDEDOR", "A9": "SALÓN",
    "A10": "ACTUALIZACIÓN", "A11": "DJ", "A12": "ACTUALIZACIÓN",
    "A13": "ADICIONALES DJ", "A15": "AMBIENTACIÓN", "A16": "ACTUALIZACIÓN",
    "A17": "ADICIONALES AMBIENTACIÓN", "A19": "SADAIC / AADICAPIF",
    "A22": "ADICIONALES FOTO Y VIDEO", "A23": "TOTAL SERVICIOS SIN IVA",
    "A24": "GARANTÍA", "A27": "TOTAL SIN IVA", "A39": "TOTAL SERVICIOS",
    "A41": "PAGOS SALÓN", "A50": "PAGOS DJ", "A58": "PAGOS AMBIENTACIÓN",
    "A66": "PAGOS ESTACIONAMIENTO", "A74": "PAGOS FOTO Y VIDEO",
    "A82": "PAGOS SILLAS TIFFANY", "A90": "TOTAL ABONADO",
    "A91": "SALDO SERVICIOS", "A93": "PAGOS EN GARANTÍA",
    "A99": "DATOS DE FACTURACIÓN", "A105": "DATOS DE FACTURA", "A115": "CONTACTOS",
}
for r in [42, 51, 59, 67, 75, 83, 94]:
    for col, label in zip("ABCDEFG", ["MEDIO Y MONEDA", "FECHA", "BANCO", "N° CHEQUE", "IMPORTE ORIGINAL", "COTIZACIÓN", "EQUIVALENTE ARS"]):
        EVENT_LABELS[f"{col}{r}"] = label

CATERING_LABELS = {
    "A3": "Cliente", "A4": "Fecha", "C4": "Adultos", "D4": "Jóvenes", "E4": "Menores", "F4": "Bebés",
    "A5": "PAX comida", "A6": "PAX después del postre", "A7": "PAX final",
    "A8": "Salón / lugar", "A9": "Organizador / agencia", "C9": "Comisiona",
    "A10": "Ejecutiva", "A11": "Tipo de servicio",
    "A12": "Precio vigente por persona", "A13": "Precio cierre alimentos sin IVA",
    "A14": "Precio cierre bebidas sin IVA", "A18": "Concepto", "B18": "Descripción", "C18": "Importe",
    "A19": "Precio general sin desglose", "A20": "Bebidas alcohólicas",
    "A21": "Adicional alimentos", "A25": "Adicional bebidas", "A29": "Adicional otros",
    "B32": "Subtotal según datos actuales", "A34": "CATERING — DETALLE COMERCIAL",
    "A72": "SALDO PENDIENTE — DETALLE", "A75": "COMISIÓN ORGANIZADOR",
    "A76": "IVA COMISIÓN", "A77": "TOTAL COMISIÓN",
    "A80": "FACTURACIÓN", "A81": "MONTO CON FACTURA", "A82": "MONTO SIN FACTURA",
    "A86": "DATOS DE FACTURA", "A95": "CONTACTO ADMINISTRATIVO",
}
for i, col in enumerate("CDEFGHIJKLMNOPQ", 1):
    CATERING_LABELS[f"{col}17"] = f"Precio {i}"


def number(column):
    result = 0
    for char in column:
        result = result * 26 + ord(char) - 64
    return result


def build(path, kind):
    data = Path(path).read_bytes()
    inventory = {"source_sha256": hashlib.sha256(data).hexdigest(), "sheets": []}
    with zipfile.ZipFile(path) as original:
        wb = ET.fromstring(original.read("xl/workbook.xml"))
        sheets = wb.find(f"{{{NS}}}sheets")
        relationships = ET.Element("Relationships", xmlns=PKG)
        parts = {"xl/styles.xml": original.read("xl/styles.xml")}
        if "xl/theme/theme1.xml" in original.namelist():
            parts["xl/theme/theme1.xml"] = original.read("xl/theme/theme1.xml")
        for i, sheet in enumerate(sheets, 1):
            name = sheet.get("name")
            root = ET.fromstring(original.read(f"xl/worksheets/sheet{i}.xml"))
            merges = root.find(f"{{{NS}}}mergeCells")
            validations = root.find(f"{{{NS}}}dataValidations")
            inventory["sheets"].append({
                "name": name, "dimension": root.find(f"{{{NS}}}dimension").get("ref"),
                "merges": [m.get("ref") for m in merges] if merges is not None else [],
                "formulas": len(root.findall(f".//{{{NS}}}f")),
                "validations": len(validations) if validations is not None else 0,
                "validation_ranges": sum(len(v.get("sqref", "").split()) for v in validations) if validations is not None else 0,
                "print": root.find(f"{{{NS}}}pageSetup").attrib if root.find(f"{{{NS}}}pageSetup") is not None else {},
            })
            # Build a fresh sheet using only approved structural elements.
            clean = ET.Element(f"{{{NS}}}worksheet")
            cols = 7 if kind == "evento" else (17 if i == 1 else {2: 9, 3: 6, 4: 2}[i])
            max_row = 124 if kind == "evento" else {1: 98, 2: 29, 3: 43, 4: 14}[i]
            for tag in ["sheetFormatPr", "cols", "sheetData", "mergeCells", "pageMargins", "pageSetup"]:
                element = root.find(f"{{{NS}}}{tag}")
                if element is None:
                    continue
                element = copy.deepcopy(element)
                if tag == "cols":
                    for col in list(element):
                        if int(col.get("min")) > cols:
                            element.remove(col)
                        else:
                            col.set("max", str(min(cols, int(col.get("max")))))
                            col.attrib.pop("hidden", None)
                if tag == "sheetData":
                    for row in list(element):
                        row.attrib.pop("hidden", None)
                        if int(row.get("r")) > max_row:
                            element.remove(row)
                            continue
                        for cell in list(row):
                            if number(re.match(r"[A-Z]+", cell.get("r"))[0]) > cols:
                                row.remove(cell)
                                continue
                            for child in list(cell):
                                cell.remove(child)
                            cell.attrib = {key: value for key, value in cell.attrib.items() if key in ("r", "s")}
                if tag == "pageSetup":
                    element.attrib = {k: v for k, v in element.attrib.items() if k in ("paperSize", "orientation")}
                clean.append(element)
            labels = EVENT_LABELS if kind == "evento" and i == 1 else CATERING_LABELS if i == 1 else {}
            if kind == "catering" and i in (2, 3):
                labels = {"A1": "ACTUALIZACIÓN SEGÚN INDEC" if i == 2 else "ACTUALIZACIÓN SEGÚN PORCENTAJE FIJO",
                          "A2": "VALOR INICIAL", "B2": "FECHA INICIO", "A3": "Sin datos aplicables guardados para este catering."}
            if kind == "catering" and i == 4:
                labels = {"A2": "TOTAL ALIMENTOS", "A4": "TOTAL BEBIDAS", "A6": "TOTAL OTROS", "A8": "DESGLOSE DISPONIBLE", "A10": "IVA", "A14": "TOTAL DEL DETALLE"}
            sd = clean.find(f"{{{NS}}}sheetData")
            for address, text in labels.items():
                row_id = re.search(r"\d+", address)[0]
                row = next((r for r in sd if r.get("r") == row_id), None)
                if row is None:
                    row = ET.SubElement(sd, f"{{{NS}}}row", r=row_id)
                cell = next((c for c in row if c.get("r") == address), None)
                if cell is None:
                    cell = ET.SubElement(row, f"{{{NS}}}c", r=address)
                cell.set("t", "inlineStr")
                ET.SubElement(ET.SubElement(cell, f"{{{NS}}}is"), f"{{{NS}}}t").text = text
            parts[f"xl/worksheets/sheet{i}.xml"] = ET.tostring(clean, encoding="utf-8", xml_declaration=True)
            sheet.attrib = {"name": name, "sheetId": str(i), f"{{{REL}}}id": f"rId{i}"}
            ET.SubElement(relationships, "Relationship", Id=f"rId{i}", Type=REL + "/worksheet", Target=f"worksheets/sheet{i}.xml")
        for index, (target, type_) in enumerate([("styles.xml", "styles"), ("theme/theme1.xml", "theme")], len(sheets) + 1):
            ET.SubElement(relationships, "Relationship", Id=f"rId{index}", Type=REL + "/" + type_, Target=target)
        clean_wb = ET.Element(f"{{{NS}}}workbook")
        clean_wb.append(sheets)
        parts["xl/workbook.xml"] = ET.tostring(clean_wb, encoding="utf-8", xml_declaration=True)
        parts["xl/_rels/workbook.xml.rels"] = ET.tostring(relationships, encoding="utf-8", xml_declaration=True)
        parts["_rels/.rels"] = (f'<Relationships xmlns="{PKG}"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>').encode()
        content = ET.Element("Types", xmlns="http://schemas.openxmlformats.org/package/2006/content-types")
        ET.SubElement(content, "Default", Extension="rels", ContentType="application/vnd.openxmlformats-package.relationships+xml")
        ET.SubElement(content, "Default", Extension="xml", ContentType="application/xml")
        for part in parts:
            if part.endswith(".rels"):
                continue
            suffix = "worksheet" if "/worksheets/" in part else "styles" if "styles" in part else "sheet.main"
            ct = "application/vnd.openxmlformats-officedocument.spreadsheetml." + suffix + "+xml"
            if "/theme/" in part:
                ct = "application/vnd.openxmlformats-officedocument.theme+xml"
            ET.SubElement(content, "Override", PartName="/" + part, ContentType=ct)
        parts["[Content_Types].xml"] = ET.tostring(content, encoding="utf-8", xml_declaration=True)
        OUT.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(OUT / f"{kind}.xlsx", "w", zipfile.ZIP_DEFLATED) as destination:
            for name, blob in parts.items():
                destination.writestr(name, blob)
        return inventory


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    inventory = {kind: build(path, kind) for kind, path in zip(["evento", "catering"], sys.argv[1:])}
    (OUT / "reference-inventory.json").write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + "\n")
    print("Created two private templates; all original cell values and formulas removed.")
