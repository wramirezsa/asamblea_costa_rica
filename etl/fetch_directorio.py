"""
Extrae la integracion del Directorio Legislativo desde la pagina oficial.

A diferencia del resto del ETL, aqui no hay lista de SharePoint: el Directorio
se publica como pagina. En vez de parsear el HTML por estructura (que se rompe
con cualquier retoque de plantilla), buscamos dentro del texto los nombres del
padron oficial que ya tenemos y leemos el cargo que aparece junto a cada uno.

Eso hace el extractor auto-validante: si un nombre no esta en el padron, no se
acepta; si el numero de cargos hallados no cuadra, se reporta.

Uso:
    python etl/fetch_directorio.py
"""

from __future__ import annotations

import json
import re
import ssl
import sys
import unicodedata
import urllib.request
from html import unescape
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.sharepoint import FuenteError, ahora_iso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PROCESADO = RAIZ / "data" / "processed"
CRUDO = RAIZ / "data" / "raw"

URL = (
    "https://www.asamblea.go.cr/Diputados/SitePages/"
    "Integraci%C3%B3n_Directorio_Legislativo.aspx"
)

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

# Cargos del Directorio, del mas alto al mas bajo. El orden importa: define
# quien se sienta en la mesa (los tres primeros) y como se listan.
# Se aceptan variantes de genero porque la pagina usa la forma de la persona.
CARGOS = [
    ("presidencia", ["presidenta", "presidente"]),
    ("primera_secretaria", ["primera secretaria", "primer secretario", "primera secretaría"]),
    ("segunda_secretaria", ["segunda secretaria", "segundo secretario", "segunda secretaría"]),
    ("vicepresidencia", ["vicepresidenta", "vicepresidente"]),
    ("primera_prosecretaria", ["primera prosecretaria", "primer prosecretario"]),
    ("segunda_prosecretaria", ["segunda prosecretaria", "segundo prosecretario"]),
]

# Quienes ocupan la mesa del Directorio durante las sesiones del plenario:
# la presidencia al centro y las dos secretarias a los lados.
EN_LA_MESA = ["primera_secretaria", "presidencia", "segunda_secretaria"]

ETIQUETAS = {
    "presidencia": "Presidencia",
    "primera_secretaria": "Primera Secretaría",
    "segunda_secretaria": "Segunda Secretaría",
    "vicepresidencia": "Vicepresidencia",
    "primera_prosecretaria": "Primera Prosecretaría",
    "segunda_prosecretaria": "Segunda Prosecretaría",
}


def sin_tildes(t: str) -> str:
    t = unicodedata.normalize("NFD", t)
    return "".join(c for c in t if unicodedata.category(c) != "Mn").lower()


def texto_de_pagina() -> str:
    req = urllib.request.Request(URL, headers={"User-Agent": "asamblea-abierta/0.1"})
    with urllib.request.urlopen(req, context=_CTX, timeout=90) as r:
        crudo = r.read()

    CRUDO.mkdir(parents=True, exist_ok=True)
    (CRUDO / "directorio.html").write_bytes(crudo)

    html = crudo.decode("utf-8", errors="replace")
    # Fuera scripts y estilos antes de quitar etiquetas, o su contenido
    # se cuela en el texto.
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", html)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    t = unescape(t).replace("​", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", t).strip()


def main() -> int:
    padron_archivo = PROCESADO / "diputados.json"
    if not padron_archivo.exists():
        print("Falta data/processed/diputados.json. Corre: python etl/fetch_diputados.py")
        return 1

    padron = json.loads(padron_archivo.read_text(encoding="utf-8"))
    diputados = padron["diputados"]
    extraido = ahora_iso()

    print("[1/2] Leyendo la pagina oficial del Directorio...")
    texto = texto_de_pagina()
    plano = sin_tildes(texto)
    print(f"      {len(texto)} caracteres de texto")

    print("[2/2] Cruzando con el padron oficial...")
    hallados: dict[str, dict] = {}
    problemas: list[str] = []

    for dip in diputados:
        aguja = sin_tildes(dip["nombre"])
        pos = plano.find(aguja)
        if pos < 0:
            continue
        # El cargo aparece inmediatamente despues del nombre en la ficha.
        cola = plano[pos + len(aguja) : pos + len(aguja) + 90]
        for clave, variantes in CARGOS:
            if any(cola.lstrip().startswith(v) for v in variantes):
                if clave in hallados:
                    problemas.append(
                        f"cargo '{clave}' aparece dos veces: "
                        f"{hallados[clave]['nombre']} y {dip['nombre']}"
                    )
                hallados[clave] = {
                    "cargo": clave,
                    "etiqueta": ETIQUETAS[clave],
                    "slug": dip["slug"],
                    "nombre": dip["nombre"],
                    "partido_codigo": dip["partido_codigo"],
                }
                break

    faltantes = [c for c, _ in CARGOS if c not in hallados]
    if faltantes:
        problemas.append(f"cargos no encontrados en la pagina: {', '.join(faltantes)}")

    for clave in EN_LA_MESA:
        if clave not in hallados:
            raise FuenteError(
                f"No se pudo determinar quien ocupa '{clave}'. Sin ese dato no se "
                "dibuja la mesa del Directorio: preferimos no mostrarla a inventarla."
            )

    orden = [c for c, _ in CARGOS if c in hallados]
    salida = {
        "generado": extraido,
        "periodo": padron["periodo"],
        "_fuente": URL,
        "nota": (
            "Integracion del Directorio Legislativo segun la pagina oficial de la "
            "Asamblea. Los nombres se validaron contra el padron: solo se acepta "
            "un cargo si el nombre coincide con una diputacion registrada."
        ),
        "en_la_mesa": EN_LA_MESA,
        "advertencias": problemas,
        "miembros": [hallados[c] for c in orden],
    }

    PROCESADO.mkdir(parents=True, exist_ok=True)
    (PROCESADO / "directorio.json").write_text(
        json.dumps(salida, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"\n  -> data/processed/directorio.json ({len(salida['miembros'])} miembros)")
    for m in salida["miembros"]:
        mesa = "  [mesa]" if m["cargo"] in EN_LA_MESA else ""
        print(f"     {m['etiqueta']:24} {m['nombre']} ({m['partido_codigo']}){mesa}")
    if problemas:
        print("\n  AVISOS:")
        for p in problemas:
            print(f"    ! {p}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
