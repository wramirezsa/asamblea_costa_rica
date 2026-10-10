"""
Deriva el color representativo de cada fraccion desde su bandera oficial.

Por que: el sitio necesita un color por bancada para el hemiciclo. En vez de
elegirlos a criterio propio, los extraemos de las banderas que publica la
Asamblea. Asi el color tiene procedencia y no es una invencion nuestra.

Se ajusta la luminosidad solo lo necesario para que el color sea legible sobre
fondo oscuro; el tono (hue) original se respeta. Eso queda registrado en la
salida como `ajustado`.

Uso:
    python etl/derive_colores.py
"""

from __future__ import annotations

import colorsys
import json
import sys
from collections import Counter
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
from lib.sharepoint import ahora_iso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
BANDERAS = RAIZ / "data" / "assets" / "banderas"
PROCESADO = RAIZ / "data" / "processed"

# Rangos de legibilidad sobre fondo oscuro.
LUZ_MIN, LUZ_MAX = 0.42, 0.68
SAT_MIN = 0.35


def color_dominante(ruta: Path) -> tuple[tuple[int, int, int], bool]:
    """Devuelve (rgb, fue_ajustado) del color mas representativo de la bandera."""
    img = Image.open(ruta).convert("RGB")
    img.thumbnail((120, 120))
    # Cuantizamos para agrupar tonos parecidos y evitar ruido de compresion.
    q = img.quantize(colors=16, method=Image.Quantize.MEDIANCUT).convert("RGB")

    conteo = Counter(q.getdata())
    candidatos = []
    for (r, g, b), n in conteo.items():
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
        # Descarta blancos, negros y grises: no identifican a un partido.
        if s < 0.18 or l > 0.93 or l < 0.07:
            continue
        candidatos.append(((r, g, b), n, s))

    if not candidatos:
        # Bandera sin color cromatico util (p. ej. blanco y negro).
        return (148, 163, 184), True

    # Preferimos el color abundante, con un empuje a los mas saturados.
    mejor = max(candidatos, key=lambda c: c[1] * (0.6 + c[2]))
    r, g, b = mejor[0]

    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    original = (l, s)
    l = min(max(l, LUZ_MIN), LUZ_MAX)
    s = max(s, SAT_MIN)
    ajustado = (round(l, 3), round(s, 3)) != (round(original[0], 3), round(original[1], 3))

    r2, g2, b2 = colorsys.hls_to_rgb(h, l, s)
    return (round(r2 * 255), round(g2 * 255), round(b2 * 255)), ajustado


def hexa(rgb: tuple[int, int, int]) -> str:
    return "#{:02x}{:02x}{:02x}".format(*rgb)


# Separacion minima de tono para que dos bancadas no se confundan en pantalla.
SEPARACION_TONO = 22 / 360


def _escanos_por_partido() -> dict[str, int]:
    origen = PROCESADO / "diputados.json"
    if not origen.exists():
        return {}
    d = json.loads(origen.read_text(encoding="utf-8"))
    return d.get("conteo_por_partido", {})


def separar_colisiones(colores: dict[str, dict]) -> None:
    """
    Dos banderas pueden dar colores casi identicos (p. ej. dos amarillos), lo
    que vuelve el hemiciclo ilegible. Cuando eso pasa, corremos el tono de la
    bancada MAS PEQUENA lo minimo necesario y lo dejamos marcado. El color
    derivado original se conserva en `hex_derivado`.
    """
    escanos = _escanos_por_partido()
    # Solo interesan las fracciones que hoy tienen escanos.
    vigentes = [c for c in colores if escanos.get(c, 0) > 0]
    # De mayor a menor: las grandes conservan su tono, las chicas ceden.
    vigentes.sort(key=lambda c: -escanos.get(c, 0))

    fijos: list[tuple[str, float]] = []
    for codigo in vigentes:
        r, g, b = colores[codigo]["rgb"]
        h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)

        def libre(tono: float) -> bool:
            return all(
                min(abs(tono - hf), 1 - abs(tono - hf)) >= SEPARACION_TONO
                for _, hf in fijos
            )

        movido = False
        if not libre(h):
            # Buscamos el tono disponible MAS CERCANO, probando hacia ambos
            # lados en pasos crecientes. Asi el color se aleja lo minimo
            # posible del que realmente tiene la bandera.
            original = h
            paso = 1 / 360
            for n in range(1, 181):
                for candidato in ((original + n * paso) % 1.0, (original - n * paso) % 1.0):
                    if libre(candidato):
                        h = candidato
                        movido = True
                        break
                if movido:
                    break

        if movido:
            r2, g2, b2 = colorsys.hls_to_rgb(h, l, s)
            rgb = (round(r2 * 255), round(g2 * 255), round(b2 * 255))
            colores[codigo].update(
                {"hex": hexa(rgb), "rgb": list(rgb), "separado_por_colision": True}
            )
            print(
                f"  {codigo:6} {colores[codigo]['hex_derivado']} -> "
                f"{hexa(rgb)} (separado: chocaba con otra bancada)"
            )
        fijos.append((codigo, h))


def main() -> int:
    if not BANDERAS.exists():
        print("Faltan banderas. Corre antes: python etl/fetch_assets.py")
        return 1

    colores = {}
    for f in sorted(BANDERAS.iterdir()):
        if f.suffix.lower() not in (".png", ".jpg", ".jpeg"):
            continue
        codigo = f.stem.upper().removeprefix("BANDERA_")
        rgb, ajustado = color_dominante(f)
        colores[codigo] = {
            "hex": hexa(rgb),
            "hex_derivado": hexa(rgb),
            "rgb": list(rgb),
            "derivado_de": f"data/assets/banderas/{f.name}",
            "ajustado_para_contraste": ajustado,
            "separado_por_colision": False,
        }
        marca = " (ajustado)" if ajustado else ""
        print(f"  {codigo:6} {hexa(rgb)}{marca}")

    separar_colisiones(colores)

    PROCESADO.mkdir(parents=True, exist_ok=True)
    (PROCESADO / "colores.json").write_text(
        json.dumps(
            {
                "generado": ahora_iso(),
                "metodo": (
                    "Color dominante cromático de la bandera oficial de cada "
                    "fracción, con luminosidad y saturación acotadas para "
                    "legibilidad sobre fondo oscuro. El tono no se altera."
                ),
                "colores": colores,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\n  -> data/processed/colores.json ({len(colores)} fracciones)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
