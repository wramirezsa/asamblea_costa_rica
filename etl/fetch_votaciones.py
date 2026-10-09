"""
Votaciones del Plenario leidas desde el subtitulo de la transmision.

La Asamblea no publica las votaciones en ningun formato estructurado (ver
`docs/fuentes-de-datos.md`). Pero las transmite, y el ritual de votacion es tan
regular que se puede leer a maquina:

    Abrir puertas. Revision 497. Cerrar puertas con 43 diputados.
    Iniciar votacion. [...] Finalizar votacion. 42 en contra, uno a favor.
    Rechazado.

De cada ciclo salen cinco cosas: el numero de revision, cuantas diputaciones
habia en la sala, los votos a favor, los votos en contra y el resultado. Y las
marcas de tiempo acotan la ventana en que el TABLERO -- con el nombre de cada
quien y como voto -- esta en pantalla. Ese es el insumo del paso siguiente.

Que este script NO hace:

- No inventa. Un ciclo al que le falte un dato lo deja en None y lo reporta.
- No corrige el conteo de la fuente. Si los numeros no cuadran, lo dice.
- No da los votos por persona: el subtitulo solo canta totales. Los nombres
  estan en el tablero, que es imagen. Ver ADR-018.

Sobre el reconocimiento de voz: el subtitulo lo genera YouTube automaticamente
y se equivoca con los numeros grandes ("revision 52" por 502). Por eso el
numero de revision se marca como dato a contrastar, no como identificador
confiable.

Uso:
    python etl/fetch_votaciones.py                 # las 3 sesiones mas recientes
    python etl/fetch_votaciones.py --ultimas 10
    python etl/fetch_votaciones.py --video hEGwrnsaN90
    python etl/fetch_votaciones.py --todas
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.numeros import NUM, a_numero  # noqa: E402
from lib.sharepoint import ahora_iso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PROCESADO = RAIZ / "data" / "processed"
SUBTITULOS = RAIZ / "data" / "raw" / "subtitulos"

DIPUTACIONES = 57  # tope duro: nadie puede votar dos veces

# ------------------------------------------------------------- el ritual
# El subtitulo automatico parte las frases en fragmentos que no respetan la
# gramatica, asi que no sirve buscar dentro de cada linea: hay que pegar todo
# en un texto continuo y llevar aparte un indice de posicion -> segundo.

MARCAS = {
    "abrir": re.compile(r"abr\w*\s+(?:las\s+)?puertas"),
    "cerrar": re.compile(r"cerra\w*\s+(?:las\s+)?puertas?(?:\s+con\s+" + NUM
                         + r"\s+diputad\w*)?"),
    "iniciar": re.compile(r"inicia\w*\s+(?:la\s+)?votaci[oó]n"),
    "finalizar": re.compile(r"finaliza\w*[.,]?\s+(?:la\s+)?votaci[oó]n"),
    "revision": re.compile(r"revisi[oó]n\s+(\d+)"),
}

# El canto de los totales admite varias formas, todas vistas en transmisiones
# reales: "42 en contra, uno a favor", "40 votos en contra, nueve a favor",
# "ocho, a favor", "47 a favor, cero en contra". La palabra "votos" puede ir en
# cualquiera de los dos lados o en ninguno, y la coma se cuela entre el numero
# y la preposicion.
_CONTRA = NUM + r"\s*,?\s*(?:votos?\s+)?en\s+contra"
_FAVOR = NUM + r"\s*,?\s*(?:votos?\s+)?a\s+favor"
TOTALES = re.compile(
    _CONTRA + r"[.,;]?\s+" + _FAVOR + r"|" + _FAVOR + r"[.,;]?\s+" + _CONTRA
)
RESULTADO = re.compile(r"\b(aprobad[oa]|rechazad[oa])\b")

# Mayoria calificada: dos tercios de las 57 diputaciones (art. 119 de la
# Constitucion y 84 del Reglamento). Una mocion puede tener mas votos a favor
# que en contra y aun asi ser rechazada por no llegar a este umbral; eso NO es
# un error de lectura.
MAYORIA_CALIFICADA = 38


def texto_continuo(
    json3: dict,
) -> tuple[str, list[tuple[int, float]], list[int]]:
    """Pega el subtitulo en un texto continuo y devuelve con que ubicarlo.

    Devuelve el texto normalizado, el indice posicion_cruda -> segundo, y el
    mapa de posicion_normalizada -> posicion_cruda. Hacen falta los tres: el
    subtitulo automatico parte las frases donde se le antoja, asi que hay que
    buscar sobre el texto pegado, pero los tiempos estan atados al original.
    """
    partes: list[str] = []
    indice: list[tuple[int, float]] = []
    pos = 0
    for e in json3.get("events", []):
        t = e.get("tStartMs")
        txt = "".join(s.get("utf8", "") for s in (e.get("segs") or []))
        txt = txt.replace("\n", " ")
        if t is None or not txt.strip():
            continue
        partes.append(txt)
        indice.append((pos, t / 1000.0))
        pos += len(txt)
    crudo = "".join(partes)

    # Normalizar espacios cambia las posiciones; hay que reindexar en paralelo.
    limpio: list[str] = []
    mapa: list[int] = []  # posicion en limpio -> posicion en crudo
    anterior_espacio = False
    for i, ch in enumerate(crudo):
        if ch.isspace():
            if anterior_espacio:
                continue
            ch, anterior_espacio = " ", True
        else:
            anterior_espacio = False
        limpio.append(ch.lower())
        mapa.append(i)

    return "".join(limpio), indice, mapa


def segundo_de(pos_limpia: int, mapa: list[int],
               indice: list[tuple[int, float]]) -> float:
    """Segundo de la transmision en que se dijo lo que esta en esa posicion."""
    if not mapa or not indice:
        return 0.0
    crudo = mapa[min(pos_limpia, len(mapa) - 1)]
    mejor = indice[0][1]
    for p, t in indice:
        if p <= crudo:
            mejor = t
        else:
            break
    return mejor


def hhmmss(t: float) -> str:
    return f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{int(t % 60):02d}"


def ultimo_antes(marcas: list[tuple[int, ...]], limite: int, ventana: int,
                 desde: int = 0) -> tuple | None:
    """La ultima marca antes de `limite`, si cae dentro de la ventana.

    `desde` es la frontera con la votacion anterior y no es un detalle: sin
    ella, un ciclo que no repite "revision N" se queda con el numero del ciclo
    previo y el voto termina atribuido a la mocion equivocada. Preferimos un
    None declarado a un identificador prestado.
    """
    mejor = None
    for m in marcas:
        if desde <= m[0] < limite and limite - m[0] <= ventana:
            mejor = m
        elif m[0] >= limite:
            break
    return mejor


def extraer(texto: str, mapa: list[int],
            indice: list[tuple[int, float]]) -> tuple[list[dict], dict]:
    """Saca las votaciones del texto continuo. Lo dudoso queda en None."""
    pos = {
        nombre: [(m.start(), m) for m in patron.finditer(texto)]
        for nombre, patron in MARCAS.items()
    }
    conteo_marcas = {k: len(v) for k, v in pos.items()}

    votaciones = []
    frontera = 0  # fin de la votacion anterior: nada se toma prestado de ahi
    for m in TOTALES.finditer(texto):
        grupos = [g for g in m.groups() if g]
        if len(grupos) < 2:
            continue
        # Que lado se canto primero. Comparar posiciones y no buscar el numero
        # dentro de la frase: en "dos en contra, dos a favor" los dos numeros
        # son la misma palabra y la busqueda por texto se equivoca.
        frase = m.group(0)
        if frase.find("en contra") < frase.find("a favor"):
            contra, favor = a_numero(grupos[0]), a_numero(grupos[1])
        else:
            favor, contra = a_numero(grupos[0]), a_numero(grupos[1])
        if favor is None or contra is None:
            continue

        fin = ultimo_antes(pos["finalizar"], m.start(), 400, frontera)
        ini = ultimo_antes(pos["iniciar"], fin[0] if fin else m.start(), 4000,
                           frontera)
        cer = ultimo_antes(pos["cerrar"], ini[0] if ini else m.start(), 2000,
                           frontera)
        rev = ultimo_antes(pos["revision"], cer[0] if cer else m.start(), 1200,
                           frontera)

        presentes = None
        if cer and cer[1].group(1):
            presentes = a_numero(cer[1].group(1))

        cola = texto[m.end(): m.end() + 120]
        r = RESULTADO.search(cola)
        resultado = None
        if r:
            resultado = "aprobado" if r.group(1).startswith("aprobad") else "rechazado"

        t_fin = segundo_de(fin[0], mapa, indice) if fin else None
        t_ini = segundo_de(ini[0], mapa, indice) if ini else None

        # Rechazo con mayoria simple a favor: no es contradiccion, es el umbral
        # de dos tercios operando. Se anota para poder mostrarlo.
        umbral = None
        if resultado == "rechazado" and favor > contra:
            umbral = ("Rechazado pese a tener mas votos a favor: la materia "
                      f"exigia mayoria calificada ({MAYORIA_CALIFICADA} de "
                      f"{DIPUTACIONES}) y se quedo en {favor}.")

        votaciones.append({
            "revision": int(rev[1].group(1)) if rev else None,
            "_revision_nota": (
                "Leido del subtitulo automatico, que confunde numeros grandes. "
                "Contrastar contra la lista de mociones antes de publicar."
            ),
            "presentes": presentes,
            "favor": favor,
            "contra": contra,
            "resultado": resultado,
            "_umbral": umbral,
            "segundo_inicio": round(t_ini, 1) if t_ini is not None else None,
            "segundo_fin": round(t_fin, 1) if t_fin is not None else None,
            "segundo_totales": round(segundo_de(m.start(), mapa, indice), 1),
            "marca_tablero": hhmmss(t_fin) if t_fin is not None else None,
            "frase": re.sub(r"\s+", " ", m.group(0)),
        })
        frontera = m.end()

    return votaciones, conteo_marcas


def revisar(votaciones: list[dict], marcas: dict) -> list[str]:
    """Chequeos de integridad. REPORTAN; no tocan ningun dato.

    Lo que se repite muchas veces se agrega en un solo aviso con su magnitud.
    Cien lineas iguales esconden la unica que importa.
    """
    avisos = []

    if not votaciones and marcas.get("finalizar", 0) > 0:
        avisos.append(
            f"No se extrajo ninguna votacion pero el subtitulo tiene "
            f"{marcas['finalizar']} 'finalizar votacion'. Revisar el patron."
        )

    sin_tablero, exceso, graves = [], [], []
    for i, v in enumerate(votaciones, 1):
        etiqueta = f"votacion {i} (revision {v['revision']})"
        emitidos = v["favor"] + v["contra"]

        if emitidos > DIPUTACIONES:
            graves.append(
                f"{etiqueta}: {emitidos} votos emitidos, mas que las "
                f"{DIPUTACIONES} diputaciones."
            )
        if v["presentes"] is not None:
            if v["presentes"] > DIPUTACIONES:
                graves.append(
                    f"{etiqueta}: {v['presentes']} presentes declarados, mas "
                    f"que las {DIPUTACIONES} diputaciones."
                )
            elif emitidos > v["presentes"]:
                exceso.append(emitidos - v["presentes"])
        if v["resultado"] == "aprobado" and v["favor"] <= v["contra"]:
            graves.append(
                f"{etiqueta}: se declara aprobado con {v['favor']} a favor y "
                f"{v['contra']} en contra."
            )
        # Rechazar con mayoria simple es normal (umbral de dos tercios). Que se
        # rechace habiendo superado incluso ese umbral, no.
        if (v["resultado"] == "rechazado"
                and v["favor"] >= MAYORIA_CALIFICADA > v["contra"]):
            graves.append(
                f"{etiqueta}: se declara rechazado con {v['favor']} a favor, "
                f"por encima de la mayoria calificada."
            )
        if v["segundo_fin"] is None:
            sin_tablero.append(i)

    avisos += graves
    if sin_tablero:
        avisos.append(
            f"{len(sin_tablero)} de {len(votaciones)} votaciones sin marca de "
            "'finalizar votacion': no se puede ubicar el tablero en el video. "
            f"Indices: {sin_tablero[:12]}"
        )
    if exceso:
        c = Counter(exceso)
        avisos.append(
            f"{len(exceso)} votaciones con mas votos que presentes declarados "
            f"al cerrar puertas (diferencias: {dict(sorted(c.items()))}). "
            "Viene asi de la fuente; el tablero decide."
        )

    revs = [v["revision"] for v in votaciones if v["revision"]]
    repetidas = [n for n, c in Counter(revs).items() if c > 1]
    if repetidas:
        avisos.append(
            f"{len(repetidas)} numeros de revision repetidos: "
            f"{sorted(repetidas)[:10]} (posible error del reconocimiento de voz)."
        )
    if marcas.get("revision", 0) and len(revs) < marcas["revision"] * 0.5:
        avisos.append(
            f"Solo {len(revs)} de {marcas['revision']} menciones de 'revision' "
            "quedaron ligadas a una votacion."
        )
    return avisos


# ---------------------------------------------------------------- fuente

def bajar_subtitulo(video_id: str):
    """Pista de subtitulo automatico en español. Se cachea en data/raw/."""
    SUBTITULOS.mkdir(parents=True, exist_ok=True)
    cache = SUBTITULOS / f"{video_id}.json3"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8")), True

    try:
        import yt_dlp
    except ImportError:
        raise SystemExit("Falta yt-dlp. Instalar con:  python -m pip install yt-dlp")

    opciones = {"quiet": True, "no_warnings": True, "skip_download": True,
                "extractor_args": {"youtube": {"lang": ["es"]}}}
    with yt_dlp.YoutubeDL(opciones) as y:
        info = y.extract_info(f"https://www.youtube.com/watch?v={video_id}",
                              download=False)
        pistas = info.get("automatic_captions") or {}
        pista = pistas.get("es") or pistas.get("es-orig") or []
        url = next((f["url"] for f in pista if f.get("ext") == "json3"), None)
        if not url:
            return None, False
        crudo = y.urlopen(url).read().decode("utf-8")

    cache.write_text(crudo, encoding="utf-8")
    return json.loads(crudo), False


def procesar_video(video_id: str) -> dict:
    json3, del_cache = bajar_subtitulo(video_id)
    if json3 is None:
        return {"video_id": video_id, "sin_subtitulo": True, "votaciones": [],
                "advertencias": ["El video no tiene subtitulo automatico en español."]}

    texto, indice, mapa = texto_continuo(json3)
    votaciones, marcas = extraer(texto, mapa, indice)
    return {
        "video_id": video_id,
        "sin_subtitulo": False,
        "del_cache": del_cache,
        "caracteres": len(texto),
        "marcas_del_ritual": marcas,
        "votaciones": votaciones,
        "advertencias": revisar(votaciones, marcas),
    }


def main() -> int:
    args = sys.argv[1:]
    indice_path = PROCESADO / "sesiones.json"
    if not indice_path.exists():
        raise SystemExit(
            "Falta data/processed/sesiones.json. Correr antes:\n"
            "    python etl/fetch_sesiones.py"
        )
    indice = json.loads(indice_path.read_text(encoding="utf-8"))
    sesiones = indice["sesiones"]

    if "--video" in args:
        pedido = args[args.index("--video") + 1]
        sesiones = [s for s in sesiones
                    if any(v["video_id"] == pedido for v in s["videos"])]
        if not sesiones:
            sesiones = [{"tipo": None, "numero": None, "fecha": None,
                         "videos": [{"video_id": pedido, "titulo": "(suelto)"}]}]
    elif "--todas" not in args:
        n = 3
        if "--ultimas" in args:
            n = int(args[args.index("--ultimas") + 1])
        sesiones = sesiones[-n:]

    print(f"Sesiones a procesar: {len(sesiones)}")
    salida, avisos_todos = [], []
    for s in sesiones:
        etiqueta = (f"{s['tipo']} #{s['numero']} ({s['fecha']})"
                    if s["tipo"] else s["videos"][0]["video_id"])
        votaciones, avisos, marcas = [], [], Counter()
        for v in s["videos"]:
            r = procesar_video(v["video_id"])
            for x in r["votaciones"]:
                x["video_id"] = v["video_id"]
            votaciones += r["votaciones"]
            avisos += [f"{etiqueta}: {a}" for a in r["advertencias"]]
            marcas.update(r.get("marcas_del_ritual") or {})

        aprobadas = sum(1 for v in votaciones if v["resultado"] == "aprobado")
        rechazadas = sum(1 for v in votaciones if v["resultado"] == "rechazado")
        presentes = [v["presentes"] for v in votaciones if v["presentes"]]

        salida.append({
            "tipo": s["tipo"], "numero": s["numero"], "fecha": s["fecha"],
            "videos": [v["video_id"] for v in s["videos"]],
            "total_votaciones": len(votaciones),
            "aprobadas": aprobadas,
            "rechazadas": rechazadas,
            "sin_resultado": len(votaciones) - aprobadas - rechazadas,
            "presentes_min": min(presentes) if presentes else None,
            "presentes_max": max(presentes) if presentes else None,
            "marcas_del_ritual": dict(marcas),
            "advertencias": avisos,
            "votaciones": votaciones,
        })
        avisos_todos += avisos

        detalle = ""
        if presentes:
            detalle = f" · presentes {min(presentes)}-{max(presentes)}"
        print(f"   {etiqueta:<34} {len(votaciones):>4} votaciones  "
              f"({aprobadas} aprobadas, {rechazadas} rechazadas){detalle}")

    # Una corrida parcial NO puede borrar lo ya extraido: se funde con lo que
    # haya en disco y solo se reemplazan las sesiones vueltas a procesar.
    destino = PROCESADO / "votaciones.json"
    if destino.exists():
        previo = json.loads(destino.read_text(encoding="utf-8"))
        nuevas = {(s["tipo"], s["numero"], s["fecha"]) for s in salida}
        conservadas = [
            s for s in previo.get("sesiones", [])
            if (s["tipo"], s["numero"], s["fecha"]) not in nuevas
        ]
        if conservadas:
            print(f"   (se conservan {len(conservadas)} sesiones ya extraidas)")
        salida = sorted(salida + conservadas,
                        key=lambda s: (s["fecha"] or "", s["tipo"] or "",
                                       s["numero"] or 0))

    total = sum(s["total_votaciones"] for s in salida)
    doc = {
        "_fuente": "Subtitulo automatico de las transmisiones del Plenario "
                   "(canal oficial de la Asamblea Legislativa).",
        "_extraido": ahora_iso(),
        "_nota": (
            "Totales cantados por la Presidencia y transcritos automaticamente "
            "por YouTube. NO incluye el voto por persona: eso esta en el "
            "tablero, que es imagen. Dato de trabajo, aun no publicable: falta "
            "el contraste contra el tablero y contra la lista de mociones."
        ),
        "_publicable": False,
        "sesiones": salida,
        "total_votaciones": total,
        "advertencias": avisos_todos,
    }
    PROCESADO.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(doc, ensure_ascii=False, indent=2),
                       encoding="utf-8")

    print(f"\n  {total} votaciones en {len(salida)} sesiones")
    if avisos_todos:
        print(f"\n  ADVERTENCIAS ({len(avisos_todos)}) -- se reportan, no se corrigen:")
        for a in avisos_todos[:20]:
            print(f"      - {a}")
        if len(avisos_todos) > 20:
            print(f"      ... y {len(avisos_todos) - 20} mas en el JSON")
    else:
        print("\n  Sin advertencias.")

    kb = destino.stat().st_size // 1024
    print(f"\n  -> data/processed/votaciones.json ({kb} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
