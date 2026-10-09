"""
Indice de sesiones del Plenario desde el canal oficial de la Asamblea.

La Asamblea transmite cada sesion en YouTube y deja la grabacion publicada. Ese
archivo es hoy el unico registro completo y al dia de lo que pasa en el
Plenario: en pantalla se ve quien esta, quien vota y como vota. Antes de poder
leer nada de eso hace falta saber QUE sesiones existen, y eso es lo unico que
hace este script: arma el indice.

**No descarga video ni audio.** Lee los metadatos publicos del canal -- titulo,
duracion, identificador -- igual que quien abre la pagina del canal en el
navegador.

El numero y la fecha de sesion salen del TITULO que pone la propia Asamblea. Y
los titulos vienen con desorden real: falta la almohadilla, "21mayo" sin
espacio, "Parte 2", "ordinario" donde va "ordinaria". El parseo es tolerante
con la forma, pero lo que no calza NO se adivina: se reporta y queda listado en
`sin_parsear` para que lo vea un humano.

Uso:
    python etl/fetch_sesiones.py             # solo el periodo 2026-2030
    python etl/fetch_sesiones.py --todo      # tambien el periodo anterior
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.sharepoint import ahora_iso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PROCESADO = RAIZ / "data" / "processed"
CRUDO = RAIZ / "data" / "raw"

# Canal oficial. El identificador se confirmo desde una transmision conocida
# (dzBsCitMFAo, Sesion Ordinaria #58): channel_id y uploader_url coinciden.
CANAL_ID = "UCWN0rIWneMdqRmZ4yHs5GuA"
CANAL_ARROBA = "https://www.youtube.com/@AsambleaCRC"
# La pestana /streams trae las transmisiones. /videos trae notas de prensa
# cortas y no sirve para esto.
TRANSMISIONES = f"https://www.youtube.com/channel/{CANAL_ID}/streams"

# YouTube devuelve los titulos traducidos al idioma del cliente. Sin forzar el
# español llegan en ingles y el patron de titulo no calza con nada.
IDIOMA = ["es"]

# Cuantas transmisiones se recorren. El canal publica plenario y comisiones
# mezclados: ~700 entradas cubren el periodo actual completo y parte del
# anterior. Si algun dia no alcanza, el script lo avisa.
TOPE_TRANSMISIONES = 700

# El periodo 2026-2030 arranca el 1 de mayo de 2026 (art. 116 constitucional).
INICIO_PERIODO = "2026-05-01"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "setiembre": 9, "septiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

FECHA = re.compile(r"(\d{1,2})\s*([A-Za-zÁÉÍÓÚáéíóú]+)\.?\s*(\d{4})")
TIPO = re.compile(r"(extraordinari\w*|ordinari\w*|solemne)", re.I)
NUMERO_ALMOHADILLA = re.compile(r"#\s*(\d+)")
NUMERO_SUELTO = re.compile(r"sesi[oó]n\s+\w+\s+(\d+)\b", re.I)
PARTE = re.compile(r"parte\s*(\d+)", re.I)


def es_plenario(titulo: str) -> bool:
    return titulo.strip().lower().startswith("plenario legislativo")


def normalizar_tipo(bruto: str | None) -> str | None:
    """'Ordinario', 'ordinari' y 'Ordinaria' son el mismo tipo mal escrito."""
    if not bruto:
        return None
    b = bruto.lower()
    if b.startswith("extraordinari"):
        return "extraordinaria"
    if b.startswith("ordinari"):
        return "ordinaria"
    if b.startswith("solemne"):
        return "solemne"
    return None


def leer_fecha(titulo: str) -> str | None:
    """Ultima fecha reconocible del titulo, en ISO. None si no hay ninguna."""
    encontrada = None
    for m in FECHA.finditer(titulo):
        mes = MESES.get(m.group(2).lower())
        if not mes:
            continue
        dia, anio = int(m.group(1)), int(m.group(3))
        if 1 <= dia <= 31:
            encontrada = f"{anio:04d}-{mes:02d}-{dia:02d}"
    return encontrada


def interpretar(entrada: dict) -> dict:
    """Convierte una entrada del canal en un registro de sesion.

    Lo que no se puede leer queda en None y el registro se marca
    `completo: False`. Nada se rellena con un valor plausible.
    """
    titulo = (entrada.get("title") or "").strip()

    m = TIPO.search(titulo)
    tipo = normalizar_tipo(m.group(1) if m else None)
    fecha = leer_fecha(titulo)

    numero = None
    m = NUMERO_ALMOHADILLA.search(titulo)
    if m:
        numero = int(m.group(1))
    else:
        m = NUMERO_SUELTO.search(titulo)
        if m:
            numero = int(m.group(1))

    m = PARTE.search(titulo)
    parte = int(m.group(1)) if m else None

    vid = entrada.get("id")
    return {
        "video_id": vid,
        "url": f"https://www.youtube.com/watch?v={vid}",
        "titulo": titulo,
        "tipo": tipo,
        "numero": numero,
        "parte": parte,
        "fecha": fecha,
        "_fecha_tomada_de": "titulo de la transmision",
        "duracion_s": entrada.get("duration"),
        "vistas": entrada.get("view_count"),
        "completo": bool(tipo and fecha and (numero or tipo == "solemne")),
    }


def agrupar(videos: list[dict]) -> list[dict]:
    """Junta en una sola sesion los videos que comparten tipo y numero.

    Una sesion puede ocupar mas de un video, y es normal: se suspende y sigue
    al dia siguiente (la extraordinaria #21 va del 1 al 2 de setiembre), o la
    transmision se corta y la reabren. Tratar cada video como una sesion
    aparte inflaria la cuenta.

    El agrupamiento es DERIVADO: la Asamblea no declara en ninguna parte que
    dos videos sean la misma sesion. Se infiere de que ella misma les puso el
    mismo tipo y el mismo numero.
    """
    por_clave: dict[tuple, list[dict]] = defaultdict(list)
    for v in videos:
        por_clave[(v["tipo"], v["numero"])].append(v)

    sesiones = []
    for (tipo, numero), grupo in por_clave.items():
        grupo.sort(key=lambda v: (v["fecha"], v["parte"] or 0))
        fechas = sorted({v["fecha"] for v in grupo})
        sesiones.append({
            "tipo": tipo,
            "numero": numero,
            "fecha": fechas[0],
            "fecha_fin": fechas[-1] if len(fechas) > 1 else None,
            "duracion_s": sum(v["duracion_s"] or 0 for v in grupo),
            "videos": [
                {k: v[k] for k in ("video_id", "url", "titulo", "fecha",
                                   "parte", "duracion_s", "vistas")}
                for v in grupo
            ],
            "_agrupado_por": "tipo + numero declarados por la Asamblea en el titulo",
        })
    sesiones.sort(key=lambda s: (s["fecha"], s["tipo"], s["numero"] or 0))
    return sesiones


def huecos(sesiones: list[dict], tipo: str) -> list[int]:
    """Numeros que faltan en la secuencia. Se reportan, no se rellenan.

    Se cuenta desde 1: la numeracion reinicia con cada legislatura, y que el
    indice arranque en #3 significa que faltan las dos primeras, no que la
    Asamblea empiece a contar ahi.
    """
    nums = sorted({s["numero"] for s in sesiones
                   if s["tipo"] == tipo and s["numero"]})
    if not nums:
        return []
    return [n for n in range(1, max(nums) + 1) if n not in nums]


def bajar_indice(tope: int) -> list[dict]:
    try:
        import yt_dlp
    except ImportError:
        raise SystemExit("Falta yt-dlp. Instalar con:  python -m pip install yt-dlp")

    opciones = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",  # metadatos; no toca el video
        "playlistend": tope,
        "extractor_args": {"youtube": {"lang": IDIOMA}},
    }
    with yt_dlp.YoutubeDL(opciones) as y:
        catalogo = y.extract_info(TRANSMISIONES, download=False)
    return [e for e in (catalogo.get("entries") or []) if e.get("id")]


def main() -> int:
    todo = "--todo" in sys.argv

    print(f"Leyendo el indice de transmisiones de {CANAL_ARROBA} ...")
    entradas = bajar_indice(TOPE_TRANSMISIONES)
    print(f"      {len(entradas)} transmisiones en el catalogo")

    CRUDO.mkdir(parents=True, exist_ok=True)
    (CRUDO / "sesiones_youtube.json").write_text(
        json.dumps(entradas, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    plenario = [e for e in entradas if es_plenario(e.get("title") or "")]
    print(f"      {len(plenario)} son del Plenario")

    todas = [interpretar(e) for e in plenario]
    sin_parsear = [s for s in todas if not s["completo"]]
    videos = [s for s in todas if s["completo"]]

    anteriores = [v for v in videos if v["fecha"] < INICIO_PERIODO]
    if not todo:
        videos = [v for v in videos if v["fecha"] >= INICIO_PERIODO]

    sesiones = agrupar(videos)

    advertencias = []
    # El tope solo preocupa si el catalogo se corto DENTRO del alcance pedido.
    # Con 700 entradas se llega a 2025 y el periodo actual queda cubierto
    # entero; avisar igual seria ruido.
    mas_viejo = min((v["fecha"] for v in todas if v["fecha"]), default=None)
    if len(entradas) >= TOPE_TRANSMISIONES and (todo or not mas_viejo
                                                or mas_viejo > INICIO_PERIODO):
        advertencias.append(
            f"Se alcanzo el tope de {TOPE_TRANSMISIONES} transmisiones y la mas "
            f"vieja indexada es de {mas_viejo}: puede faltar material anterior. "
            "Subir TOPE_TRANSMISIONES."
        )
    for s in sin_parsear:
        # Un titulo ilegible del periodo anterior no es problema de este indice.
        if not todo and s["fecha"] and s["fecha"] < INICIO_PERIODO:
            continue
        advertencias.append(f"Titulo no interpretable: {s['titulo']}")

    partidas = [s for s in sesiones if len(s["videos"]) > 1]

    faltantes = {t: huecos(sesiones, t) for t in ("ordinaria", "extraordinaria")}
    for tipo, nums in faltantes.items():
        if nums:
            advertencias.append(
                f"Sin transmision indexada para {len(nums)} sesion(es) "
                f"{tipo}: {nums}"
            )

    por_tipo = Counter(s["tipo"] for s in sesiones)
    horas = round(sum(s["duracion_s"] or 0 for s in sesiones) / 3600, 1)
    total_videos = sum(len(s["videos"]) for s in sesiones)

    salida = {
        "_fuente": TRANSMISIONES,
        "_extraido": ahora_iso(),
        "_nota": (
            "Indice de las transmisiones del Plenario publicadas por la propia "
            "Asamblea. Numero, tipo y fecha se leen del titulo que ella misma "
            "escribe; no hay otra fuente estructurada. Los titulos que no se "
            "pudieron interpretar quedan en `sin_parsear`, sin completar."
        ),
        "canal": {
            "nombre": "Asamblea Legislativa Costa Rica",
            "id": CANAL_ID,
            "url": CANAL_ARROBA,
        },
        "periodo": None if todo else "2026-2030",
        "desde": None if todo else INICIO_PERIODO,
        "total": len(sesiones),
        "total_videos": total_videos,
        "por_tipo": dict(por_tipo),
        "horas_transmitidas": horas,
        "primera": sesiones[0]["fecha"] if sesiones else None,
        "ultima": sesiones[-1]["fecha"] if sesiones else None,
        "numeros_sin_transmision": faltantes,
        "sesiones_en_varios_videos": [
            {"tipo": s["tipo"], "numero": s["numero"], "fecha": s["fecha"],
             "fecha_fin": s["fecha_fin"],
             "videos": [v["video_id"] for v in s["videos"]]}
            for s in partidas
        ],
        "sin_parsear": [
            {"video_id": s["video_id"], "titulo": s["titulo"]} for s in sin_parsear
        ],
        "advertencias": advertencias,
        "sesiones": sesiones,
    }

    PROCESADO.mkdir(parents=True, exist_ok=True)
    destino = PROCESADO / "sesiones.json"
    destino.write_text(
        json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    alcance = "todo el archivo" if todo else "periodo 2026-2030"
    print()
    print(f"  Sesiones del Plenario ({alcance}): {len(sesiones)}"
          f" en {total_videos} videos")
    for tipo, n in sorted(por_tipo.items()):
        ns = [s["numero"] for s in sesiones if s["tipo"] == tipo and s["numero"]]
        rango = f"  (#{min(ns)} a #{max(ns)})" if ns else ""
        print(f"      {tipo:<16} {n:>4}{rango}")
    print(f"      {horas} horas transmitidas")
    if sesiones:
        print(f"      de {sesiones[0]['fecha']} a {sesiones[-1]['fecha']}")
    if not todo and anteriores:
        print(f"      ({len(anteriores)} videos del periodo anterior, fuera del indice)")
    for s in partidas:
        tramos = " + ".join(f"{v['fecha']} ({round((v['duracion_s'] or 0)/60)} min)"
                            for v in s["videos"])
        print(f"      {s['tipo']} #{s['numero']} en {len(s['videos'])} videos: {tramos}")

    if advertencias:
        print(f"\n  ADVERTENCIAS ({len(advertencias)}) -- se reportan, no se corrigen:")
        for a in advertencias:
            print(f"      - {a}")
    else:
        print("\n  Sin advertencias.")

    kb = destino.stat().st_size // 1024
    print(f"\n  -> data/processed/sesiones.json ({kb} KB)")
    print("  -> data/raw/sesiones_youtube.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
