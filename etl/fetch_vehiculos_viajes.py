"""
Uso de vehiculos y viajes al exterior por diputacion (ADR-032).

Fuente: el portal vigente de datos abiertos de la Asamblea,
`/pa/datosabiertos/Documentos compartidos/` (ADR-020), un Excel por mes:

    UsoVehiculos/2026-10-2018-05-Uso_Transporte.xlsx
        FECHA | BOLETA | DEPARTAMENTO | DESTINO | KMS. INICIAL | KMS. FINAL |
        TOTAL KMS. | PRECIO | K/L | LTRS. COMBUSTIBLE | TOTAL | PLACA |
        CHOFER (u OPERADOR MOVIL) | TIPO SERVICIO | H.INICIO | H.FINAL | DURACION
    GastosViajes/2026-10-Viajes_Institucionales.xlsx
        ID | Nombre | Condicion | Destino | Fecha de ida | Fecha de regreso |
        Motivo del Viaje | Viaticos Costeados por | Monto de Viaticos |
        Pasajes aereos Costeado por | Monto de Pasajes aereos |
        Monto de Pasajes Terrestres | Cuota Inscripcion

Solo el periodo 2026-2030. Se publica lo que dice cada fila, sin sumar ni
promediar (como el resto del gasto, ADR-023).

Que se valida, reportando y sin corregir:

- Vehiculos: la diputacion viene dentro de DEPARTAMENTO, escrita de muchas
  formas («DIP. X», «DIPUTADA X PPS»). Se quita el prefijo y la sigla de
  partido y el resto se resuelve exacto o por la tabla curada. Nunca por
  parecido. Lo que no se resuelve se reporta y no se asigna a nadie.
- Vehiculos: que TOTAL = litros x precio. Si no cuadra, la fila se publica
  con su TOTAL tal cual y marcada.
- Viajes: los montos vienen en formatos mezclados («¢382,795.94»,
  «¢ 811.037,00», 0, «No aplica»). Solo se leen los dos formatos de miles
  conocidos; lo demas queda sin numero y se reporta. Se conserva el texto
  original.
- Viajes: un mismo ID puede aparecer en dos meses. Se publica una vez, con
  los meses en que aparece, y se avisa si cambio entre archivos.
- Viajes: las notas del archivo se vinculan a un viaje solo si nombran a esa
  persona (nombre de pila y primer apellido del padron, exactos).
- Los choferes no se publican: no son parte del gasto de la diputacion.

Uso:
    python etl/fetch_vehiculos_viajes.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fetch_gasto import (  # noqa: E402
    EQUIVALENCIAS, INICIO_PERIODO, MESES, PORTAL, PROCESADO, Nombres,
    archivos_del_periodo, bajar, encabezado, filas_de, numero,
)
from lib.acta import plano  # noqa: E402
from lib.sharepoint import ahora_iso  # noqa: E402

CONJUNTOS = {"vehiculos": "UsoVehiculos", "viajes": "GastosViajes"}
PREFIJO_DIP = re.compile(r"^\s*dip(?:utad[oa]s?)?\s*[.,]?\s*", re.I)
SIGLA_FINAL = re.compile(r"[\s\-]+(pps|ppso|pln|pfa|pusc|cac)\s*$", re.I)
PLURAL = re.compile(r"\bdiputad(os|as|ones)\b|\bvarias\b", re.I)
FECHA_TEXTO = re.compile(r"(\d{1,2})\s+de\s+([a-z]+)\s+del?\s+(\d{4})")


def col(cols: dict[str, int], nombre: str) -> int | None:
    """Columna por nombre exacto (sin tildes ni mayusculas). No por prefijo:
    «total» atraparia «total kms.»."""
    return cols.get(nombre)


def iso(v) -> str | None:
    return v.date().isoformat() if isinstance(v, datetime) else None


def texto(v) -> str | None:
    s = " ".join(str(v).split()) if v is not None else ""
    return s or None


# ---------------------------------------------------------------- vehiculos

def nombre_en_departamento(dep: str) -> str:
    return SIGLA_FINAL.sub("", PREFIJO_DIP.sub("", dep)).strip()


def leer_vehiculos(ruta: Path, mes: str, nombres: Nombres, avisos: list[str],
                   sin: Counter) -> tuple[dict, dict]:
    filas = filas_de(ruta)
    i, cols = encabezado(filas, "departamento")
    c = {k: col(cols, k) for k in ("fecha", "boleta", "departamento", "destino", "total kms.",
                                   "precio", "ltrs. combustible", "total", "tipo servicio")}
    faltan = [k for k, v in c.items() if v is None]
    if faltan:
        raise ValueError(f"Vehiculos {mes}: faltan columnas {faltan}")
    por_dip: dict[str, list] = {}
    no_atribuibles, n, de_dip, no_cuadra = [], 0, 0, 0
    suma, total_declarado = 0.0, None
    for f in filas[i + 1:]:
        crudo = f[c["fecha"]]
        if isinstance(crudo, str) and plano(crudo) == "total":
            total_declarado = numero(f[c["total"]])
            continue
        fecha = iso(crudo)
        if fecha is None and isinstance(crudo, str):
            # «29/8//2026»: dia/mes/año escrito a mano, con barras de mas.
            m = re.fullmatch(r"\s*(\d{1,2})/+(\d{1,2})/+(\d{4})\s*", crudo)
            if m:
                fecha = date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat()
        if fecha is None:
            if any(v is not None for v in f):
                avisos.append(f"Vehiculos {mes}: fila sin fecha legible ({crudo!r}), no se publica.")
            continue
        n += 1
        suma += numero(f[c["total"]]) or 0
        dep = texto(f[c["departamento"]]) or ""
        if not re.search(r"\bdip", dep, re.I):
            continue  # un departamento de la Asamblea, no una diputacion
        de_dip += 1
        if fecha[:7] != mes:
            avisos.append(f"Vehiculos {mes}: la boleta {f[c['boleta']]} es del {fecha}.")
        litros, precio, total = numero(f[c["ltrs. combustible"]]), numero(f[c["precio"]]), numero(f[c["total"]])
        cuadra = None if None in (litros, precio, total) else abs(litros * precio - total) <= 1
        if cuadra is False:
            no_cuadra += 1
        viaje = {
            "mes": mes,
            "fecha": fecha,
            "boleta": f[c["boleta"]],
            "destino": texto(f[c["destino"]]),
            "km": numero(f[c["total kms."]]),
            "costo": total,
            "costo_cuadra": cuadra,
            # La fecha va tal cual; si no es del mes del archivo, se marca.
            "fecha_fuera_del_mes": fecha[:7] != mes,
            "tipo_servicio": texto(f[c["tipo servicio"]]),
            "departamento_en_fuente": dep,
        }
        slug = nombres.resolver(nombre_en_departamento(dep))
        if slug:
            por_dip.setdefault(slug, []).append(viaje)
        elif PLURAL.search(dep):
            no_atribuibles.append({k: viaje[k] for k in ("fecha", "destino", "km", "costo", "departamento_en_fuente")})
        else:
            sin[dep] += 1
    if no_cuadra:
        avisos.append(f"Vehiculos {mes}: en {no_cuadra} viaje(s) de diputaciones el TOTAL publicado "
                      f"no es litros x precio. Se publica el TOTAL tal cual, marcado.")
    if total_declarado is not None and abs(total_declarado - suma) > 1:
        avisos.append(f"Vehiculos {mes}: la suma de las filas ({suma:,.2f}) no da la fila TOTAL "
                      f"({total_declarado:,.2f}).")
    resumen = {"filas": n, "filas_de_diputaciones": de_dip, "costo_no_cuadra": no_cuadra,
               "no_atribuibles": no_atribuibles}
    return resumen, por_dip


# ------------------------------------------------------------------- viajes

def monto(v) -> dict:
    """{"monto": numero o None, "texto": lo publicado si no era un numero}."""
    if v is None or (isinstance(v, str) and not v.strip()):
        return {"monto": None, "texto": None}
    if isinstance(v, (int, float)):
        return {"monto": float(v), "texto": None}
    s = " ".join(str(v).split())
    t = s.replace("¢", "").replace("₡", "").replace(" ", "")
    if re.fullmatch(r"\d{1,3}(,\d{3})*(\.\d{1,2})?", t):
        return {"monto": float(t.replace(",", "")), "texto": s}
    if re.fullmatch(r"\d{1,3}(\.\d{3})*(,\d{1,2})?", t):
        return {"monto": float(t.replace(".", "").replace(",", ".")), "texto": s}
    if re.fullmatch(r"\d+", t):
        return {"monto": float(t), "texto": s}
    return {"monto": None, "texto": s}  # «No aplica» u otro texto: se muestra tal cual


def fecha_viaje(v) -> tuple[str | None, str | None]:
    """(fecha ISO, como venia). Las de numero son fechas de Excel sin formato."""
    if isinstance(v, datetime):
        return v.date().isoformat(), None
    if isinstance(v, (int, float)) and 40000 < v < 60000:
        return (date(1899, 12, 30) + timedelta(days=int(v))).isoformat(), "numero de serie de Excel"
    if isinstance(v, str):
        m = FECHA_TEXTO.search(plano(v))
        if m and MESES.get(m.group(2)):
            return date(int(m.group(3)), MESES[m.group(2)], int(m.group(1))).isoformat(), "texto"
    return None, None


def leer_viajes(ruta: Path, mes: str, nombres: Nombres, padron: list[dict], avisos: list[str],
                sin: Counter) -> tuple[dict, list[dict]]:
    filas = filas_de(ruta)
    i, cols = encabezado(filas, "motivo del viaje")
    c = {k: col(cols, k) for k in (
        "id", "nombre", "condicion", "destino", "fecha de ida", "fecha de regreso", "motivo del viaje",
        "viaticos costeados por", "monto de viaticos (en colones)", "pasajes aereos costeado por",
        "monto de pasajes aereos (en colones)", "monto de pasajes terrestres (en colones)",
        "cuota inscripcion (en colones)")}
    faltan = [k for k, v in c.items() if v is None]
    if faltan:
        raise ValueError(f"Viajes {mes}: faltan columnas {faltan}")
    viajes, notas, funcionarios = [], [], 0
    for f in filas[i + 1:]:
        primera = f[c["id"]]
        if isinstance(primera, str) and plano(primera).startswith("nota"):
            notas.append(texto(primera))
            continue
        nombre = texto(f[c["nombre"]])
        if not nombre:
            continue
        condicion = texto(f[c["condicion"]]) or ""
        slug = nombres.resolver(nombre)
        if slug is None:
            if plano(condicion).startswith("funcionari"):
                funcionarios += 1
            else:
                sin[nombre] += 1
            continue
        if plano(condicion).startswith("funcionari"):
            avisos.append(f"Viajes {mes}: «{nombre}» dice «{condicion}» pero calza con una diputacion.")
        ida, ida_formato = fecha_viaje(f[c["fecha de ida"]])
        regreso, regreso_formato = fecha_viaje(f[c["fecha de regreso"]])
        if ida is None or regreso is None:
            avisos.append(f"Viajes {mes}: fechas ilegibles en el viaje {primera} de «{nombre}».")
        v = {
            "id": primera,
            "slug": slug,
            "meses": [mes],
            "destino": texto(f[c["destino"]]),
            "ida": ida,
            "regreso": regreso,
            "fechas_venian_como": ida_formato or regreso_formato,
            "motivo": texto(f[c["motivo del viaje"]]),
            "viaticos": {"costeados_por": texto(f[c["viaticos costeados por"]]),
                         **monto(f[c["monto de viaticos (en colones)"]])},
            "pasajes_aereos": {"costeados_por": texto(f[c["pasajes aereos costeado por"]]),
                               **monto(f[c["monto de pasajes aereos (en colones)"]])},
            "pasajes_terrestres": monto(f[c["monto de pasajes terrestres (en colones)"]]),
            "inscripcion": monto(f[c["cuota inscripcion (en colones)"]]),
            "notas": [],
        }
        for k in ("viaticos", "pasajes_aereos", "pasajes_terrestres", "inscripcion"):
            if v[k]["monto"] is None and v[k]["texto"] and plano(v[k]["texto"]) != "no aplica":
                avisos.append(f"Viajes {mes}: monto ilegible en {k} del viaje {primera}: «{v[k]['texto']}».")
        viajes.append(v)
    # Una nota se vincula a un viaje solo si nombra a esa persona.
    por_slug = {d["slug"]: plano(d["nombre"]).split() for d in padron}
    for nota in notas:
        vinculada = False
        for v in viajes:
            pal = por_slug.get(v["slug"], [])
            if len(pal) >= 3 and f"{pal[0]} {pal[-2]}" in plano(nota):
                v["notas"].append({"mes": mes, "texto": nota})
                vinculada = True
        if not vinculada:
            avisos.append(f"Viajes {mes}: nota sin vincular a un viaje: «{nota[:120]}…»")
    resumen = {"filas_de_diputaciones": len(viajes), "filas_de_funcionarios": funcionarios, "notas": notas}
    return resumen, viajes


# --------------------------------------------------------------------- main

def meses_faltantes(presentes: list[str]) -> list[str]:
    """Meses del periodo sin archivo publicado, hasta el ultimo que si hay."""
    if not presentes:
        return []
    faltan, a, m = [], int(INICIO_PERIODO[:4]), int(INICIO_PERIODO[5:])
    while f"{a}-{m:02d}" < max(presentes):
        if f"{a}-{m:02d}" not in presentes:
            faltan.append(f"{a}-{m:02d}")
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return faltan


def main() -> int:
    padron = json.loads((PROCESADO / "diputados.json").read_text(encoding="utf-8"))["diputados"]
    equivalencias = json.loads(EQUIVALENCIAS.read_text(encoding="utf-8"))["equivalencias"]
    nombres = Nombres(padron, equivalencias)
    avisos: list[str] = []
    sin_resolver: Counter = Counter()
    salida: dict = {"_fuente": PORTAL, "_extraido": ahora_iso(), "periodo_desde": INICIO_PERIODO,
                    "vehiculos": {}, "viajes": {}, "por_diputacion": {}}
    por_dip = salida["por_diputacion"]
    viajes_por_id: dict = {}

    for clave, carpeta in CONJUNTOS.items():
        for item in archivos_del_periodo(carpeta):
            ruta, url = bajar(item, carpeta)
            mes = item["mes"]
            base = {"_fuente": url, "publicado": (item.get("Modified") or "")[:10]}
            if clave == "vehiculos":
                resumen, propios = leer_vehiculos(ruta, mes, nombres, avisos, sin_resolver)
                for slug, lista in propios.items():
                    por_dip.setdefault(slug, {"vehiculos": [], "viajes": []})["vehiculos"].extend(lista)
                print(f"   vehiculos  {mes}  {resumen['filas']} viajes, {resumen['filas_de_diputaciones']} de diputaciones")
            else:
                resumen, lista = leer_viajes(ruta, mes, nombres, padron, avisos, sin_resolver)
                for v in lista:
                    previo = viajes_por_id.get(v["id"])
                    if previo is None:
                        viajes_por_id[v["id"]] = v
                        continue
                    distintos = [k for k in v if k not in ("meses", "notas") and v[k] != previo[k]]
                    if distintos:
                        avisos.append(f"Viajes: el viaje {v['id']} cambio entre {previo['meses'][-1]} y {mes} "
                                      f"en {distintos}. Se publica la version de {mes}.")
                    v["meses"] = previo["meses"] + [mes]
                    v["notas"] = previo["notas"] + v["notas"]
                    viajes_por_id[v["id"]] = v
                print(f"   viajes     {mes}  {resumen['filas_de_diputaciones']} de diputaciones, "
                      f"{resumen['filas_de_funcionarios']} de funcionarios")
            salida[clave][mes] = {**base, **resumen}

    for v in viajes_por_id.values():
        por_dip.setdefault(v["slug"], {"vehiculos": [], "viajes": []})["viajes"].append(
            {k: x for k, x in v.items() if k != "slug"})
    for p in por_dip.values():
        p["vehiculos"].sort(key=lambda x: (x["fecha"], str(x["boleta"])), reverse=True)
        p["viajes"].sort(key=lambda x: x["ida"] or "", reverse=True)

    salida["meses_sin_archivo"] = {k: meses_faltantes(list(salida[k])) for k in CONJUNTOS}
    for k, faltan in salida["meses_sin_archivo"].items():
        if faltan:
            avisos.append(f"{CONJUNTOS[k]}: la Asamblea no publico archivo de {', '.join(faltan)}.")
    salida["avisos"] = avisos
    salida["variantes_sin_resolver"] = dict(sin_resolver)
    PROCESADO.mkdir(parents=True, exist_ok=True)
    (PROCESADO / "vehiculos_viajes.json").write_text(
        json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")

    if avisos or sin_resolver:
        print("\n  ADVERTENCIAS -- se reportan, no se corrigen:")
        for a in avisos:
            print(f"      - {a}")
        # Las que una persona ya decidio NO asignar no son pendientes.
        tabla = json.loads(EQUIVALENCIAS.read_text(encoding="utf-8"))
        rechazadas = {plano(r["variante"]) for r in tabla.get("rechazadas", [])}
        for n, k in sin_resolver.most_common():
            if plano(nombre_en_departamento(n)) in rechazadas:
                print(f"      - «{n}» ({k} veces): rechazada por decision humana, no se asigna "
                      f"(ver «rechazadas» en la tabla curada).")
                continue
            print(f"      - nombre sin resolver «{n}» ({k} veces); candidatos: "
                  f"{nombres.base.candidatos(nombre_en_departamento(n))}")
    else:
        print("\n  Sin advertencias.")
    print(f"\n  {len(por_dip)} diputaciones con viajes en vehiculo o al exterior")
    print("  -> data/processed/vehiculos_viajes.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
