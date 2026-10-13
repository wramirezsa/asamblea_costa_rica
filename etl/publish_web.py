"""
Prepara los datos para el sitio web y genera la geometria del hemiciclo.

IMPORTANTE — HONESTIDAD DEL DATO
La Asamblea Legislativa NO publica un dataset con el numero de curul de cada
diputacion. Por eso este script genera una distribucion POR BANCADA basada en
una norma publica y verificable (Reglamento del Ceremonial Protocolar, art. 15:
a la izquierda del Directorio la fraccion de Gobierno, a la derecha la
oposicion mayoritaria), y la marca explicitamente como derivada.

El sitio debe mostrar ese nivel de confianza al usuario. Nunca afirmamos que
una persona se sienta en una curul especifica. Ver docs/decisions.md ADR-003.

Uso:
    python etl/publish_web.py
"""

from __future__ import annotations

import json
import re
import math
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from curules import repartir  # noqa: E402
from lib.sharepoint import ahora_iso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PROCESADO = RAIZ / "data" / "processed"
ASSETS = RAIZ / "data" / "assets"
PUBLICO = RAIZ / "web" / "public"
GLOSARIO = RAIZ / "data" / "curated" / "glosario.json"

# Orden de bancadas de izquierda a derecha del Directorio.
# Fundamento: Reglamento del Ceremonial Protocolar, art. 15 (fraccion de
# Gobierno a la izquierda, oposicion mayoritaria a la derecha), y reportes de
# prensa sobre el acomodo acordado para 2026-2030.
ORDEN_BANCADAS = ["PPSO", "PLN", "PFA", "PUSC", "CAC"]

FILAS = 5  # curules dispuestas en 5 arcos concentricos
RADIO_INTERNO = 4.2
RADIO_EXTERNO = 9.4

# La geometria de la sala real y el reparto de curules viven en
# etl/curules.py, junto con la numeracion de asientos y la curaduria manual.

def geometria_hemiciclo(total: int, filas: int) -> list[dict]:
    """
    Reparte `total` curules en arcos concentricos, proporcional al radio,
    de modo que la separacion entre curules sea pareja en todas las filas.
    Devuelve las posiciones ordenadas de izquierda a derecha.
    """
    radios = [
        RADIO_INTERNO + (RADIO_EXTERNO - RADIO_INTERNO) * (i / (filas - 1))
        for i in range(filas)
    ]
    peso_total = sum(radios)
    # Reparto proporcional con correccion de redondeo para cuadrar el total.
    cupos = [max(1, round(total * r / peso_total)) for r in radios]
    while sum(cupos) > total:
        cupos[cupos.index(max(cupos))] -= 1
    while sum(cupos) < total:
        cupos[cupos.index(min(cupos))] += 1

    posiciones: list[dict] = []
    for fila, (radio, n) in enumerate(zip(radios, cupos)):
        # Margen para que las filas exteriores no toquen los extremos.
        margen = math.pi * 0.035
        for k in range(n):
            t = 0.5 if n == 1 else k / (n - 1)
            ang = math.pi - margen - t * (math.pi - 2 * margen)
            posiciones.append(
                {
                    "fila": fila,
                    "indice_fila": k,
                    "angulo": round(ang, 6),
                    "x": round(radio * math.cos(ang), 4),
                    "y": round(-radio * math.sin(ang), 4),
                }
            )
    # De izquierda (angulo mayor) a derecha (angulo menor), y de atras a adelante.
    posiciones.sort(key=lambda p: (-p["angulo"], p["fila"]))
    return posiciones


EXP_EN_TITULO = re.compile(r"\bEXP\.?\s*([\d\.]{4,7})", re.I)


def proyectos_mas_votados(sesiones: list[dict], votaciones_web: list[dict],
                          cuantos: int = 8) -> list[dict]:
    """Los expedientes con mas votaciones nominales publicadas.

    El numero sale del campo de la votacion o, si falta, del titulo que
    escribe el acta («... EXP 24290»). El nombre, del acta mas reciente EN
    QUE SE VOTO: un acta puede traer un numero de expediente equivocado (el
    23.216 aparece una vez con el nombre de otro proyecto) y tomar el nombre
    de cualquier acta lo arrastraria. Son conteos directos.
    """
    conteo: dict[str, dict] = {}
    for v in votaciones_web:
        numero = v["e"]
        if not numero and v["p"]:
            m = EXP_EN_TITULO.search(v["p"])
            numero = m.group(1) if m else None
        if not numero:
            continue
        numero = numero.replace(".", "")
        fecha = sesiones[v["s"]]["fecha"]
        c = conteo.setdefault(numero, {"votaciones": 0, "sesiones": set(), "fechas": []})
        c["votaciones"] += 1
        c["sesiones"].add(v["s"])
        c["fechas"].append(fecha)
    salida = []
    for numero, c in sorted(conteo.items(), key=lambda x: -x[1]["votaciones"])[:cuantos]:
        con_nombre = [sesiones[i] for i in c["sesiones"]
                      if numero in (sesiones[i].get("expedientes") or {})]
        nombre = (max(con_nombre, key=lambda s: s["fecha"])["expedientes"][numero]
                  if con_nombre else None)
        salida.append({
            "numero": numero,
            "nombre": nombre,
            "votaciones": c["votaciones"],
            "sesiones": len(c["sesiones"]),
            "desde": min(c["fechas"]),
            "hasta": max(c["fechas"]),
        })
    return salida


def main() -> int:
    origen = PROCESADO / "diputados.json"
    if not origen.exists():
        print("Falta data/processed/diputados.json. Corre: python etl/fetch_diputados.py")
        return 1

    d = json.loads(origen.read_text(encoding="utf-8"))
    dips = d["diputados"]

    print("[1/3] Generando geometria del hemiciclo...")
    posiciones = geometria_hemiciclo(len(dips), FILAS)

    # Agrupa por bancada en el orden normativo; dentro de cada bancada
    # conserva el orden con que la Asamblea lista a sus integrantes.
    presentes = [c for c in ORDEN_BANCADAS if any(x["partido_codigo"] == c for x in dips)]
    otros = sorted({x["partido_codigo"] for x in dips} - set(presentes))
    orden_final = presentes + otros

    ordenados: list[dict] = []
    for codigo in orden_final:
        bloque = [x for x in dips if x["partido_codigo"] == codigo]
        bloque.sort(key=lambda x: (x["orden_web"] is None, x["orden_web"]))
        ordenados.extend(bloque)

    if len(ordenados) != len(posiciones):
        print(f"  ! descuadre: {len(ordenados)} diputaciones vs {len(posiciones)} curules")
        return 1

    curules = []
    for i, (dip, pos) in enumerate(zip(ordenados, posiciones), start=1):
        curules.append(
            {
                "curul": i,
                "slug": dip["slug"],
                "partido": dip["partido_codigo"],
                **{k: pos[k] for k in ("fila", "angulo", "x", "y")},
            }
        )

    print("      reparto de curules de la sala (vista 3D)...")
    archivo_dir = PROCESADO / "directorio.json"
    if not archivo_dir.exists():
        print("  ! Falta el Directorio. Corre antes: python etl/fetch_directorio.py")
        return 1
    directorio = json.loads(archivo_dir.read_text(encoding="utf-8"))

    # El reparto vive en etl/curules.py: lo curado a mano manda, y lo que
    # falta se coloca por regla. Ver la numeracion de asientos en ese archivo.
    curules_sala, puestos_mesa, faltan, avisos_curules, vacias = repartir(
        dips, directorio, ORDEN_BANCADAS
    )
    curados = sum(1 for c in curules_sala if c["origen"] == "curado")
    print(
        f"      {len(curules_sala)} en bancadas ({curados} curadas, "
        f"{len(curules_sala) - curados} por curar) + {len(puestos_mesa)} en la mesa"
    )
    for a in avisos_curules:
        print(f"      ! {a}")

    # La lista oficial de Fracciones tiene el nombre en blanco para algunas
    # bancadas, pero cada diputacion si trae `FraccionParlamentaria`. Cruzamos
    # ambos campos oficiales en vez de escribir el nombre a mano.
    nombre_por_codigo: dict[str, str] = {}
    for dip in dips:
        cod, nom = dip["partido_codigo"], dip["fraccion"]
        if cod and nom:
            nombre_por_codigo.setdefault(cod, nom)
    for f in d["fracciones"]:
        if not f["nombre"] and f["codigo"] in nombre_por_codigo:
            f["nombre"] = nombre_por_codigo[f["codigo"]]
            f["nombre_tomado_de"] = "campo FraccionParlamentaria del padron oficial"

    print("[2/3] Escribiendo datos del sitio...")
    PUBLICO.mkdir(parents=True, exist_ok=True)
    destino = PUBLICO / "datos"
    destino.mkdir(exist_ok=True)

    manifiesto = json.loads((ASSETS / "manifiesto.json").read_text(encoding="utf-8"))
    fotos = manifiesto["fotos"]

    # La actividad legislativa es opcional: si no se ha extraido, el sitio
    # simplemente no muestra esa seccion.
    archivo_act = PROCESADO / "actividad.json"
    actividad = (
        json.loads(archivo_act.read_text(encoding="utf-8"))
        if archivo_act.exists()
        else None
    )
    if actividad is None:
        print("  ! Sin actividad legislativa. Corre: python etl/fetch_actividad.py")

    # Actas del Plenario (ADR-021), opcionales como la actividad. El resumen de
    # asistencia viaja en el payload principal porque es chico; las votaciones
    # van en un archivo aparte que el sitio pide solo cuando hace falta.
    actas_resumen = None
    archivo_actas = PROCESADO / "actas_plenario.json"
    if archivo_actas.exists():
        actas = json.loads(archivo_actas.read_text(encoding="utf-8"))
        orden = actas["orden_diputaciones"]
        sesiones = actas["sesiones"]
        asistencia = {s: {"presente": 0, "voto_sin_figurar": 0} for s in orden}
        for s in sesiones:
            for slug in s["presentes"]:
                asistencia[slug]["presente"] += 1
            for slug in s.get("votaron_sin_figurar_en_presentes", []):
                asistencia[slug]["voto_sin_figurar"] += 1
        sesiones_web, votaciones_web = [], []
        for i, s in enumerate(sesiones):
            presentes = set(s["presentes"])
            sesiones_web.append({
                "tipo": s["tipo"],
                "numero": s["numero"],
                "fecha": s["fecha"],
                # Una marca por diputacion, en el orden de `orden`.
                "presentes": "".join("1" if slug in presentes else "0" for slug in orden),
            })
            # Solo pasa al sitio lo que valido el ETL (publicable = true).
            for v in s["votaciones"]:
                if v["publicable"]:
                    votaciones_web.append({
                        "s": i, "n": v["orden"], "p": v["propuesta"], "m": v["mocion"],
                        "e": v["expediente"], "d": v["declarado"], "v": v["votos"],
                        "r": v["resultado"],
                    })
        (destino / "votaciones.json").write_text(json.dumps({
            "_fuente": actas["_fuente"],
            "_extraido": actas["_extraido"],
            "orden": orden,
            "sesiones": sesiones_web,
            "votaciones": votaciones_web,
        }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        kb = (destino / "votaciones.json").stat().st_size // 1024
        print(f"      datos/votaciones.json ({kb} KB, {len(votaciones_web)} votaciones)")
        actas_resumen = {
            "_fuente": actas["_fuente"],
            "_extraido": actas["_extraido"],
            "desde": actas["resumen"]["desde"],
            "hasta": actas["resumen"]["hasta"],
            "sesiones": len(sesiones),
            "sesiones_con_lista_de_presentes": sum(1 for s in sesiones if s["presentes"]),
            "votaciones": len(votaciones_web),
            # Las que el acta trae pero no cuadran (totales contra nombres):
            # no se publican, pero se cuentan para decirlo en pantalla.
            "votaciones_no_publicables": (actas["resumen"]["votaciones"]
                                          - actas["resumen"]["votaciones_publicables"]),
            "sin_documento": [x["sesion"] for x in actas.get("sin_documento", [])],
            "asistencia": asistencia,
            "proyectos": proyectos_mas_votados(sesiones, votaciones_web),
        }
    else:
        print("  ! Sin actas del Plenario. Corre: python etl/fetch_actas.py")

    # Gasto por diputacion (ADR-023): remuneracion y combustible por mes.
    gasto_web = None
    archivo_gasto = PROCESADO / "gasto.json"
    if archivo_gasto.exists():
        g = json.loads(archivo_gasto.read_text(encoding="utf-8"))
        por_dip: dict = {}
        for conjunto in ("salarios", "combustible"):
            for mes, info in sorted(g[conjunto].items()):
                for slug, v in info["por_diputacion"].items():
                    por_dip.setdefault(slug, {"salarios": {}, "combustible": {}})[conjunto][mes] = v
        gasto_web = {
            "_fuente": g["_fuente"],
            "_extraido": g["_extraido"],
            "archivos": {c: {m: g[c][m]["_fuente"] for m in g[c]} for c in ("salarios", "combustible")},
            "notas": {c: sorted({n for m in g[c].values() for n in m["notas"]})
                      for c in ("salarios", "combustible")},
            "por_diputacion": por_dip,
        }
    else:
        print("  ! Sin datos de gasto. Corre: python etl/fetch_gasto.py")

    archivo_colores = PROCESADO / "colores.json"
    if not archivo_colores.exists():
        print("  ! Faltan colores. Corre antes: python etl/derive_colores.py")
        return 1
    colores = json.loads(archivo_colores.read_text(encoding="utf-8"))

    ligeros = []
    for dip in dips:
        ligeros.append(
            {
                **{
                    k: dip[k]
                    for k in (
                        "slug", "nombre", "cedula", "partido_codigo", "fraccion",
                        "provincia", "profesion", "fecha_nacimiento", "lugar_nacimiento",
                        "estado_civil", "email_oficial", "redes", "biografia",
                    )
                },
                "foto": fotos.get(dip["slug"], {}).get("archivo"),
                "foto_oficial_url": dip["foto_url"],
                # Cargo en el Directorio Legislativo, si tiene alguno.
                "cargo_directorio": next(
                    (
                        m["etiqueta"]
                        for m in directorio["miembros"]
                        if m["slug"] == dip["slug"]
                    ),
                    None,
                ),
            }
        )

    # Cuando se leyo cada fuente. No es lo mismo que `generado` (cuando se
    # armo este payload): en la nube el sitio se compila a diario, pero el
    # SharePoint de la Asamblea solo responde desde Costa Rica y se actualiza
    # cuando corre la computadora local (ADR-024). La cabecera muestra la
    # fecha mas vieja de estas, para no aparentar frescura que no hay.
    extraido = {
        "padron": d.get("generado"),
        "directorio": directorio.get("generado"),
        "actividad": actividad.get("generado") if actividad else None,
        "gasto": g.get("_extraido") if archivo_gasto.exists() else None,
        "actas": actas.get("_extraido") if archivo_actas.exists() else None,
    }

    salida = {
        "generado": ahora_iso(),
        "extraido": extraido,
        "periodo": d["periodo"],
        "fuente_oficial": d["fuentes"]["diputados"],
        "fuente_fracciones": d["fuentes"].get("fracciones"),
        "licencia": d["licencia"],
        "total": len(ligeros),
        "conteo_por_partido": d["conteo_por_partido"],
        "fracciones": [
            {
                **{k: f[k] for k in ("codigo", "nombre", "sitio", "estado")},
                "nombre_tomado_de": f.get("nombre_tomado_de"),
                "escanos": d["conteo_por_partido"].get(f["codigo"], 0),
                "color": colores["colores"].get(f["codigo"], {}).get("hex"),
                "color_derivado_de_bandera": colores["colores"]
                .get(f["codigo"], {})
                .get("hex_derivado"),
                "bandera": f"banderas/bandera_{f['codigo']}"
                + Path(f["bandera_url"]).suffix.lower()
                if f.get("bandera_url")
                else None,
            }
            for f in d["fracciones"]
            if f["estado"] == "Activo"
        ],
        "metodo_colores": colores["metodo"],
        "actividad": actividad,
        "actas": actas_resumen,
        "gasto": gasto_web,
        "escudo": manifiesto.get("escudo"),
        # Glosario curado a mano del Reglamento (cita literal y articulo).
        "glosario": (json.loads(GLOSARIO.read_text(encoding="utf-8"))
                     if GLOSARIO.exists() else None),
        "hemiciclo": {
            "confianza": "derivado",
            "nota": (
                "La Asamblea Legislativa no publica la curul asignada a cada "
                "diputación. La ubicación por bancada sigue el Reglamento del "
                "Ceremonial Protocolar (art. 15): fracción de Gobierno a la "
                "izquierda del Directorio, oposición mayoritaria a la derecha. "
                "La posición individual dentro de cada bancada es ilustrativa."
            ),
            "filas": FILAS,
            "curules": curules,
        },
        "sala": {
            "confianza": "reconstruido",
            "nota": (
                "Reconstrucción de la disposición física del salón de sesiones: "
                "sala rectangular con dos bancadas escalonadas enfrentadas y la "
                "mesa del Directorio al fondo. Las proporciones y el conteo por "
                "grada se leyeron de fotografías del plenario, no de un plano "
                "oficial. La curul asignada a cada diputación tampoco es pública."
            ),
            "curules": curules_sala,
            "mesa": puestos_mesa,
            # Curules sin ocupante: el escritorio existe en la sala, asi que
            # se envian con su posicion para dibujarlas en la vista 3D.
            "vacias": vacias,
            "curadas": curados,
            "por_curar": len(curules_sala) - curados,
            "avisos": avisos_curules,
        },
        "directorio": {
            "_fuente": directorio["_fuente"],
            "nota": directorio["nota"],
            "miembros": [
                {k: m[k] for k in ("cargo", "etiqueta", "slug", "nombre", "partido_codigo")}
                for m in directorio["miembros"]
            ],
        },
        "diputados": ligeros,
    }
    (destino / "asamblea.json").write_text(
        json.dumps(salida, ensure_ascii=False), encoding="utf-8"
    )
    kb = (destino / "asamblea.json").stat().st_size // 1024
    print(f"      datos/asamblea.json ({kb} KB)")

    print("[3/3] Copiando activos...")
    dst = PUBLICO / "assets"
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(ASSETS, dst, ignore=shutil.ignore_patterns("manifiesto.json"))
    n_fotos = len(list((dst / "fotos").glob("*")))
    n_band = len(list((dst / "banderas").glob("*")))
    print(f"      {n_fotos} fotos, {n_band} banderas")
    print("\n  -> listo para: cd web && npm run dev")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
