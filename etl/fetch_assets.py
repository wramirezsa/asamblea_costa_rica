"""
Descarga fotos oficiales de diputaciones y banderas de fracciones.

Los activos se guardan localmente para que el sitio no dependa de la
disponibilidad del servidor de la Asamblea en cada visita, y para no
generarle carga innecesaria. La procedencia queda registrada en el manifiesto.

Uso:
    python etl/fetch_assets.py
"""

from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from lib.sharepoint import ahora_iso  # noqa: E402

RAIZ = Path(__file__).resolve().parent.parent
PROCESADO = RAIZ / "data" / "processed"
ASSETS = RAIZ / "data" / "assets"

_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE
_HEADERS = {"User-Agent": "asamblea-abierta/0.1 (proyecto civico)"}


def descargar(url: str, destino: Path) -> tuple[bool, str]:
    if destino.exists() and destino.stat().st_size > 0:
        return True, "cache"
    try:
        # SharePoint mezcla URLs ya codificadas con otras que traen espacios
        # literales. Decodificamos primero para no producir dobles escapes
        # (%20 -> %2520), que era la causa de 404 en nombres con espacio.
        partes = urllib.parse.urlsplit(url)
        ruta = urllib.parse.quote(urllib.parse.unquote(partes.path))
        limpia = urllib.parse.urlunsplit(
            (partes.scheme, partes.netloc, ruta, partes.query, "")
        )
        req = urllib.request.Request(limpia, headers=_HEADERS)
        with urllib.request.urlopen(req, context=_CTX, timeout=90) as r:
            datos = r.read()
        if len(datos) < 100:
            return False, f"archivo sospechosamente pequeno ({len(datos)} bytes)"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(datos)
        return True, f"{len(datos) // 1024} KB"
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return False, str(e)[:90]


ESCUDO_URL = "https://www.asamblea.go.cr/SiteAssets/Asamblea Logo.png"

# Rampa de bronce, de sombra a brillo. En el salon real el escudo es un
# relieve metalico, no la version a color del simbolo.
BRONCE = [(58, 44, 26), (124, 96, 52), (186, 150, 92), (226, 200, 150)]


def descargar_escudo(fallos: list[str]) -> dict | None:
    """
    Baja el escudo nacional desde el sitio oficial (es el logotipo de la
    Asamblea) y genera una version en bronce para el muro de la vista 3D.

    El simbolo no se altera: solo se cambia su acabado, para representar el
    relieve metalico que efectivamente esta montado en el salon.
    """
    destino = ASSETS / "escudo" / "escudo-oficial.png"
    ok, detalle = descargar(ESCUDO_URL, destino)
    if not ok:
        fallos.append(f"escudo: {detalle}")
        return None

    try:
        from PIL import Image
    except ImportError:
        fallos.append("escudo: falta Pillow, no se genero la version en bronce")
        return {"oficial": "escudo/escudo-oficial.png", "bronce": None}

    img = Image.open(destino).convert("RGBA")
    # El original es pequeno (134x146); se amplia con LANCZOS porque en el
    # muro se ve a buen tamano.
    img = img.resize((img.width * 4, img.height * 4), Image.LANCZOS)
    alfa = img.getchannel("A")
    gris = img.convert("L")

    def rampa(v: int) -> tuple[int, int, int]:
        t = v / 255 * (len(BRONCE) - 1)
        i = min(int(t), len(BRONCE) - 2)
        f = t - i
        a, b = BRONCE[i], BRONCE[i + 1]
        return tuple(round(a[c] + (b[c] - a[c]) * f) for c in range(3))  # type: ignore

    tabla = [rampa(v) for v in range(256)]
    bronce = Image.new("RGBA", img.size)
    bronce.putdata([(*tabla[p], a) for p, a in zip(gris.getdata(), alfa.getdata())])

    salida = ASSETS / "escudo" / "escudo-bronce.png"
    bronce.save(salida)
    return {
        "oficial": "escudo/escudo-oficial.png",
        "bronce": "escudo/escudo-bronce.png",
        "origen": ESCUDO_URL,
        "nota": (
            "Escudo nacional publicado por la Asamblea Legislativa como su "
            "logotipo. La versión en bronce reproduce el acabado del relieve "
            "montado en el salón; el símbolo no se modifica."
        ),
    }


def main() -> int:
    origen = PROCESADO / "diputados.json"
    if not origen.exists():
        print("Falta data/processed/diputados.json. Corre antes: python etl/fetch_diputados.py")
        return 1

    d = json.loads(origen.read_text(encoding="utf-8"))
    manifiesto: dict[str, dict] = {}
    fallos: list[str] = []

    print(f"[1/2] Fotos oficiales ({len(d['diputados'])})...")
    for dip in d["diputados"]:
        if not dip["foto_url"]:
            fallos.append(f"{dip['nombre']}: sin foto en la fuente")
            continue
        ext = Path(urllib.parse.urlsplit(dip["foto_url"]).path).suffix.lower() or ".jpg"
        rel = f"fotos/{dip['slug']}{ext}"
        ok, detalle = descargar(dip["foto_url"], ASSETS / rel)
        if ok:
            manifiesto[dip["slug"]] = {"archivo": rel, "origen": dip["foto_url"]}
        else:
            fallos.append(f"{dip['nombre']}: {detalle}")
    print(f"      {len(manifiesto)} descargadas")

    print(f"[2/2] Banderas de fracciones ({len(d['fracciones'])})...")
    banderas: dict[str, dict] = {}
    for fr in d["fracciones"]:
        if not fr["bandera_url"] or not fr["codigo"]:
            continue
        ext = Path(urllib.parse.urlsplit(fr["bandera_url"]).path).suffix.lower() or ".png"
        # Prefijo obligatorio: un codigo de partido puede ser un nombre
        # reservado de Windows (PRN, CON, AUX...). «PRN.jpg» no se puede abrir
        # con rutas normales y rompe git.
        rel = f"banderas/bandera_{fr['codigo']}{ext}"
        ok, detalle = descargar(fr["bandera_url"], ASSETS / rel)
        if ok:
            banderas[fr["codigo"]] = {"archivo": rel, "origen": fr["bandera_url"]}
        else:
            fallos.append(f"bandera {fr['codigo']}: {detalle}")
    print(f"      {len(banderas)} descargadas")

    print("[3/3] Escudo nacional...")
    escudo = descargar_escudo(fallos)
    if escudo:
        print(f"      {escudo['bronce']}")

    (ASSETS / "manifiesto.json").write_text(
        json.dumps(
            {
                "generado": ahora_iso(),
                "nota": "Activos publicados por la Asamblea Legislativa de Costa Rica.",
                "fotos": manifiesto,
                "banderas": banderas,
                "escudo": escudo,
                "fallos": fallos,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    if fallos:
        print(f"\n  AVISOS ({len(fallos)}):")
        for f in fallos[:10]:
            print(f"    ! {f}")
    else:
        print("\n  -> todos los activos descargados")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
