"""
Refresco del sitio en un solo paso: corre el ETL en orden y deja un informe.

Pensado para correr solo, una vez al dia (ver docs/test-playbook.md para
programarlo). Hace lo que antes habia que hacer a mano:

    fetch_diputados   padron oficial (detecta altas, bajas o cambios)
    fetch_directorio  Directorio Legislativo
    fetch_actividad   leyes, mociones e intervenciones
    fetch_gasto       remuneracion y combustible por diputacion
    fetch_actas       actas nuevas del Plenario y las que seguian sin texto
    publish_web       payload del sitio

Con --completo agrega fotos, banderas y colores (cambian muy poco).

Reglas, las mismas del resto del ETL:

- Un paso que falla detiene todo: preferimos el ultimo dato bueno a publicar
  datos a medias. El sitio sigue mostrando lo anterior, con su fecha.
- Nada se corrige solo. Lo que pide ojo humano (otra cantidad de
  diputaciones, nombres de acta sin resolver, votaciones no publicables) se
  reporta y el script termina con codigo 2, para que el programador de tareas
  lo marque como "requiere atencion".

El SharePoint de la Asamblea (www.asamblea.go.cr) solo acepta conexiones
desde Costa Rica; el SIL+ responde desde cualquier lado (ADR-024). Por eso
se puede correr por fuente: la nube corre `--fuentes sil` y una computadora
en el pais corre `--fuentes sharepoint`.

Uso:
    python etl/actualizar.py
    python etl/actualizar.py --completo
    python etl/actualizar.py --fuentes sil          # solo actas (asi corre la nube)
    python etl/actualizar.py --fuentes sharepoint   # todo lo demas
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Programada, la tarea corre sin consola: se fija utf-8 aqui para no depender
# de PYTHONIOENCODING (los nombres de las actas traen tildes).
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = Path(__file__).resolve().parent.parent
ETL = RAIZ / "etl"
PROCESADO = RAIZ / "data" / "processed"
BITACORA = RAIZ / "data" / "bitacora"

# Las actas tardan en publicarse: se revisa una ventana hacia atras para
# levantar las que el dia anterior todavia no tenian texto.
VENTANA_ACTAS_DIAS = 14

# Con las fuentes repartidas entre la nube y una computadora en el pais, una
# parte puede quedarse vieja sin que nada falle. Pasado este plazo se avisa.
VIGENCIA_DIAS = 7


def pasos(completo: bool, fuentes: str) -> list[list[str]]:
    desde = (date.today() - timedelta(days=VENTANA_ACTAS_DIAS)).isoformat()
    lista = []
    if fuentes in ("todas", "sharepoint"):
        lista += [["fetch_diputados.py"], ["fetch_directorio.py"]]
        if completo:
            lista += [["fetch_assets.py"], ["derive_colores.py"]]
        lista += [["fetch_actividad.py"], ["fetch_gasto.py"]]
    if fuentes in ("todas", "sil"):
        lista += [["fetch_actas.py", "--desde", desde, "--solo-nuevas"]]
    lista += [["publish_web.py"]]
    return lista


def correr(paso: list[str], registro) -> bool:
    entorno = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    inicio = datetime.now()
    r = subprocess.run([sys.executable, str(ETL / paso[0]), *paso[1:]], cwd=RAIZ,
                       env=entorno, capture_output=True, text=True, encoding="utf-8")
    segundos = (datetime.now() - inicio).seconds
    registro.write(f"\n===== {' '.join(paso)} ({segundos} s, codigo {r.returncode}) =====\n")
    registro.write(r.stdout)
    if r.stderr:
        registro.write("\n--- stderr ---\n" + r.stderr)
    estado = "ok" if r.returncode == 0 else f"FALLO (codigo {r.returncode})"
    print(f"  {' '.join(paso):<45} {segundos:>4} s  {estado}")
    return r.returncode == 0


def revisar() -> list[str]:
    """Lo que necesita ojo humano despues de una corrida exitosa."""
    avisos = []
    dips = json.loads((PROCESADO / "diputados.json").read_text(encoding="utf-8"))
    if len(dips["diputados"]) != 57:
        avisos.append(f"El padron trae {len(dips['diputados'])} diputaciones, no 57.")
    for a in dips.get("advertencias") or []:
        avisos.append(f"Padron: {a}")

    gasto = json.loads((PROCESADO / "gasto.json").read_text(encoding="utf-8"))
    for nombre, veces in gasto.get("variantes_sin_resolver", {}).items():
        avisos.append(f"Nombre en datos de gasto sin resolver «{nombre}» ({veces} archivos).")
    for a in gasto.get("avisos", []):
        if "resueltas, no 57" not in a:  # ya cubierto por el aviso del nombre
            avisos.append(f"Gasto: {a}")

    actas = json.loads((PROCESADO / "actas_plenario.json").read_text(encoding="utf-8"))
    for variante, info in actas.get("variantes_sin_resolver", {}).items():
        avisos.append(
            f"Nombre de acta sin resolver «{variante}» ({info['veces']} veces), "
            f"candidatos {info['candidatos']}: revisar y, si es inequivoco, agregarlo a "
            "data/curated/equivalencias_nombres.json."
        )
    r = actas["resumen"]
    if r["votaciones"] != r["votaciones_publicables"]:
        avisos.append(f"{r['votaciones'] - r['votaciones_publicables']} votaciones no publicables.")
    # Se mira el indice del SIL+, no `sin_documento`: ese solo cubre la
    # ventana de esta corrida, y un acta que nunca trae texto saldria de la
    # ventana sin que nadie se entere.
    procesadas = {str(s["sil"]["Id_Orden_Dia"]) for s in actas["sesiones"]}
    indice = json.loads((RAIZ / "data" / "raw" / "actas" / "indice_sil.json")
                        .read_text(encoding="utf-8"))
    limite = (date.today() - timedelta(days=VENTANA_ACTAS_DIAS)).isoformat()
    viejas = []
    for f in indice:
        d, m, a = f["Fecha_Sesion"][:10].split("/")
        if str(f["Id_Orden_Dia"]) not in procesadas and f"{a}-{m}-{d}" < limite:
            viejas.append(f"{f['Nombre_Tipo'].lower()} #{f['Numero_Sesion_1']} ({a}-{m}-{d})")
    if viejas:
        avisos.append(f"Actas que llevan mas de {VENTANA_ACTAS_DIAS} dias sin texto: {viejas}.")

    # Lo que esta corrida no refresco puede llevar dias sin actualizarse.
    actividad = json.loads((PROCESADO / "actividad.json").read_text(encoding="utf-8"))
    ahora = datetime.now(timezone.utc)
    for nombre, cuando, como in (
        ("Padron", dips.get("generado"), "--fuentes sharepoint"),
        ("Actividad legislativa", actividad.get("generado"), "--fuentes sharepoint"),
        ("Gasto", gasto.get("_extraido"), "--fuentes sharepoint"),
        ("Actas", actas.get("_extraido"), "--fuentes sil"),
    ):
        if cuando and (ahora - datetime.fromisoformat(cuando)).days > VIGENCIA_DIAS:
            donde = (" en una computadora en Costa Rica: el SharePoint no responde "
                     "desde fuera del pais (ADR-024)") if "sharepoint" in como else ""
            avisos.append(f"{nombre}: sin actualizar desde {cuando[:10]} (mas de "
                          f"{VIGENCIA_DIAS} dias). Correr `python etl/actualizar.py "
                          f"{como}`{donde}.")
    return avisos


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--completo", action="store_true",
                    help="tambien fotos, banderas y colores (cambian muy poco)")
    ap.add_argument("--fuentes", choices=("todas", "sil", "sharepoint"), default="todas",
                    help="que fuentes consultar (la nube solo alcanza el SIL+)")
    args = ap.parse_args()
    BITACORA.mkdir(parents=True, exist_ok=True)
    ruta = BITACORA / f"actualizacion-{datetime.now():%Y-%m-%d_%H%M}.log"
    print(f"Actualizacion del {datetime.now():%Y-%m-%d %H:%M} (fuentes: {args.fuentes})"
          f"{' (completa)' if args.completo else ''}")
    with ruta.open("w", encoding="utf-8") as registro:
        for paso in pasos(args.completo, args.fuentes):
            if not correr(paso, registro):
                print(f"\n  Se detuvo en {paso[0]}. El sitio sigue con el ultimo dato bueno.")
                print(f"  Detalle: {ruta.relative_to(RAIZ)}")
                return 1
        avisos = revisar()
        registro.write("\n===== REVISION =====\n" + "\n".join(avisos or ["sin avisos"]) + "\n")

    actas = json.loads((PROCESADO / "actas_plenario.json").read_text(encoding="utf-8"))["resumen"]
    print(f"\n  {actas['sesiones']} sesiones con acta · {actas['votaciones']} votaciones "
          f"· hasta {actas['hasta']}")
    if avisos:
        print(f"\n  REQUIERE ATENCION ({len(avisos)}):")
        for a in avisos:
            print(f"      - {a}")
        print(f"\n  Bitacora: {ruta.relative_to(RAIZ)}")
        return 2
    print("  Sin avisos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
