"""
Mapa de curules del plenario: donde esta cada asiento y quien lo ocupa.

NUMERACION
    Seccion 1  bancada del oficialismo, a la izquierda del Directorio
    Seccion 2  bancada de oposicion, a la derecha
    Fila 1     pegada al pasillo central (adelante, grada baja)
    Fila 2     contra la pared (atras, grada alta)
    Asiento    se cuenta desde el Directorio hacia la entrada; el 1 es el
               mas cercano al Directorio
    Id         S{seccion}-F{fila}-A{asiento}, p. ej. S1-F1-A11

DOS ORIGENES, BIEN SEPARADOS
    curado    lo dicta una persona que conoce el salon; queda en
              data/curated/asignacion_curules.json y manda sobre todo lo demas
    derivado  lo coloca la regla automatica (bancada + orden del padron)
              para las curules que todavia no se han curado

La Asamblea no publica el asiento de cada diputacion, asi que ninguna de las
dos es un dato oficial. El sitio muestra cual es cual.

Uso:
    python etl/curules.py            # estado: mapa y pendientes
    python etl/curules.py --mapa     # solo el mapa de asientos
    python etl/curules.py --faltan   # solo lo que falta por curar
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PROCESADO = RAIZ / "data" / "processed"
CURADO = RAIZ / "data" / "curated" / "asignacion_curules.json"

# --- Geometria de la sala (metros aproximados) ---
PASILLO = 5.0
SEPARACION_FILA = 2.4
ALTURA_FILA = 0.62
PASO_CURUL = 1.5
Z_INICIO = -7.2  # primera curul, apenas pasado el estrado
Z_DIRECTORIO = -11.0
PASO_MESA = 2.3

LADO_DE_SECCION = {1: -1, 2: +1}


def cargar_curaduria() -> dict:
    if not CURADO.exists():
        return {"layout": {"1": [13, 14], "2": [13, 14]}, "asignaciones": []}
    return json.loads(CURADO.read_text(encoding="utf-8"))


def mapa_de_curules(layout: dict, desfase: dict | None = None) -> list[dict]:
    """
    Todas las curules de bancada, con su identificador y su posicion 3D.

    Las filas NO estan alineadas entre si. La fila 2 (contra la pared) tiene
    un puesto mas, pegado al Directorio, y debajo de el no hay curul: por eso
    la fila 1 arranca un lugar mas lejos. `desfase` recoge ese corrimiento, en
    lugares, para cada fila.
    """
    desfase = desfase or {}
    asientos: list[dict] = []
    for seccion_txt, filas in sorted(layout.items()):
        seccion = int(seccion_txt)
        lado = LADO_DE_SECCION[seccion]
        corrimientos = desfase.get(seccion_txt, [0] * len(filas))
        for indice_fila, cuantos in enumerate(filas):
            fila = indice_fila + 1
            corrido = corrimientos[indice_fila] if indice_fila < len(corrimientos) else 0
            x = lado * (PASILLO / 2 + 1.6 + indice_fila * SEPARACION_FILA)
            y = indice_fila * ALTURA_FILA
            for n in range(1, cuantos + 1):
                asientos.append(
                    {
                        "id": f"S{seccion}-F{fila}-A{n}",
                        "seccion": seccion,
                        "fila": fila,
                        "asiento": n,
                        "lado": "izquierda" if lado < 0 else "derecha",
                        "grada": indice_fila,
                        "x": round(x, 3),
                        "y": round(y, 3),
                        "desfase": corrido,
                        "z": round(Z_INICIO + (n - 1 + corrido) * PASO_CURUL, 3),
                        "rot_y": round(math.pi / 2 * (1 if lado < 0 else -1), 5),
                    }
                )
    return asientos


def mapa_de_mesa(cuantos: int) -> list[dict]:
    """Puestos de la mesa del Directorio, de izquierda a derecha."""
    largo = (cuantos - 1) * PASO_MESA
    return [
        {
            "id": f"MESA-{i + 1}",
            "seccion": "mesa",
            "x": round(-largo / 2 + i * PASO_MESA, 3),
            "y": 0.6,
            "z": round(Z_DIRECTORIO - 0.9, 3),
            "rot_y": 0.0,
        }
        for i in range(cuantos)
    ]


def repartir(dips: list[dict], directorio: dict, orden_bancadas: list[str]):
    """
    Coloca a las 57 diputaciones.

    Devuelve (curules, mesa, pendientes, avisos):
      curules    asientos de bancada, cada uno con `origen`: curado | derivado
      mesa       los tres puestos del Directorio (dato oficial)
      pendientes diputaciones aun sin curar, en orden de bancada
      avisos     inconsistencias detectadas; se reportan, no se corrigen
    """
    avisos: list[str] = []
    cur = cargar_curaduria()
    layout = cur["layout"]
    asientos = mapa_de_curules(layout, cur.get("desfase_fila"))
    por_id = {a["id"]: a for a in asientos}
    por_slug = {d["slug"]: d for d in dips}

    por_cargo = {m["cargo"]: m for m in directorio["miembros"]}
    en_mesa = [por_cargo[c] for c in directorio["en_la_mesa"] if c in por_cargo]
    slugs_mesa = {m["slug"] for m in en_mesa}

    # 1) Lo curado manda.
    ocupado: dict[str, dict] = {}
    tomados: set[str] = set()
    for a in cur.get("asignaciones", []):
        ident, slug = a.get("id"), a.get("slug")
        if ident not in por_id:
            avisos.append(f"{ident}: no existe esa curul; revisa `layout`")
            continue
        if slug not in por_slug:
            avisos.append(f"{ident}: '{slug}' no esta en el padron")
            continue
        if slug in slugs_mesa:
            avisos.append(
                f"{ident}: {por_slug[slug]['nombre']} preside desde la mesa, "
                "no ocupa curul de bancada"
            )
            continue
        if ident in ocupado:
            avisos.append(f"{ident}: asignada dos veces")
            continue
        if slug in tomados:
            avisos.append(f"{por_slug[slug]['nombre']}: asignada a dos curules")
            continue
        ocupado[ident] = por_slug[slug]
        tomados.add(slug)

    # 2) Quienes faltan, en orden de bancada y luego el orden del padron.
    def clave(d: dict):
        p = d["partido_codigo"]
        i = orden_bancadas.index(p) if p in orden_bancadas else len(orden_bancadas)
        return (i, d["orden_web"] is None, d["orden_web"])

    faltan = sorted(
        (d for d in dips if d["slug"] not in tomados and d["slug"] not in slugs_mesa),
        key=clave,
    )
    # Las curules declaradas vacias no se rellenan nunca: son parte del salon
    # real, verificadas en video, no huecos por completar.
    declaradas_vacias = set(cur.get("curules_vacias", []))
    libres = [
        a for a in asientos
        if a["id"] not in ocupado and a["id"] not in declaradas_vacias
    ]
    if len(faltan) > len(libres):
        avisos.append(
            f"{len(faltan)} diputaciones por colocar y solo {len(libres)} curules "
            "libres: no alcanzan. Revisa `layout`."
        )
    for d, a in zip(faltan, libres):
        ocupado[a["id"]] = d

    curules = []
    for a in asientos:
        d = ocupado.get(a["id"])
        if not d:
            continue
        curado = a["id"] in {x.get("id") for x in cur.get("asignaciones", [])}
        curules.append(
            {
                **a,
                "slug": d["slug"],
                "partido": d["partido_codigo"],
                "origen": "curado" if curado else "derivado",
            }
        )
        # La seccion 1 es del oficialismo y la 2 de la oposicion. Si una
        # curada rompe eso, puede ser correcto (el salon manda) pero conviene
        # verlo, porque suele ser un error de tipeo.
        if curado and a["seccion"] == 2 and d["partido_codigo"] == orden_bancadas[0]:
            avisos.append(
                f"{a['id']}: {d['nombre']} es {d['partido_codigo']} pero quedo en "
                "la seccion 2 (oposicion)"
            )

    puestos_mesa = [
        {**pos, **{k: m[k] for k in ("slug", "cargo", "etiqueta")},
         "partido": m["partido_codigo"], "origen": "oficial"}
        for m, pos in zip(en_mesa, mapa_de_mesa(len(en_mesa)))
    ]
    vacias = [
        {**a, "slug": None, "partido": None, "origen": "vacia"}
        for a in asientos
        if a["id"] not in ocupado
    ]
    return curules, puestos_mesa, faltan, avisos, vacias


def revisar_pistas(curules: list[dict], nombres: dict[str, str]) -> list[dict]:
    """
    Comprueba las relaciones observadas que todavia no son curules concretas.

    Una pista dice, por ejemplo, "A esta justo delante de B". Mientras falte
    ubicar a alguno de los dos queda pendiente; si solo uno esta ubicado, la
    pista DEDUCE donde va el otro; si ambos lo estan, se verifica sola. Cuando
    algo se contradice se reporta: o la pista estaba mal, o hay una curul mal
    asignada. En ningun caso se corrige en automatico.

    Tipos de pista:
      delante_de   'a' esta en la fila 1 y 'b' justo detras, en la fila 2.
                   Se resuelve por POSICION FISICA, no por numero de asiento:
                   las filas estan corridas entre si, asi que F1-A{n} queda al
                   lado de F2-A{n+1}. Comparar por `z` sigue funcionando
                   aunque el corrimiento cambie.
      al_lado_de   'a' y 'b' comparten fila y son contiguos. Con el campo
                   `a_mas_al_fondo` se sabe de que lado: true significa que
                   'a' esta mas lejos del Directorio que 'b', y entonces la
                   deduccion es unica en vez de dejar dos candidatos.
    """
    cur = cargar_curaduria()
    por_slug = {c["slug"]: c for c in curules}
    por_id = {c["id"]: c for c in curules}
    curados = {c["slug"] for c in curules if c["origen"] == "curado"}

    def enfrente(asiento: dict, fila_destino: int) -> dict | None:
        """La curul de `fila_destino` que queda a la misma altura de la sala."""
        return next(
            (
                c
                for c in curules
                if c["seccion"] == asiento["seccion"]
                and c["fila"] == fila_destino
                and abs(c["z"] - asiento["z"]) < 0.01
            ),
            None,
        )

    salida = []
    for p in cur.get("pistas", []):
        a, b = por_slug.get(p["a"]), por_slug.get(p["b"])
        na = nombres.get(p["a"], p["a"])
        nb = nombres.get(p["b"], p["b"])
        a_fijo, b_fijo = p["a"] in curados, p["b"] in curados
        estado, detalle = "pendiente", ""
        tipo = p.get("tipo", "delante_de")
        verbo = "a la par de" if tipo == "al_lado_de" else "delante de"

        if tipo == "al_lado_de":
            sentido = p.get("a_mas_al_fondo")
            if sentido is True:
                verbo = "a la par (hacia el fondo) de"
            elif sentido is False:
                verbo = "a la par (hacia el Directorio) de"
            if a_fijo and b_fijo and a and b:
                delta = a["asiento"] - b["asiento"]
                ok = (
                    a["seccion"] == b["seccion"]
                    and a["fila"] == b["fila"]
                    and abs(delta) == 1
                    and (sentido is None or (delta > 0) == sentido)
                )
                estado = "cumplida" if ok else "contradicha"
                detalle = f"{a['id']} / {b['id']}"
            elif a_fijo != b_fijo:
                fijo = a if a_fijo else b
                falta_slug = p["b"] if a_fijo else p["a"]
                quien = nombres.get(falta_slug, falta_slug)
                if fijo:
                    vecinas = [
                        c
                        for c in curules
                        if c["seccion"] == fijo["seccion"]
                        and c["fila"] == fijo["fila"]
                        and abs(c["asiento"] - fijo["asiento"]) == 1
                    ]
                    # Con direccion conocida queda una sola vecina posible.
                    if sentido is not None:
                        hacia = sentido if a_fijo is False else not sentido
                        vecinas = [
                            c
                            for c in vecinas
                            if (c["asiento"] > fijo["asiento"]) == hacia
                        ]
                    if any(c["slug"] == falta_slug for c in vecinas):
                        estado, detalle = "cumplida", fijo["id"]
                    else:
                        libres = [c for c in vecinas if c["origen"] != "curado"]
                        if libres:
                            estado = "deducida"
                            detalle = f"{quien} en " + " o ".join(c["id"] for c in libres)
                        else:
                            estado = "contradicha"
                            detalle = (
                                f"las dos curules contiguas a {fijo['id']} ya estan "
                                "curadas con otras personas"
                            )
            salida.append(
                {**p, "estado": estado, "detalle": detalle,
                 "texto": f"{na} {verbo} {nb}"}
            )
            continue

        if a_fijo and b_fijo and a and b:
            pareja = enfrente(b, 1)
            ok = a["fila"] == 1 and b["fila"] == 2 and pareja is not None and pareja["id"] == a["id"]
            estado = "cumplida" if ok else "contradicha"
            detalle = f"{a['id']} / {b['id']}"

        elif a_fijo != b_fijo:
            fijo = a if a_fijo else b
            falta_slug = p["b"] if a_fijo else p["a"]
            quien = nombres.get(falta_slug, falta_slug)
            if fijo:
                destino = enfrente(fijo, 2 if a_fijo else 1)
                if destino is None:
                    estado = "contradicha"
                    detalle = (
                        f"{fijo['id']} no tiene curul enfrentada en la otra fila; "
                        "revisa el corrimiento entre filas"
                    )
                elif destino["slug"] != falta_slug:
                    ocupante = por_id.get(destino["id"])
                    if ocupante and ocupante["origen"] == "curado":
                        estado = "contradicha"
                        detalle = (
                            f"implica {quien} en {destino['id']}, pero ahi esta "
                            f"{nombres.get(ocupante['slug'], ocupante['slug'])} (curada)"
                        )
                    else:
                        estado = "deducida"
                        detalle = f"implica {quien} en {destino['id']} (libre)"
                else:
                    estado = "cumplida"
                    detalle = destino["id"]
        salida.append(
            {**p, "estado": estado, "detalle": detalle, "texto": f"{na} {verbo} {nb}"}
        )
    return salida


def deducir_por_descarte(curules: list[dict], faltan: list[dict]) -> list[dict]:
    """
    Deduce curules por eliminacion, usando solo la regla de secciones.

    La seccion 1 es del oficialismo y la 2 de la oposicion (ADR-012). Con eso,
    cada curul libre admite solo a quienes militan en la bancada que le
    corresponde. Cuando a una persona le queda UNA sola curul posible, o a una
    curul le queda UNA sola persona posible, la ubicacion queda determinada.

    Es una deduccion logica, no una observacion: se reporta aparte y NO se
    guarda como curada. Sirve para saber que mirar en el video.
    """
    libres = [c for c in curules if c["origen"] != "curado"]
    if not libres or not faltan:
        return []

    def cabe(dip: dict, curul: dict) -> bool:
        oficialista = dip["partido_codigo"] == "PPSO"
        return oficialista == (curul["seccion"] == 1)

    opciones = {d["slug"]: [c for c in libres if cabe(d, c)] for d in faltan}
    ocupantes = {c["id"]: [d for d in faltan if cabe(d, c)] for c in libres}
    por_slug = {d["slug"]: d for d in faltan}

    deducciones = []
    for slug, curs in opciones.items():
        if len(curs) == 1:
            deducciones.append(
                {
                    "slug": slug,
                    "nombre": por_slug[slug]["nombre"],
                    "id": curs[0]["id"],
                    "motivo": "es la única curul libre que le corresponde por bancada",
                }
            )
    ya = {d["slug"] for d in deducciones}
    for ident, gente in ocupantes.items():
        if len(gente) == 1 and gente[0]["slug"] not in ya:
            deducciones.append(
                {
                    "slug": gente[0]["slug"],
                    "nombre": gente[0]["nombre"],
                    "id": ident,
                    "motivo": "es la única persona que puede ocupar esa curul",
                }
            )
    return sorted(deducciones, key=lambda d: d["id"])


def _sin_tildes(t: str) -> str:
    import unicodedata

    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def buscar_diputacion(consulta: str, dips: list[dict]) -> dict:
    """
    Resuelve un nombre parcial contra el padron.

    Exige coincidencia unica: si el nombre es ambiguo o no existe, se aborta.
    Nunca se adivina, porque una curul mal asignada es un dato falso.
    """
    piezas = _sin_tildes(consulta).split()
    hallados = [d for d in dips if all(p in _sin_tildes(d["nombre"]) for p in piezas)]
    if not hallados:
        raise SystemExit(f"  ! '{consulta}' no coincide con ninguna diputacion del padron")
    if len(hallados) > 1:
        nombres = ", ".join(d["nombre"] for d in hallados)
        raise SystemExit(f"  ! '{consulta}' es ambiguo; coincide con: {nombres}")
    return hallados[0]


def registrar(pares: list[str], dips: list[dict], directorio: dict, fecha: str) -> int:
    """Anota asignaciones en el archivo de curaduria, validando cada una."""
    cur = cargar_curaduria()
    layout = cur["layout"]
    ids_validos = {a["id"] for a in mapa_de_curules(layout, cur.get("desfase_fila"))}
    por_cargo = {m["cargo"]: m for m in directorio["miembros"]}
    slugs_mesa = {
        por_cargo[c]["slug"] for c in directorio["en_la_mesa"] if c in por_cargo
    }
    asignaciones = {a["id"]: a for a in cur.get("asignaciones", [])}

    if len(pares) % 2:
        raise SystemExit("  ! --set espera pares: ID NOMBRE ID NOMBRE ...")

    for i in range(0, len(pares), 2):
        ident, consulta = pares[i].upper(), pares[i + 1]
        if ident not in ids_validos:
            raise SystemExit(f"  ! {ident}: no existe esa curul en el layout actual")
        dip = buscar_diputacion(consulta, dips)
        if dip["slug"] in slugs_mesa:
            raise SystemExit(
                f"  ! {dip['nombre']} preside desde la mesa del Directorio; "
                "no ocupa curul de bancada"
            )
        # Una persona en dos curules seria un dato imposible: se libera la anterior.
        for otro_id, a in list(asignaciones.items()):
            if a["slug"] == dip["slug"] and otro_id != ident:
                print(f"  · {dip['nombre']} se mueve de {otro_id} a {ident}")
                del asignaciones[otro_id]
        if ident in asignaciones and asignaciones[ident]["slug"] != dip["slug"]:
            print(f"  · {ident} pasa de {asignaciones[ident]['nombre']} a {dip['nombre']}")
        asignaciones[ident] = {
            "id": ident,
            "slug": dip["slug"],
            "nombre": dip["nombre"],
            "fuente": "curaduria-manual",
            "fecha": fecha,
        }
        print(f"  ✔ {ident:<11} {dip['nombre']}  [{dip['partido_codigo']}]")

    def orden(a):
        p = a["id"].split("-")
        return (p[0], p[1], int(p[2][1:]))

    cur["asignaciones"] = sorted(asignaciones.values(), key=orden)
    CURADO.write_text(
        json.dumps(cur, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n  -> {len(cur['asignaciones'])} curules registradas")
    return 0


def quitar(claves: list[str], dips: list[dict]) -> int:
    """
    Desverifica curules: saca la asignacion manual y las devuelve a la regla
    automatica. Acepta identificadores de curul o nombres de persona.

    Sirve cuando una observacion resulta equivocada. Preferimos borrar el dato
    antes que dejarlo dudoso: una curul 'derivada' se muestra como provisional,
    una 'curada' se muestra como verificada.
    """
    cur = cargar_curaduria()
    asignaciones = {a["id"]: a for a in cur.get("asignaciones", [])}
    quitadas = 0

    for clave in claves:
        ident = clave.upper()
        if ident in asignaciones:
            a = asignaciones.pop(ident)
            print(f"  ✗ {ident:<11} {a['nombre']} — desverificada")
            quitadas += 1
            continue
        dip = buscar_diputacion(clave, dips)
        halladas = [a for a in asignaciones.values() if a["slug"] == dip["slug"]]
        if not halladas:
            print(f"  · {dip['nombre']} no tenia curul curada; nada que quitar")
            continue
        for a in halladas:
            asignaciones.pop(a["id"])
            print(f"  ✗ {a['id']:<11} {a['nombre']} — desverificada")
            quitadas += 1

    def orden(a):
        p = a["id"].split("-")
        return (p[0], p[1], int(p[2][1:]))

    cur["asignaciones"] = sorted(asignaciones.values(), key=orden)
    CURADO.write_text(
        json.dumps(cur, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"\n  -> {quitadas} quitadas; quedan {len(cur['asignaciones'])} curules curadas")
    return 0


def _cli() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mapa", action="store_true")
    ap.add_argument("--faltan", action="store_true")
    ap.add_argument(
        "--set",
        nargs="+",
        metavar="ID NOMBRE",
        help="registra asignaciones: --set S1-F1-A2 'Kattya Mora' S1-F1-A3 Brunner",
    )
    ap.add_argument(
        "--quitar",
        nargs="+",
        metavar="ID|NOMBRE",
        help="desverifica curules: --quitar S2-F2-A13  o  --quitar 'Edgardo Araya'",
    )
    ap.add_argument("--fecha", default="", help="fecha a anotar en los registros nuevos")
    args = ap.parse_args()
    todo = not (args.mapa or args.faltan or args.set or args.quitar)

    dips_arch = PROCESADO / "diputados.json"
    dir_arch = PROCESADO / "directorio.json"
    if not (dips_arch.exists() and dir_arch.exists()):
        print("Faltan datos. Corre: python etl/fetch_diputados.py y fetch_directorio.py")
        return 1

    d = json.loads(dips_arch.read_text(encoding="utf-8"))
    directorio = json.loads(dir_arch.read_text(encoding="utf-8"))
    orden = ["PPSO", "PLN", "PFA", "PUSC", "CAC"]

    if args.quitar:
        return quitar(args.quitar, d["diputados"])

    if args.set:
        return registrar(args.set, d["diputados"], directorio, args.fecha)

    curules, mesa, faltan, avisos, vacias = repartir(d["diputados"], directorio, orden)

    curados = [c for c in curules if c["origen"] == "curado"]
    nombres = {x["slug"]: x["nombre"] for x in d["diputados"]}

    if todo or args.mapa:
        print("=" * 74)
        print("MAPA DE CURULES".center(74))
        print("=" * 74)
        print("  Sección 1 = oficialismo (izquierda del Directorio)")
        print("  Sección 2 = oposición (derecha)")
        print("  Fila 1 = pegada al pasillo · Fila 2 = contra la pared")
        print("  Asiento 1 = el más cercano al Directorio")
        print()
        print("  MESA DEL DIRECTORIO (oficial, no se cura)")
        for m in mesa:
            print(f"    {m['id']:<9} {m['etiqueta']:<22} {nombres.get(m['slug'], m['slug'])}")
        print()
        for seccion in (1, 2):
            filas = sorted({c["fila"] for c in curules if c["seccion"] == seccion})
            for fila in filas:
                de_fila = [
                    c for c in curules if c["seccion"] == seccion and c["fila"] == fila
                ]
                # Las curules sin ocupante tambien son parte de la fila: si no
                # se muestran, el conteo del encabezado no cuadra con el layout.
                de_fila += [
                    {**v, "partido": "", "slug": ""}
                    for v in vacias
                    if v["seccion"] == seccion and v["fila"] == fila
                ]
                print(f"  SECCIÓN {seccion} · FILA {fila}  ({len(de_fila)} curules)")
                deducidas = {x["id"] for x in deducir_por_descarte(curules, faltan)}
                for c in sorted(de_fila, key=lambda x: x["asiento"]):
                    marca = (
                        "✔"
                        if c["origen"] == "curado"
                        else "○"
                        if c["origen"] == "vacia"
                        else "⊙"
                        if c["id"] in deducidas
                        else "·"
                    )
                    quien = (
                        "(curul sin ocupante)"
                        if c["origen"] == "vacia"
                        else nombres.get(c["slug"], c["slug"])
                    )
                    print(f"    {marca} {c['id']:<11} {c['partido']:<5} {quien}")
                print()

    if todo or args.faltan:
        print("=" * 74)
        print(f"  CURADAS: {len(curados)} de {len(curules)}    "
              f"POR CURAR: {len(curules) - len(curados)}")
        print("=" * 74)
        if curados:
            print("  Ya fijadas por vos:")
            for c in sorted(curados, key=lambda x: x["id"]):
                print(f"    ✔ {c['id']:<11} {nombres.get(c['slug'], c['slug'])}")
            print()
        print("  Faltan por ubicar (orden provisional, se irán fijando):")
        for i, dip in enumerate(faltan, 1):
            print(f"    {i:>2}. [{dip['partido_codigo']:<5}] {dip['nombre']}")

    descarte = deducir_por_descarte(curules, faltan)
    if descarte and (todo or args.faltan or args.mapa):
        print()
        print("  DEDUCIDAS POR DESCARTE (logica, no observadas — falta confirmar)")
        for x in descarte:
            print(f"    ⊙ {x['id']:<11} {x['nombre'][:32]:<32} {x['motivo']}")

    pistas = revisar_pistas(curules, nombres)
    if pistas and (todo or args.faltan):
        print()
        print("  PISTAS OBSERVADAS (relaciones sin curul definida todavia)")
        marca = {"cumplida": "✔", "contradicha": "✗", "pendiente": "⧗", "deducida": "→"}
        for p in pistas:
            extra = f"  [{p['detalle']}]" if p["detalle"] else ""
            print(f"    {marca[p['estado']]} {p['texto']}  ({p['estado']}){extra}")

    contradichas = [p for p in pistas if p["estado"] == "contradicha"]
    for p in contradichas:
        avisos.append(f"pista contradicha: {p['texto']} — {p['detalle']}")

    if avisos:
        print()
        print("  AVISOS:")
        for a in avisos:
            print(f"    ! {a}")
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
