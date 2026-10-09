"""
Gasto por diputacion: remuneracion y combustible, mes a mes (ADR-023).

Fuente: el portal vigente de datos abiertos de la Asamblea,
`/pa/datosabiertos/Documentos compartidos/` (ADR-020), un Excel por mes:

    SalarioDiputados/2026-09-Salario Diputados.xlsx
        Nombre Completo | Clase de Puesto | Fraccion | Mes | Año | Dieta |
        Gastos de Representacion | Remuneracion Bruta
    ConsumoCombustible/2026-09-combustible.xlsx
        Fraccion | Nombre Diputado(a) | Consumo <mes> <año>   (+ fila TOTAL)

Solo el periodo 2026-2030: los meses anteriores son de otra Asamblea.

Que se valida, reportando y sin corregir:

- Que el mes del nombre del archivo coincida con el del contenido.
- Que cada nombre se resuelva contra el padron. Los archivos escriben
  «Apellidos Nombre»: se compara exacto con las mismas palabras rotadas
  («Acosta Jaen Nogui» = «Nogui Acosta Jaen»), o por la tabla curada. Nunca
  por parecido.
- Salarios: que dieta + gastos de representacion = remuneracion bruta.
- Combustible: que la suma de las filas = la fila TOTAL. Una celda vacia es
  «sin dato», nunca cero. El asterisco marca a quien renuncio a la ayuda
  tecnica de combustible (lo dice la nota del propio archivo).

Las columnas se leen por su encabezado, no por posicion: cambian de nombre de
un año a otro («Salario Bruto» / «Remuneracion Bruta»).

Uso:
    python etl/fetch_gasto.py
"""

from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.acta import Resolutor, plano  # noqa: E402
from lib.sharepoint import _CTX, ahora_iso, obtener_lista  # noqa: E402

import openpyxl  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CRUDO = RAIZ / "data" / "raw" / "gasto"
PROCESADO = RAIZ / "data" / "processed"
EQUIVALENCIAS = RAIZ / "data" / "curated" / "equivalencias_nombres.json"

BASE = "https://www.asamblea.go.cr"
PORTAL = BASE + "/pa/datosabiertos/SitePages/Inicio.aspx"
UA = {"User-Agent": "asamblea-abierta/0.1 (proyecto civico; datos abiertos CC-BY-4.0)"}
INICIO_PERIODO = "2026-05"
CONJUNTOS = {"salarios": "SalarioDiputados", "combustible": "ConsumoCombustible"}
ARCHIVO_MES = re.compile(r"^(\d{4})-(\d{2})-")
MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "setiembre": 9, "septiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}


class Nombres:
    """Resolutor del padron que entiende «Apellidos Nombre» rotando palabras."""

    def __init__(self, padron: list[dict], equivalencias: list[dict]) -> None:
        self.base = Resolutor(padron, equivalencias)
        self.rotados: dict[str, str] = {}
        # Las mismas palabras en otro orden: el padron y las variantes ya
        # curadas, escritas «Apellidos Nombre». Sigue siendo comparacion exacta.
        fuentes = [(d["nombre"], d["slug"]) for d in padron] + [
            (e["variante"], e["slug"]) for e in equivalencias]
        for nombre, slug in fuentes:
            palabras = plano(nombre).split()
            for k in range(1, len(palabras)):
                self.rotados[" ".join(palabras[k:] + palabras[:k])] = slug

    def resolver(self, nombre: str) -> str | None:
        limpio = nombre.replace("*", "").strip()
        return self.base.resolver(limpio) or self.rotados.get(plano(limpio))


def archivos_del_periodo(carpeta: str) -> list[dict]:
    items, _ = obtener_lista("pa/datosabiertos", "Documentos",
                             select="FileLeafRef,FileDirRef,Modified,FSObjType", top=5000)
    salida = []
    for i in items:
        if str(i.get("FSObjType")) != "0" or not (i.get("FileDirRef") or "").endswith("/" + carpeta):
            continue
        m = ARCHIVO_MES.match(i["FileLeafRef"])
        if m and f"{m.group(1)}-{m.group(2)}" >= INICIO_PERIODO:
            salida.append({**i, "mes": f"{m.group(1)}-{m.group(2)}"})
    return sorted(salida, key=lambda i: i["mes"])


def bajar(item: dict, carpeta: str) -> tuple[Path, str]:
    ruta = item["FileDirRef"] + "/" + item["FileLeafRef"]
    url = BASE + urllib.parse.quote(ruta)
    destino = CRUDO / carpeta / item["FileLeafRef"]
    destino.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), context=_CTX, timeout=120) as r:
        destino.write_bytes(r.read())
    return destino, url


def filas_de(ruta: Path) -> list[list]:
    ws = openpyxl.load_workbook(ruta, read_only=True, data_only=True).worksheets[0]
    return [list(f) for f in ws.iter_rows(values_only=True) if any(v is not None for v in f)]


def encabezado(filas: list[list], clave: str) -> tuple[int, dict[str, int]]:
    """Fila de encabezado (la que contiene `clave`) y posicion de cada columna."""
    for i, f in enumerate(filas):
        textos = [plano(str(v)) if v is not None else "" for v in f]
        if any(clave in t for t in textos):
            return i, {t: j for j, t in enumerate(textos) if t}
    raise ValueError(f"no se encontro el encabezado '{clave}'")


def columna(cols: dict[str, int], *opciones: str) -> int | None:
    for o in opciones:
        for nombre, j in cols.items():
            if nombre.startswith(o):
                return j
    return None


def numero(v) -> float | None:
    if isinstance(v, (int, float)):
        return float(v)
    return None  # un texto o una celda vacia no se adivina


def leer_salarios(ruta: Path, mes: str, nombres: Nombres, avisos: list[str], sin: Counter) -> dict:
    filas = filas_de(ruta)
    i, cols = encabezado(filas, "nombre completo")
    c_nombre = columna(cols, "nombre completo")
    c_mes, c_anio = columna(cols, "mes"), columna(cols, "ano")
    c_dieta = columna(cols, "dieta")
    c_rep = columna(cols, "gastos de representacion")
    c_bruto = columna(cols, "remuneracion bruta", "salario bruto")
    salida, notas = {}, []
    for f in filas[i + 1:]:
        nombre = f[c_nombre]
        if not isinstance(nombre, str) or not nombre.strip():
            continue
        if plano(nombre).startswith("nota"):
            notas.append(nombre.strip())
            continue
        if c_mes is not None and c_anio is not None and f"{f[c_anio]}-{int(f[c_mes]):02d}" != mes:
            avisos.append(f"Salarios {mes}: la fila de «{nombre}» dice {f[c_anio]}-{f[c_mes]}.")
        slug = nombres.resolver(nombre)
        if slug is None:
            sin[nombre.strip()] += 1
            continue
        dieta, rep, bruto = numero(f[c_dieta]), numero(f[c_rep]), numero(f[c_bruto])
        if None not in (dieta, rep, bruto) and abs(dieta + rep - bruto) > 0.05:
            avisos.append(f"Salarios {mes}: en «{nombre}» dieta + representacion ≠ bruta.")
        salida[slug] = {"dieta": dieta, "representacion": rep, "bruta": bruto}
    if len(salida) != 57:
        avisos.append(f"Salarios {mes}: {len(salida)} diputaciones resueltas, no 57.")
    return {"por_diputacion": salida, "notas": notas}


def leer_combustible(ruta: Path, mes: str, nombres: Nombres, avisos: list[str], sin: Counter) -> dict:
    filas = filas_de(ruta)
    i, cols = encabezado(filas, "nombre diputado")
    c_nombre = columna(cols, "nombre diputado")
    c_monto = columna(cols, "consumo")
    titulo = [t for t in cols if t.startswith("consumo")][0]
    m = re.search(r"consumo\s+([a-z]+)\s+(\d{4})", titulo)
    if m and MESES.get(m.group(1)) and f"{m.group(2)}-{MESES[m.group(1)]:02d}" != mes:
        avisos.append(f"Combustible {mes}: el encabezado dice «{titulo}».")
    salida, notas, total_declarado, suma = {}, [], None, 0.0
    for f in filas[i + 1:]:
        primera = next((v for v in f if v is not None), None)
        if isinstance(primera, str) and plano(primera) == "total":
            total_declarado = numero(next((v for v in f[1:] if v is not None), None))
            continue
        if isinstance(primera, str) and plano(primera).startswith(("fuente", "nota")):
            notas.append(primera.strip())
            continue
        nombre = f[c_nombre]
        if not isinstance(nombre, str) or not nombre.strip():
            continue
        slug = nombres.resolver(nombre)
        if slug is None:
            sin[nombre.strip()] += 1
            continue
        monto = numero(f[c_monto])
        salida[slug] = {"monto": monto, "renuncio": "*" in nombre}
        suma += monto or 0
    if total_declarado is not None and abs(total_declarado - suma) > 0.5:
        avisos.append(f"Combustible {mes}: la suma de filas ({suma:,.0f}) no da el TOTAL ({total_declarado:,.0f}).")
    if len(salida) != 57:
        avisos.append(f"Combustible {mes}: {len(salida)} diputaciones resueltas, no 57.")
    return {"por_diputacion": salida, "total_declarado": total_declarado, "notas": notas}


def main() -> int:
    padron = json.loads((PROCESADO / "diputados.json").read_text(encoding="utf-8"))["diputados"]
    equivalencias = json.loads(EQUIVALENCIAS.read_text(encoding="utf-8"))["equivalencias"]
    nombres = Nombres(padron, equivalencias)
    avisos: list[str] = []
    sin_resolver: Counter = Counter()
    salida: dict = {"_fuente": PORTAL, "_extraido": ahora_iso(), "periodo_desde": INICIO_PERIODO}

    for clave, carpeta in CONJUNTOS.items():
        meses = {}
        for item in archivos_del_periodo(carpeta):
            ruta, url = bajar(item, carpeta)
            lector = leer_salarios if clave == "salarios" else leer_combustible
            meses[item["mes"]] = {"_fuente": url, "publicado": (item.get("Modified") or "")[:10],
                                  **lector(ruta, item["mes"], nombres, avisos, sin_resolver)}
            print(f"   {clave:<12} {item['mes']}  {len(meses[item['mes']]['por_diputacion'])} diputaciones")
        salida[clave] = meses

    salida["avisos"] = avisos
    salida["variantes_sin_resolver"] = dict(sin_resolver)
    PROCESADO.mkdir(parents=True, exist_ok=True)
    (PROCESADO / "gasto.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")

    if avisos or sin_resolver:
        print("\n  ADVERTENCIAS -- se reportan, no se corrigen:")
        for a in avisos:
            print(f"      - {a}")
        for n, k in sin_resolver.most_common():
            print(f"      - nombre sin resolver «{n}» ({k} veces); candidatos: {nombres.base.candidatos(n)}")
    else:
        print("\n  Sin advertencias.")
    print("\n  -> data/processed/gasto.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
