"""
Extrae el padron oficial de diputaciones y fracciones desde asamblea.go.cr.

REGLA DE ORO DEL PROYECTO: no se inventa ni se completa ningun dato.
Si la fuente no lo trae, queda en null y el frontend lo muestra como
"sin dato oficial". Ver CLAUDE.md.

Uso:
    python etl/fetch_diputados.py
    python etl/fetch_diputados.py --periodo 2026-2030
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.sharepoint import (  # noqa: E402
    FuenteError,
    ahora_iso,
    limpiar,
    obtener_lista,
    texto_url,
    valor_url,
)

RAIZ = Path(__file__).resolve().parent.parent
CRUDO = RAIZ / "data" / "raw"
PROCESADO = RAIZ / "data" / "processed"

SITIO = "Diputados"
LISTA_DIPUTADOS = "Diputados_y_Diputadas_2026_2030"
LISTA_FRACCIONES = "Fracciones_2026-2030"
LISTA_FRACCIONES_INFO = "Fracciones"  # descripciones historicas de partidos

# Campos biograficos que la Asamblea publica como HTML enriquecido.
CAMPOS_BIO = {
    "EducacionHtml": "educacion",
    "ExperienciaLaboralHtml": "experiencia_laboral",
    "ExperienciaPoliticaHtml": "experiencia_politica",
    "PremiosReconocimientosHtml": "premios",
    "ParticipacionComunalHtml": "participacion_comunal",
    "PonenciasCongresosHtml": "ponencias",
    "PublicacionesHtml": "publicaciones",
    "AreasInteresHtml": "areas_interes",
}


def html_a_texto(html: str | None) -> str | None:
    """Convierte el HTML de SharePoint a texto plano legible, sin perder saltos."""
    if not html:
        return None
    t = re.sub(r"(?i)<\s*(br|/p|/div|/li|/tr)\s*/?>", "\n", html)
    t = re.sub(r"(?i)<\s*li[^>]*>", "• ", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = unescape(t).replace("​", "").replace("\xa0", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n\s*\n+", "\n\n", t)
    t = "\n".join(linea.strip() for linea in t.split("\n"))
    return t.strip() or None


def slug(nombre: str) -> str:
    base = nombre.lower()
    for a, b in [("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ü", "u"), ("ñ", "n")]:
        base = base.replace(a, b)
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")
    return base


def normalizar_diputado(it: dict, fuente: str, extraido: str) -> dict:
    nombre = limpiar(it.get("Title"))
    if not nombre:
        raise FuenteError(f"Registro sin nombre: id={it.get('Id')}")

    bio = {}
    bio_html = {}
    for campo, clave in CAMPOS_BIO.items():
        crudo = it.get(campo)
        bio[clave] = html_a_texto(crudo)
        bio_html[clave] = crudo or None

    return {
        "id": it.get("Id"),
        "slug": slug(nombre),
        "nombre": nombre,
        "cedula": limpiar(it.get("Cedula")),
        "partido_codigo": limpiar(it.get("Partido")),
        "fraccion": limpiar(it.get("FraccionParlamentaria")),
        "provincia": limpiar(it.get("Provincia")),
        "periodo": limpiar(it.get("PeriodoLegislativo")),
        "activo": bool(it.get("Activo")) if it.get("Activo") is not None else None,
        "foto_url": valor_url(it.get("Foto")),
        "fecha_nacimiento": limpiar(it.get("FechaNacimiento")),
        "lugar_nacimiento": limpiar(it.get("LugarNacimiento")),
        "profesion": limpiar(it.get("Profesion")),
        "estado_civil": limpiar(it.get("EstadoCivil")),
        "email_oficial": limpiar(it.get("EmailOficial")),
        "redes": {
            "facebook": valor_url(it.get("FacebookUrl")),
            "twitter": valor_url(it.get("TwitterUrl")),
            "instagram": valor_url(it.get("InstagramUrl")),
            "youtube": valor_url(it.get("YouTubeurl")),
            "tiktok": valor_url(it.get("TikTok")),
            "blog": valor_url(it.get("Blogurl")),
        },
        # Orden con que la Asamblea despliega las fichas en su web.
        # NO es el numero de curul. Ver docs/decisions.md ADR-003.
        "orden_web": it.get("PosicionPantalla"),
        "biografia": bio,
        "biografia_html": bio_html,
        "equipo_trabajo_html": it.get("EquipoTrabajo") or None,
        "_fuente": fuente,
        "_extraido": extraido,
        "_modificado_en_fuente": it.get("Modified"),
    }


def normalizar_fraccion(it: dict, fuente: str, extraido: str) -> dict:
    bandera = valor_url(it.get("Bandera"))
    codigo = None
    if bandera:
        codigo = Path(bandera).stem.replace("flag_", "").upper()
    return {
        "orden": it.get("Title"),
        "codigo": codigo,
        "nombre": texto_url(it.get("Fracci_x00f3_n")),
        "sitio": valor_url(it.get("Sitio_x0020_Fracci_x00f3_n")),
        "bandera_url": bandera,
        "estado": limpiar(it.get("Estado")),
        "_fuente": fuente,
        "_extraido": extraido,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--periodo", default="2026-2030")
    args = ap.parse_args()

    CRUDO.mkdir(parents=True, exist_ok=True)
    PROCESADO.mkdir(parents=True, exist_ok=True)
    extraido = ahora_iso()

    print(f"[1/3] Padron oficial de diputaciones ({args.periodo})...")
    dips_crudo, url_dips = obtener_lista(SITIO, LISTA_DIPUTADOS, orden="PosicionPantalla")
    (CRUDO / "diputados.json").write_text(
        json.dumps(dips_crudo, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    diputados = [normalizar_diputado(it, url_dips, extraido) for it in dips_crudo]
    print(f"      {len(diputados)} diputaciones")

    print("[2/3] Fracciones parlamentarias...")
    fr_crudo, url_fr = obtener_lista(SITIO, LISTA_FRACCIONES)
    (CRUDO / "fracciones.json").write_text(
        json.dumps(fr_crudo, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    fracciones = [normalizar_fraccion(it, url_fr, extraido) for it in fr_crudo]
    activas = [f for f in fracciones if f["estado"] == "Activo"]
    print(f"      {len(fracciones)} registros ({len(activas)} activas)")

    print("[3/3] Verificaciones de integridad...")
    problemas = []
    if len(diputados) != 57:
        problemas.append(f"Se esperaban 57 diputaciones, la fuente devolvio {len(diputados)}")
    sin_foto = [d["nombre"] for d in diputados if not d["foto_url"]]
    if sin_foto:
        problemas.append(f"{len(sin_foto)} sin foto oficial: {', '.join(sin_foto[:5])}")
    slugs = [d["slug"] for d in diputados]
    if len(set(slugs)) != len(slugs):
        problemas.append("Hay slugs duplicados; revisar homonimos")

    conteo: dict[str, int] = {}
    for d in diputados:
        c = d["partido_codigo"] or "SIN_PARTIDO"
        conteo[c] = conteo.get(c, 0) + 1

    salida = {
        "periodo": args.periodo,
        "generado": extraido,
        "fuentes": {"diputados": url_dips, "fracciones": url_fr},
        "licencia": "Datos abiertos Asamblea Legislativa de Costa Rica (CC BY 4.0)",
        "total_diputaciones": len(diputados),
        "conteo_por_partido": dict(sorted(conteo.items(), key=lambda x: -x[1])),
        "advertencias": problemas,
        "fracciones": fracciones,
        "diputados": diputados,
    }
    destino = PROCESADO / "diputados.json"
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n  -> {destino.relative_to(RAIZ)}")
    print(f"  -> composicion: {salida['conteo_por_partido']}")
    if problemas:
        print("\n  AVISOS (no se corrigen automaticamente, se reportan):")
        for p in problemas:
            print(f"    ! {p}")
    else:
        print("  -> sin advertencias de integridad")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
