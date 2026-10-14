"""
Datos precalculados para el asistente de preguntas (ADR-030).

El asistente corre en un Worker gratuito de Cloudflare, que tiene 10 ms de
CPU por pedido: no le alcanza para recorrer las 4 800 votaciones en cada
pregunta. Todo lo que exige recorrer datos se calcula aca, en el ETL, y el
Worker solo busca y filtra.

Nada nuevo se afirma: cada cifra es un conteo directo del mismo payload que
publica el sitio (asamblea.json y votaciones.json). Lo que es calculo propio
(la mayoria de cada bancada en una votacion) se marca como tal.
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import date, timedelta

# Fracciones con menos votos emitidos no tienen una mayoria que comparar.
# Mismo criterio que web/src/ResumenSemana.tsx.
MINIMO_BANCADA = 3


def _clave(sesion: dict, v: dict) -> str:
    return f"{sesion['tipo']}-{sesion['numero']}-{v['n']}"


def _semana(vot: dict, partido: dict[str, str | None], nombre: dict[str, str]) -> dict | None:
    sesiones = vot["sesiones"]
    if not sesiones:
        return None
    ultima = max(s["fecha"] for s in sesiones)
    inicio = (date.fromisoformat(ultima) - timedelta(days=6)).isoformat()
    en = [i for i, s in enumerate(sesiones) if inicio <= s["fecha"] <= ultima]
    en_set = set(en)
    vots = [v for v in vot["votaciones"] if v["s"] in en_set]
    orden = vot["orden"]
    con_lista = [i for i in en if len(sesiones[i]["presentes"]) == len(orden)]
    ausencias = []
    for k, slug in enumerate(orden):
        veces = sum(1 for i in con_lista if sesiones[i]["presentes"][k] != "1")
        if veces:
            ausencias.append({"nombre": nombre[slug], "fraccion": partido[slug],
                              "veces": veces, "de": len(con_lista)})
    distinto: Counter = Counter()
    for v in vots:
        grupos: dict[str, dict[str, list[str]]] = {}
        for k, slug in enumerate(orden):
            voto = v["v"][k]
            if voto not in "FC" or not partido.get(slug):
                continue
            grupos.setdefault(partido[slug], {"F": [], "C": []})[voto].append(slug)
        for g in grupos.values():
            if len(g["F"]) + len(g["C"]) < MINIMO_BANCADA or len(g["F"]) == len(g["C"]):
                continue
            for slug in (g["C"] if len(g["F"]) > len(g["C"]) else g["F"]):
                distinto[slug] += 1
    return {
        "desde": inicio,
        "hasta": ultima,
        "sesiones": len(en),
        "votaciones": len(vots),
        "aprobadas": sum(1 for v in vots if v["r"] == "aprobada"),
        "rechazadas": sum(1 for v in vots if v["r"] == "rechazada"),
        "ausencias": sorted(ausencias, key=lambda a: -a["veces"]),
        "votaron_distinto_a_su_bancada": [
            {"nombre": nombre[s], "fraccion": partido[s], "veces": n}
            for s, n in distinto.most_common()
        ],
        "_nota": ("Ausencias: conteo directo de la lista de presentes de cada acta; el acta no "
                  "dice si hubo permiso. «Distinto a su bancada»: calculo propio, voto a favor o "
                  f"en contra opuesto a la mayoria de su fraccion (fracciones con {MINIMO_BANCADA} "
                  "o mas votos emitidos; los empates no cuentan)."),
    }


def votaciones_asistente(vot: dict | None) -> dict:
    """Las votaciones en filas compactas, para buscarlas por texto o expediente.

    Va en un archivo aparte que el Worker pide solo cuando hace falta:
    [clave, fecha, propuesta, expediente, a favor, en contra, no voto, resultado].
    """
    filas = []
    for v in (vot or {}).get("votaciones", []):
        s = vot["sesiones"][v["s"]]
        filas.append([_clave(s, v), s["fecha"], v["p"], v["e"], *v["d"],
                      {"aprobada": "A", "rechazada": "R"}.get(v["r"])])
    return {"_campos": ["clave", "fecha", "propuesta", "expediente", "a_favor", "en_contra",
                        "no_voto", "resultado (A aprobada, R rechazada, null sin verificar)"],
            "filas": filas}


def _plano(s: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn").lower()


def _notas_de(nombre: str, notas: list[str]) -> list[str]:
    """Oraciones de las notas oficiales que mencionan a la persona por su nombre.

    Las notas son de la Asamblea (pie de los Excel de gasto). Se citan tal
    cual: por ejemplo, la licencia de maternidad que explica meses sin
    combustible y sesiones sin figurar entre los presentes.
    """
    salida = []
    clave = _plano(nombre)
    for nota in notas:
        texto = " ".join(nota.split())
        i = _plano(texto).find(clave)
        if i < 0:
            continue
        ini = texto.rfind(".", 0, i) + 1
        fin = texto.find(".", i)
        oracion = texto[ini:fin + 1 if fin >= 0 else None].strip()
        if oracion and oracion not in salida:
            salida.append(oracion)
    return salida


def datos_asistente(asamblea: dict, vot: dict | None,
                    nombres_expedientes: dict[str, list[str]] | None = None) -> dict:
    dips = asamblea["diputados"]
    partido = {d["slug"]: d.get("partido_codigo") for d in dips}
    nombre = {d["slug"]: d["nombre"] for d in dips}
    actas = asamblea.get("actas") or {}
    asistencia = actas.get("asistencia") or {}
    con_lista = actas.get("sesiones_con_lista_de_presentes")
    gasto = (asamblea.get("gasto") or {}).get("por_diputacion") or {}
    notas_gasto = [n for lista in ((asamblea.get("gasto") or {}).get("notas") or {}).values()
                   for n in lista]

    conteo_votos: dict[str, Counter] = {}
    if vot:
        for k, slug in enumerate(vot["orden"]):
            conteo_votos[slug] = Counter(v["v"][k] for v in vot["votaciones"])

    diputaciones = []
    for d in dips:
        slug = d["slug"]
        g = gasto.get(slug) or {}
        sal = g.get("salarios") or {}
        comb = g.get("combustible") or {}
        mes_sal = max(sal) if sal else None
        mes_comb = max(comb) if comb else None
        c = conteo_votos.get(slug, Counter())
        a = asistencia.get(slug)
        diputaciones.append({
            "slug": slug,
            "nombre": d["nombre"],
            "fraccion": d.get("fraccion"),
            "partido": d.get("partido_codigo"),
            "provincia": d.get("provincia"),
            "cargo_directorio": d.get("cargo_directorio"),
            "profesion": d.get("profesion"),
            "asistencia": ({"presente": a["presente"], "sesiones": con_lista}
                           if a and con_lista else None),
            "votos": ({"a_favor": c["F"], "en_contra": c["C"],
                       "en_la_lista_sin_votar": c["N"],
                       "fuera_de_la_lista_de_la_votacion": c["-"],
                       "votaciones_del_periodo": sum(c.values())} if c else None),
            "remuneracion": ({"mes": mes_sal, **sal[mes_sal]} if mes_sal else None),
            "combustible": ({"mes": mes_comb, **comb[mes_comb]} if mes_comb else None),
            "notas_oficiales": _notas_de(d["nombre"], notas_gasto),
        })


    total = asamblea["total"]
    return {
        "_nota": ("Precalculado por etl/asistente_datos.py a partir de asamblea.json y "
                  "votaciones.json. Conteos directos; lo que es calculo propio lo dice."),
        "generado": asamblea["generado"],
        "extraido": asamblea.get("extraido"),
        "periodo": asamblea["periodo"],
        "fuentes": {
            "padron": asamblea.get("fuente_oficial"),
            "actas": "https://produccion.asamblea.go.cr/SILConsulta/Monitor/Principal",
            "gasto": (asamblea.get("gasto") or {}).get("_fuente"),
        },
        "composicion": {
            "total": total,
            "mayoria_simple": math.floor(total / 2) + 1,
            "mayoria_calificada": math.ceil(total * 2 / 3),
            "fracciones": [{"codigo": f["codigo"], "nombre": f.get("nombre"),
                            "escanos": f["escanos"]} for f in asamblea["fracciones"]],
            "_nota": "Las mayorias son calculo propio sobre el total de curules.",
        },
        "actas": {k: actas.get(k) for k in ("desde", "hasta", "sesiones", "votaciones",
                                            "votaciones_no_publicables", "sin_documento")},
        "proyectos": actas.get("proyectos") or [],
        "semana": _semana(vot, partido, nombre) if vot else None,
        # Cada sesion con acta y quien no figura en su lista de presentes.
        "sesiones": [
            {"fecha": s["fecha"], "tipo": s["tipo"], "numero": s["numero"],
             "con_lista_de_presentes": len(s["presentes"]) == len(vot["orden"]),
             "presentes": s["presentes"].count("1"),
             "no_figuran": [{"nombre": nombre[slug], "fraccion": partido[slug]}
                            for k, slug in enumerate(vot["orden"])
                            if len(s["presentes"]) == len(vot["orden"]) and s["presentes"][k] != "1"]}
            for s in sorted(vot["sesiones"], key=lambda s: (s["fecha"], s["tipo"], s["numero"]))
        ] if vot else [],
        "diputaciones": diputaciones,
        "expedientes": nombres_expedientes or {},
        "glosario": [{"nombre": t["nombre"], "articulo": t["articulo"],
                      "explicacion": t["explicacion"]}
                     for t in ((asamblea.get("glosario") or {}).get("terminos") or [])],
    }
