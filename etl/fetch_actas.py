"""
Actas del Plenario desde el SIL+: presentes y voto nominal por sesion.

Es la fuente OFICIAL del voto de cada diputacion (ADR-021). Por cada sesion
del periodo se baja el texto del acta (.docx) y se extrae:

- la lista de presentes, que es la asistencia de esa sesion;
- cada votacion con lista nominal: que se voto, quien voto a favor, quien en
  contra y quien estando presente no voto.

Validaciones, todas reportadas y ninguna corregida:

- En cada seccion, el total que declara el acta = los nombres que lista.
- Todo nombre se resuelve contra el padron, exacto o por la tabla curada
  `data/curated/equivalencias_nombres.json`. Nunca por parecido.
- Nadie aparece dos veces en una misma votacion; nunca mas de 57 nombres.
- El encabezado del acta (tipo, numero, fecha) coincide con la fila del SIL+.
- Se compara lo que canto la Presidencia con la lista, y cuantas votaciones
  tiene el acta contra las que encontro el subtitulo de la transmision.

Una votacion con problemas queda marcada `publicable: false` con su motivo.

Uso:
    python etl/fetch_actas.py                          # todo el periodo
    python etl/fetch_actas.py --desde 2026-08-24 --hasta 2026-08-28
    python etl/fetch_actas.py --sin-descargar          # solo reprocesa lo bajado
    python etl/fetch_actas.py --refrescar              # vuelve a bajar todo
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from collections import Counter
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.acta import Resolutor, leer_acta  # noqa: E402
from lib.sharepoint import FuenteError, ahora_iso  # noqa: E402
from lib.sil import BASE, ClienteSIL  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
CRUDO = RAIZ / "data" / "raw" / "actas"
PROCESADO = RAIZ / "data" / "processed"
EQUIVALENCIAS = RAIZ / "data" / "curated" / "equivalencias_nombres.json"

INICIO_PERIODO = date(2026, 5, 1)
FALLAS_SEGUIDAS_TOPE = 3  # a la tercera descarga fallida seguida, se aborta

CODIGO = {"favor": "F", "contra": "C", "no_votacion": "N"}


def fecha_fila(fila: dict) -> str:
    """'27/08/2026 00:00:00' -> '2026-08-27'."""
    d, m, a = fila["Fecha_Sesion"][:10].split("/")
    return f"{a}-{m}-{d}"


def clave(fila: dict) -> str:
    return str(fila["Id_Orden_Dia"])


def cargar_indice() -> dict[str, dict]:
    ruta = CRUDO / "indice_sil.json"
    if ruta.exists():
        return {clave(f): f for f in json.loads(ruta.read_text(encoding="utf-8"))}
    return {}


def guardar_indice(indice: dict[str, dict]) -> None:
    filas = sorted(indice.values(), key=lambda f: (fecha_fila(f), f["Nombre_Tipo"], f["Numero_Sesion_1"]))
    (CRUDO / "indice_sil.json").write_text(
        json.dumps(filas, ensure_ascii=False, indent=1), encoding="utf-8")


def votaciones_del_subtitulo() -> dict[tuple, int]:
    """Cuantas votaciones encontro el subtitulo por sesion (solo para contrastar)."""
    ruta = PROCESADO / "votaciones.json"
    if not ruta.exists():
        return {}
    d = json.loads(ruta.read_text(encoding="utf-8"))
    return {(s["tipo"], s["numero"], s["fecha"]): s["total_votaciones"] for s in d["sesiones"]}


def procesar(fila: dict, docx: bytes, resolutor: Resolutor, orden: list[str],
             subtitulo: dict[tuple, int]) -> dict:
    acta = leer_acta(docx, resolutor)
    tipo_sil = fila["Nombre_Tipo"].lower()
    avisos = list(acta["avisos"])

    if (acta["tipo"], acta["numero"], acta["fecha"]) != (tipo_sil, fila["Numero_Sesion_1"], fecha_fila(fila)):
        avisos.append(
            f"El encabezado del acta ({acta['tipo']} #{acta['numero']}, {acta['fecha']}) no coincide "
            f"con la fila del SIL+ ({tipo_sil} #{fila['Numero_Sesion_1']}, {fecha_fila(fila)})."
        )

    posicion = {s: i for i, s in enumerate(orden)}
    votaciones = []
    for v in acta["votaciones"]:
        votos = ["-"] * len(orden)
        for seccion, slugs in v["slugs"].items():
            for s in slugs:
                if s is not None:
                    votos[posicion[s]] = CODIGO[seccion]
        registro = {
            "orden": v["orden"],
            "propuesta": v["propuesta"],
            "tipo_propuesta": v["tipo_propuesta"],
            "mocion": v["mocion"],
            "expediente": v["expediente"],
            "declarado": [v["declarado"][k] for k in ("favor", "contra", "no_votacion")],
            "votos": "".join(votos),
            # El resultado sale de lo que canto la Presidencia, y solo se acepta
            # si lo cantado coincide con la lista. Si no coincide (frase de
            # otra votacion, o la Presidencia se corrigio al hablar), queda en
            # None: no se deduce de los conteos porque el umbral depende de la
            # materia (mayoria simple o calificada).
            "resultado": (v["llamado"]["resultado"]
                          if (v["llamado"]["favor"], v["llamado"]["contra"])
                          == (v["declarado"]["favor"], v["declarado"]["contra"]) else None),
            "presentes_al_votar": v["llamado"]["presentes"],
            "frase": v["llamado"]["frase"],
            "publicable": v["publicable"],
        }
        # Solo se escriben cuando hay algo que decir: son miles de votaciones.
        if v["problemas"]:
            registro["problemas"] = v["problemas"]
        if v["observaciones"]:
            registro["observaciones"] = v["observaciones"]
        votaciones.append(registro)

    # Quien vota sin figurar en la lista de presentes. Puede ser real (llego
    # despues, o el acta lo omitio) o una lista mal leida: se reporta con la
    # linea donde se corto la lista, para poder distinguirlo.
    presentes = set(acta["presentes"])
    fuera = sorted({orden[i] for v in votaciones for i, c in enumerate(v["votos"])
                    if c != "-" and orden[i] not in presentes}) if presentes else []
    if fuera:
        avisos.append(
            f"{len(fuera)} diputacion(es) votaron sin figurar en la lista de presentes: {fuera}. "
            f"La lista termina antes de: «{(acta['presentes_corte'] or '')[:60]}»."
        )

    n_sub = subtitulo.get((tipo_sil, fila["Numero_Sesion_1"], fecha_fila(fila)))
    contraste = None
    if n_sub is not None:
        contraste = {"votaciones_acta": len(votaciones), "votaciones_subtitulo": n_sub}
        if n_sub > len(votaciones):
            avisos.append(
                f"El subtitulo encontro {n_sub} votaciones y el acta lista {len(votaciones)}: "
                "puede faltar parte del acta."
            )

    return {
        "tipo": tipo_sil,
        "numero": fila["Numero_Sesion_1"],
        "fecha": fecha_fila(fila),
        "legislatura": fila.get("Legislatura"),
        "hora_inicio": fila.get("Hora_Inicial"),
        "hora_fin": fila.get("Hora_Final"),
        "sil": {k: fila.get(k) for k in ("IdSESION", "Id_Sesion", "Id_Orden_Dia")},
        "archivo": f"TextoActa_{fila['Id_Orden_Dia']}.docx",
        "sha256": hashlib.sha256(docx).hexdigest(),
        "bytes": len(docx),
        "directorio": acta["directorio"],
        "presentes": acta["presentes"],
        "presentes_en_texto": len(acta["presentes_texto"]),
        "votaron_sin_figurar_en_presentes": fuera,
        "votaciones": votaciones,
        "total_votaciones": len(votaciones),
        "votaciones_publicables": sum(1 for v in votaciones if v["publicable"]),
        "contraste_subtitulo": contraste,
        "sin_resolver": acta["sin_resolver"],
        "avisos": avisos,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--desde", type=date.fromisoformat, default=INICIO_PERIODO)
    ap.add_argument("--hasta", type=date.fromisoformat, default=date.today())
    ap.add_argument("--sin-descargar", action="store_true")
    ap.add_argument("--sin-listar", action="store_true",
                    help="usa el indice guardado; solo baja las actas que falten")
    ap.add_argument("--refrescar", action="store_true")
    ap.add_argument("--solo-nuevas", action="store_true",
                    help="no vuelve a bajar un acta ya procesada cuyo .docx no esta en "
                         "disco: se conserva lo procesado (asi corre en la nube)")
    args = ap.parse_args()

    CRUDO.mkdir(parents=True, exist_ok=True)
    padron = json.loads((PROCESADO / "diputados.json").read_text(encoding="utf-8"))["diputados"]
    equivalencias = json.loads(EQUIVALENCIAS.read_text(encoding="utf-8"))["equivalencias"]
    resolutor = Resolutor(padron, equivalencias)
    orden = sorted(d["slug"] for d in padron)

    indice = cargar_indice()
    cliente = None
    if not args.sin_descargar:
        cliente = ClienteSIL()
        cliente.abrir()
    if cliente and not args.sin_listar:
        print(f"SIL+: actas del Plenario del {args.desde} al {args.hasta} ...")
        filas = cliente.actas_plenario(args.desde, args.hasta)
        nuevas = sum(1 for f in filas if clave(f) not in indice)
        for f in filas:
            indice[clave(f)] = f
        guardar_indice(indice)
        print(f"      {len(filas)} sesiones en el SIL+ ({nuevas} nuevas en el indice)")

    en_rango = [f for f in indice.values()
                if args.desde.isoformat() <= fecha_fila(f) <= args.hasta.isoformat()]
    en_rango.sort(key=lambda f: (fecha_fila(f), f["Nombre_Tipo"], f["Numero_Sesion_1"]))

    destino = PROCESADO / "actas_plenario.json"
    procesadas = set()
    if args.solo_nuevas and destino.exists():
        procesadas = {str(s["sil"]["Id_Orden_Dia"]) for s in
                      json.loads(destino.read_text(encoding="utf-8")).get("sesiones", [])}

    subtitulo = votaciones_del_subtitulo()
    sesiones, sin_documento = [], []
    fallas_seguidas = conservadas = 0
    for f in en_rango:
        etiqueta = f"{f['Nombre_Tipo'].lower()} #{f['Numero_Sesion_1']} ({fecha_fila(f)})"
        archivo = CRUDO / f"TextoActa_{f['Id_Orden_Dia']}.docx"
        # En la nube los .docx no se guardan entre corridas (pesan hasta
        # 160 MB). Volver a bajar cada dia las actas de la ventana seria
        # cargar el servidor de la Asamblea para nada: lo ya procesado se
        # conserva tal cual por la fusion de abajo.
        if args.solo_nuevas and not archivo.exists() and clave(f) in procesadas:
            conservadas += 1
            continue
        # Un .docx que no es un zip valido quedo a medio escribir (corrida
        # interrumpida): se vuelve a bajar.
        incompleto = archivo.exists() and not zipfile.is_zipfile(archivo)
        if cliente and (args.refrescar or not archivo.exists() or incompleto):
            try:
                archivo.write_bytes(cliente.documento_acta(f))
                fallas_seguidas = 0
            except FuenteError as e:
                fallas_seguidas += 1
                sin_documento.append({"sesion": etiqueta, "motivo": str(e)})
                print(f"   {etiqueta:<34} SIN DOCUMENTO: {e}")
                if fallas_seguidas >= FALLAS_SEGUIDAS_TOPE:
                    raise SystemExit(
                        f"{FALLAS_SEGUIDAS_TOPE} descargas fallidas seguidas: se aborta. "
                        "Revisar el protocolo (ADR-021)."
                    )
                continue
        if not archivo.exists() or not zipfile.is_zipfile(archivo):
            sin_documento.append({"sesion": etiqueta, "motivo": "no descargada todavia o incompleta"})
            continue
        s = procesar(f, archivo.read_bytes(), resolutor, orden, subtitulo)
        sesiones.append(s)
        marca = "" if s["votaciones_publicables"] == s["total_votaciones"] else "  <- revisar"
        print(f"   {etiqueta:<34} {len(s['presentes']):>2} presentes  "
              f"{s['total_votaciones']:>4} votaciones ({s['votaciones_publicables']} publicables){marca}")

    if conservadas:
        print(f"   {conservadas} actas ya procesadas se conservan sin volver a bajarlas")

    # Fusion con lo ya procesado: una corrida parcial no borra el resto.
    previas = []
    if destino.exists():
        hechas = {str(s["sil"]["Id_Orden_Dia"]) for s in sesiones}
        previas = [s for s in json.loads(destino.read_text(encoding="utf-8")).get("sesiones", [])
                   if str(s["sil"]["Id_Orden_Dia"]) not in hechas]
    todas = sorted(previas + sesiones, key=lambda s: (s["fecha"], s["tipo"], s["numero"]))

    variantes = Counter()
    for s in todas:
        variantes.update(s["sin_resolver"])
    total_v = sum(s["total_votaciones"] for s in todas)
    publicables = sum(s["votaciones_publicables"] for s in todas)

    doc = {
        "_fuente": BASE + "Monitor/Principal — Consulta de actas → Actas - Plenario → Texto acta",
        "_extraido": ahora_iso(),
        "_nota": (
            "Actas oficiales del Plenario, redactadas por el Area de Actas, Sonido y "
            "Grabacion. Presentes y voto nominal leidos del texto del acta. Los nombres "
            "se resuelven contra el padron oficial; las variantes, con una tabla curada a "
            "mano. Solo las votaciones con publicable=true pasan al sitio."
        ),
        "orden_diputaciones": orden,
        "_campos_votacion": {
            "declarado": "[a favor, en contra, no votacion] tal como los declara el acta",
            "votos": "una letra por diputacion, en el orden de orden_diputaciones",
            "resultado": "lo que canto la Presidencia, transcrito en el acta",
            "presentes_al_votar": "lo que canto la Presidencia al cerrar puertas, si lo dijo",
        },
        "_codigo_votos": {
            "F": "a favor", "C": "en contra",
            "N": "no votacion: figura en la lista de la votacion pero no voto",
            "-": "no figura en la lista de esa votacion",
        },
        "equivalencias_de_nombres": str(EQUIVALENCIAS.relative_to(RAIZ)).replace("\\", "/"),
        "resumen": {
            "sesiones": len(todas),
            "desde": todas[0]["fecha"] if todas else None,
            "hasta": todas[-1]["fecha"] if todas else None,
            "votaciones": total_v,
            "votaciones_publicables": publicables,
            "sesiones_sin_votaciones": sum(1 for s in todas if not s["total_votaciones"]),
        },
        "sin_documento": sin_documento,
        "variantes_sin_resolver": {
            v: {"veces": n, "candidatos": resolutor.candidatos(v)} for v, n in variantes.most_common()
        },
        "sesiones": todas,
    }
    PROCESADO.mkdir(parents=True, exist_ok=True)
    # Cabecera legible y una sesion por linea: legible en un diff y diez veces
    # mas liviano que indentar miles de votaciones.
    sin_sesiones = {k: v for k, v in doc.items() if k != "sesiones"}
    cabecera = json.dumps(sin_sesiones, ensure_ascii=False, indent=1)
    salto = chr(10)
    lineas = ("," + salto).join(
        "  " + json.dumps(s, ensure_ascii=False, separators=(",", ":"))
        for s in doc["sesiones"])
    destino.write_text(
        cabecera[:-2] + "," + salto + ' "sesiones": [' + salto + lineas + salto + " ]" + salto + "}" + salto,
        encoding="utf-8")

    print()
    print(f"  {len(todas)} sesiones · {total_v} votaciones · {publicables} publicables "
          f"({total_v - publicables} con problemas)")
    if cliente:
        print(f"  pedidos al SIL+: {cliente.pedidos}")
    avisos = [(s["tipo"], s["numero"], s["fecha"], a) for s in todas for a in s["avisos"]]
    if avisos or variantes or sin_documento:
        print(f"\n  ADVERTENCIAS -- se reportan, no se corrigen:")
        for t, n, f, a in avisos[:25]:
            print(f"      - {t} #{n} ({f}): {a}")
        if len(avisos) > 25:
            print(f"      ... y {len(avisos) - 25} mas en el JSON")
        for v, n in variantes.most_common(15):
            print(f"      - nombre sin resolver «{v}» ({n} veces); candidatos: {resolutor.candidatos(v)}")
        for x in sin_documento[:10]:
            print(f"      - {x['sesion']}: sin documento ({x['motivo'][:90]})")
    else:
        print("\n  Sin advertencias.")
    kb = destino.stat().st_size // 1024
    print(f"\n  -> data/processed/actas_plenario.json ({kb} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
