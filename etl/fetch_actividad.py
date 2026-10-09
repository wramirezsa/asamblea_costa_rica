"""
Extrae la actividad legislativa que la Asamblea SI mantiene al dia.

Se auditaron todas las listas grandes y la mayoria esta abandonada (ver
docs/fuentes-de-datos.md). Solo tres siguen recibiendo registros en 2026, y
son las que se extraen aqui:

    glcp/res_de_leyes                    leyes aprobadas, con resumen
    glcp/mociones_total                  mociones por expediente, con resultado
    Diputados/intervenciones_2026_2030   intervenciones, un archivo por
                                         diputacion y mes

De cada conjunto se guarda su ULTIMA ACTUALIZACION real, tomada del campo
`Modified` mas reciente de la propia fuente. No es la fecha en que corrimos el
ETL: es la fecha en que la Asamblea toco el dato por ultima vez. Esa distincion
importa, porque deja ver cuando un conjunto deja de alimentarse.

Uso:
    python etl/fetch_actividad.py
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.sharepoint import (  # noqa: E402
    ahora_iso,
    html_a_texto,
    limpiar,
    obtener_lista,
    valor_url,
)

RAIZ = Path(__file__).resolve().parent.parent
PROCESADO = RAIZ / "data" / "processed"
CRUDO = RAIZ / "data" / "raw"

# Cuantos registros recientes se conservan para mostrar. Los agregados se
# calculan sobre todo lo descargado, no solo sobre esta muestra.
LEYES_RECIENTES = 60
MOCIONES_TOPE = 30000  # la lista completa cabe; no se muestrea
MOCIONES_RECIENTES = 40


def ultima_actualizacion(items: list[dict]) -> str | None:
    """La fecha mas reciente en que la fuente toco alguno de sus registros."""
    fechas = [i.get("Modified") for i in items if i.get("Modified")]
    return max(fechas) if fechas else None


def leyes() -> dict:
    items, url = obtener_lista(
        "glcp", "res_de_leyes", orden="Modified desc", top=2000
    )
    por_año = Counter((i.get("Created") or "????")[:4] for i in items)

    recientes = []
    for i in items[:LEYES_RECIENTES]:
        numero = i.get("Nombre_x0020_de_x0020_la_x0020_L")
        resumen = html_a_texto(i.get("Resumen_x0020_de_x0020_la_x0020_"))
        recientes.append(
            {
                "numero": str(int(numero)) if isinstance(numero, float) else numero,
                "titulo": limpiar(i.get("Title")),
                "resumen": resumen[:420] if resumen else None,
                "publicada": i.get("Created"),
            }
        )
    return {
        "_fuente": url,
        "total": len(items),
        "ultima_actualizacion": ultima_actualizacion(items),
        "por_anio": dict(sorted(por_año.items())),
        "recientes": recientes,
    }


def mociones() -> dict:
    # La lista completa entra sin problema, asi que los agregados se calculan
    # sobre el historico entero y no sobre una muestra.
    items, url = obtener_lista(
        "glcp", "mociones_total", orden="Id desc", top=MOCIONES_TOPE
    )
    calif = Counter(limpiar(i.get("Calificaci_x00f3_n")) or "sin dato" for i in items)
    por_año = Counter((i.get("Created") or "????")[:4] for i in items)
    expedientes = {
        i.get("N_x00fa_mero_x0020_Proyecto_x0020_Ley")
        for i in items
        if i.get("N_x00fa_mero_x0020_Proyecto_x0020_Ley")
    }

    def expediente(v) -> str | None:
        if v is None:
            return None
        return str(int(v)) if isinstance(v, float) else str(v)

    recientes = [
        {
            "numero": limpiar(i.get("N_x00fa_mero_x0020_de_x0020_moci_x00f3_n")),
            "expediente": expediente(i.get("N_x00fa_mero_x0020_Proyecto_x0020_Ley")),
            "resultado": limpiar(i.get("Calificaci_x00f3_n")),
            "asunto": limpiar(i.get("Asunto")),
            "tramite": limpiar(i.get("Tr_x00e1_mite")),
            "fecha": i.get("Created"),
        }
        for i in items[:MOCIONES_RECIENTES]
    ]
    return {
        "_fuente": url,
        "total": len(items),
        "nota_alcance": (
            "Agregados calculados sobre las {} mociones que devuelve la lista "
            "completa, no sobre una muestra."
        ).format(len(items)),
        "ultima_actualizacion": ultima_actualizacion(items),
        "por_resultado": dict(calif.most_common()),
        "por_anio": dict(sorted(por_año.items())),
        "expedientes_distintos": len(expedientes),
        "recientes": recientes,
    }


def intervenciones(dips: list[dict]) -> dict:
    items, url = obtener_lista(
        "Diputados",
        "intervenciones_2026_2030",
        select="Id,DiputadoId,FileLeafRef,FileRef,Modified,Created",
        orden="Modified desc",
    )
    por_id = {d["id"]: d for d in dips}
    avisos: list[str] = []
    por_slug: dict[str, list[dict]] = {}

    for i in items:
        dip = por_id.get(i.get("DiputadoId"))
        if not dip:
            avisos.append(f"archivo sin diputacion conocida: {i.get('FileLeafRef')}")
            continue
        archivo = i.get("FileLeafRef") or ""
        # Los nombres tienen forma "Nombre Apellido-julio 2026.docx".
        m = re.search(r"-\s*([a-zA-ZáéíóúñÁÉÍÓÚÑ]+\s+\d{4})", archivo)
        por_slug.setdefault(dip["slug"], []).append(
            {
                "archivo": archivo,
                "periodo": m.group(1).strip() if m else None,
                "url": f"https://www.asamblea.go.cr{i.get('FileRef')}"
                if i.get("FileRef")
                else None,
                "modificado": i.get("Modified"),
            }
        )

    sin_intervenciones = [d["slug"] for d in dips if d["slug"] not in por_slug]
    return {
        "_fuente": url,
        "total": len(items),
        "ultima_actualizacion": ultima_actualizacion(items),
        "diputaciones_con_registro": len(por_slug),
        "sin_registro": sin_intervenciones,
        "avisos": avisos,
        "por_diputacion": por_slug,
    }


def main() -> int:
    padron = PROCESADO / "diputados.json"
    if not padron.exists():
        print("Falta data/processed/diputados.json. Corre: python etl/fetch_diputados.py")
        return 1
    dips = json.loads(padron.read_text(encoding="utf-8"))["diputados"]

    print("[1/3] Leyes aprobadas...")
    l = leyes()
    print(f"      {l['total']} leyes · última actualización {l['ultima_actualizacion'][:10]}")

    print("[2/3] Mociones...")
    m = mociones()
    print(f"      {m['total']} mociones · última actualización {m['ultima_actualizacion'][:10]}")
    print(f"      resultados: {m['por_resultado']}")

    print("[3/3] Intervenciones por diputación...")
    iv = intervenciones(dips)
    print(
        f"      {iv['total']} documentos · {iv['diputaciones_con_registro']} de "
        f"{len(dips)} diputaciones · última actualización "
        f"{iv['ultima_actualizacion'][:10]}"
    )
    if iv["sin_registro"]:
        print(f"      sin registro: {', '.join(iv['sin_registro'])}")

    salida = {
        "generado": ahora_iso(),
        "nota": (
            "Solo se incluyen conjuntos que la Asamblea mantiene al día. Cada uno "
            "trae su propia fecha de última actualización, tomada de la fuente."
        ),
        "leyes": l,
        "mociones": m,
        "intervenciones": iv,
    }
    PROCESADO.mkdir(parents=True, exist_ok=True)
    (PROCESADO / "actividad.json").write_text(
        json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    kb = (PROCESADO / "actividad.json").stat().st_size // 1024
    print(f"\n  -> data/processed/actividad.json ({kb} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
