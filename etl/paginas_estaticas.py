"""
Paginas estaticas para compartir: una por diputacion, votacion y seccion.

WhatsApp, Facebook y X no ejecutan JavaScript: al compartir un enlace leen
el HTML tal cual llega. Como el sitio es una sola aplicacion, todos los
enlaces mostraban la misma vista previa generica. Este script toma el
index.html ya compilado y escribe una copia por ruta, con su titulo, su
descripcion y su imagen (og:image), mas el sitemap para los buscadores.

Corre despues de `npm run build`, sobre web/dist. No consulta ninguna
fuente: lee el mismo payload que publica el sitio, asi que no puede decir
nada distinto de lo que el sitio muestra.

Uso:
    python etl/paginas_estaticas.py web/dist https://usuario.github.io/repo
"""

from __future__ import annotations

import html
import json
import re
import sys
from datetime import date
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ANCHO, ALTO = 800, 420
FONDO = (11, 17, 32)
TEXTO = (232, 238, 252)
TEXTO_2 = (159, 176, 205)
TEXTO_3 = (107, 126, 158)
VOTO = {  # mismos colores que web/src/votos.ts
    "F": ((34, 197, 94), "a favor"),
    "C": ((239, 68, 68), "en contra"),
    "N": ((245, 158, 11), "no votó"),
    "-": ((71, 85, 105), "no figura"),
}
# Las votaciones se acumulan (unas 40 000 en el periodo): imagen propia solo
# para las recientes, que son las que se comparten. Las mas viejas usan la de
# portada; su pagina con titulo y descripcion se genera igual.
DIAS_IMAGEN_VOTACION = 120

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "setiembre", "octubre", "noviembre", "diciembre"]

FUENTES_TTF = {
    False: ["C:/Windows/Fonts/segoeui.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    True: ["C:/Windows/Fonts/segoeuib.ttf",
           "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
}


@lru_cache(maxsize=None)
def fuente(tam: int, negrita: bool = False) -> ImageFont.FreeTypeFont:
    for ruta in FUENTES_TTF[negrita]:
        if Path(ruta).exists():
            return ImageFont.truetype(ruta, tam)
    raise SystemExit("No hay fuente TrueType con tildes (Segoe UI o DejaVu).")


def fecha_larga(iso: str) -> str:
    a, m, d = (int(x) for x in iso[:10].split("-"))
    return f"{d} de {MESES[m - 1]} de {a}"


def partir(dib: ImageDraw.ImageDraw, texto: str, f, ancho: int, lineas: int) -> list[str]:
    """Parte el texto en lineas que caben; la ultima termina en '…' si sobra."""
    palabras, salida, actual = texto.split(), [], ""
    for p in palabras:
        prueba = f"{actual} {p}".strip()
        if dib.textlength(prueba, font=f) <= ancho:
            actual = prueba
            continue
        salida.append(actual)
        actual = p
        if len(salida) == lineas:
            break
    else:
        salida.append(actual)
        return [s for s in salida if s][:lineas]
    ultima = salida[-1]
    while ultima and dib.textlength(ultima + "…", font=f) > ancho:
        ultima = ultima[:-1]
    salida[-1] = ultima.rstrip() + "…"
    return salida


def lienzo() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (ANCHO, ALTO), FONDO)
    dib = ImageDraw.Draw(img)
    dib.text((40, 30), "ASAMBLEA ABIERTA", font=fuente(15, True), fill=(125, 211, 252))
    return img, dib


def pie(dib: ImageDraw.ImageDraw, texto: str) -> None:
    dib.line([(40, ALTO - 52), (ANCHO - 40, ALTO - 52)], fill=(38, 52, 80), width=1)
    dib.text((40, ALTO - 40), texto, font=fuente(14), fill=TEXTO_3)


def guardar(img: Image.Image, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    if destino.suffix == ".jpg":  # lleva foto: necesita todos sus colores
        img.save(destino, quality=85)
        return
    # Colores planos: con paleta corta pesa una fraccion. FASTOCTREE no
    # descarta colores escasos (el rojo de una leyenda con 0 en contra).
    img.quantize(colors=64, method=Image.Quantize.FASTOCTREE).save(destino)


def hemiciclo(dib, curules, color_de, caja) -> None:
    """Puntos del diagrama de composicion dentro de la caja (x0, y0, x1, y1)."""
    xs = [c["x"] for c in curules]
    ys = [c["y"] for c in curules]
    x0, y0, x1, y1 = caja
    escala = min((x1 - x0) / (max(xs) - min(xs) + 1), (y1 - y0) / (max(ys) - min(ys) + 1))
    r = max(4, int(escala * 0.36))
    for c in curules:
        cx = x0 + (c["x"] - min(xs) + 0.5) * escala
        cy = y0 + (c["y"] - min(ys) + 0.5) * escala
        dib.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color_de(c["slug"]))


# ----------------------------------------------------------------- tarjetas

def tarjeta_portada(datos: dict, destino: Path) -> None:
    img, dib = lienzo()
    dib.text((40, 62), "Plenario legislativo de Costa Rica", font=fuente(34, True), fill=TEXTO)
    dib.text((40, 108), f"Las {datos['total']} diputaciones {datos['periodo']}: cómo votan,",
             font=fuente(20), fill=TEXTO_2)
    dib.text((40, 134), "si asisten y cuánto ganan, con las actas oficiales.",
             font=fuente(20), fill=TEXTO_2)
    colores = {f["codigo"]: tuple(int(f["color"][i:i + 2], 16) for i in (1, 3, 5))
               for f in datos["fracciones"] if f.get("color")}
    partido = {c["slug"]: c["partido"] for c in datos["hemiciclo"]["curules"]}
    hemiciclo(dib, datos["hemiciclo"]["curules"],
              lambda s: colores.get(partido.get(s), (148, 163, 184)), (200, 180, 600, 350))
    pie(dib, "Datos oficiales de la Asamblea Legislativa · fuentes citadas")
    guardar(img, destino)


def tarjeta_votacion(datos, vot, v, indice_slug, destino: Path) -> None:
    s = vot["sesiones"][v["s"]]
    img, dib = lienzo()
    dib.text((40, 56), f"Sesión {s['tipo']} N.º {s['numero']} · {fecha_larga(s['fecha'])}",
             font=fuente(16), fill=TEXTO_2)
    y = 84
    for linea in partir(dib, v["p"] or "Votación del Plenario", fuente(28, True), ANCHO - 80, 2):
        dib.text((40, y), linea, font=fuente(28, True), fill=TEXTO)
        y += 36
    y = max(y + 14, 170)
    for codigo, valor in zip("FCN", v["d"]):
        color, etiqueta = VOTO[codigo]
        dib.ellipse([40, y + 6, 56, y + 22], fill=color)
        dib.text((66, y), f"{valor if valor is not None else '—'} {etiqueta}",
                 font=fuente(22, True), fill=TEXTO)
        y += 38
    resultado = {"aprobada": "Aprobada", "rechazada": "Rechazada"}.get(v["r"], "Resultado sin verificar")
    dib.text((40, y + 8), resultado, font=fuente(20, True), fill=TEXTO_2)
    hemiciclo(dib, datos["hemiciclo"]["curules"],
              lambda slug: VOTO[v["v"][indice_slug[slug]] if slug in indice_slug else "-"][0],
              (330, 175, 760, 350))
    pie(dib, "Según el acta oficial del Plenario · diagrama de composición, no el salón")
    guardar(img, destino)


def tarjeta_diputado(datos, dip, resumen, raiz_dist: Path, destino: Path) -> None:
    img, dib = lienzo()
    foto = raiz_dist / "assets" / dip["foto"] if dip.get("foto") else None
    x_texto = 40
    if foto and foto.exists():
        f = Image.open(foto).convert("RGB")
        lado = min(f.size)
        f = f.crop(((f.width - lado) // 2, 0, (f.width - lado) // 2 + lado, lado)).resize((250, 250))
        mascara = Image.new("L", (250, 250), 0)
        ImageDraw.Draw(mascara).rounded_rectangle([0, 0, 250, 250], radius=24, fill=255)
        img.paste(f, (40, 70), mascara)
        x_texto = 320
    ancho = ANCHO - x_texto - 40
    y = 74
    for linea in partir(dib, dip["nombre"], fuente(30, True), ancho, 2):
        dib.text((x_texto, y), linea, font=fuente(30, True), fill=TEXTO)
        y += 38
    meta = " · ".join(x for x in (dip.get("fraccion"), dip.get("provincia")) if x)
    for linea in partir(dib, meta, fuente(18), ancho, 2):
        dib.text((x_texto, y + 4), linea, font=fuente(18), fill=TEXTO_2)
        y += 26
    if dip.get("cargo_directorio"):
        dib.text((x_texto, y + 6), dip["cargo_directorio"], font=fuente(17, True), fill=(125, 211, 252))
        y += 28
    y += 22
    for linea in resumen:
        dib.text((x_texto, y), linea, font=fuente(19, True), fill=TEXTO)
        y += 30
    pie(dib, "Según las actas oficiales del Plenario y el padrón de la Asamblea")
    guardar(img, destino)


# -------------------------------------------------------------------- html

def pagina(plantilla: str, titulo: str, descripcion: str, url: str, imagen: str) -> str:
    t, d = html.escape(titulo, quote=True), html.escape(descripcion, quote=True)
    h = re.sub(r"<title>.*?</title>", f"<title>{t}</title>", plantilla, count=1, flags=re.S)
    h = re.sub(r'(<meta\s+name="description"\s+content=")[^"]*', lambda m: m.group(1) + d, h, count=1)
    h = re.sub(r'(<meta property="og:title" content=")[^"]*', lambda m: m.group(1) + t, h, count=1)
    h = re.sub(r'(<meta\s+property="og:description"\s+content=")[^"]*', lambda m: m.group(1) + d, h, count=1)
    extra = (
        f'    <link rel="canonical" href="{url}" />\n'
        f'    <meta property="og:url" content="{url}" />\n'
        f'    <meta property="og:image" content="{imagen}" />\n'
        f'    <meta property="og:image:width" content="{ANCHO}" />\n'
        f'    <meta property="og:image:height" content="{ALTO}" />\n'
        '    <meta name="twitter:card" content="summary_large_image" />\n'
    )
    return h.replace("</head>", extra + "  </head>", 1)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    dist, sitio = Path(sys.argv[1]), sys.argv[2].rstrip("/")
    plantilla = (dist / "index.html").read_text(encoding="utf-8")
    datos = json.loads((dist / "datos" / "asamblea.json").read_text(encoding="utf-8"))
    archivo_vot = dist / "datos" / "votaciones.json"
    vot = json.loads(archivo_vot.read_text(encoding="utf-8")) if archivo_vot.exists() else None
    og = dist / "og"
    urls: list[str] = []

    def escribir(ruta: str, titulo: str, descripcion: str, imagen: str) -> None:
        url = f"{sitio}/{ruta}" if ruta else f"{sitio}/"
        # ruta.html y no ruta/index.html: GitHub Pages sirve /votaciones desde
        # votaciones.html directo, y la carpeta obligaria a redirigir (301).
        destino = dist / f"{ruta}.html" if ruta else dist / "index.html"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(pagina(plantilla, titulo, descripcion, url, f"{sitio}/{imagen}"),
                           encoding="utf-8")
        urls.append(url)

    tarjeta_portada(datos, og / "portada.png")
    portada = "og/portada.png"
    escribir("", "Asamblea Abierta · Plenario legislativo de Costa Rica",
             f"Las {datos['total']} diputaciones {datos['periodo']}: cómo votan, si asisten y "
             "cuánto ganan, con datos oficiales de la Asamblea Legislativa y fuentes citadas.",
             portada)
    actas = datos.get("actas") or {}
    secciones = {
        "votaciones": ("Votaciones del Plenario · Asamblea Abierta",
                       f"Cómo votó cada diputación en {actas.get('votaciones', 'las')} votaciones "
                       "nominales, según las actas oficiales del Plenario."),
        "actividad": ("Actividad legislativa · Asamblea Abierta",
                      "Leyes aprobadas, mociones e intervenciones de la Asamblea Legislativa de "
                      "Costa Rica, con la fecha en que la fuente oficial se actualizó."),
        "fuentes": ("Fuentes · Asamblea Abierta",
                    "De dónde sale cada dato del sitio, cuándo se extrajo y qué no mostramos."),
    }
    for ruta, (t, d) in secciones.items():
        escribir(ruta, t, d, portada)

    def slug_texto(s: str) -> str:
        import unicodedata
        s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()
        return re.sub(r"[^a-z0-9]+", "-", s).strip("-")

    for prov in sorted({d["provincia"] for d in datos["diputados"] if d.get("provincia")}):
        n = sum(1 for d in datos["diputados"] if d.get("provincia") == prov)
        escribir(f"provincia/{slug_texto(prov)}", f"Diputaciones de {prov} · Asamblea Abierta",
                 f"Las {n} diputaciones que representan a {prov} en la Asamblea Legislativa de "
                 f"Costa Rica, {datos['periodo']}.", portada)

    # Conteos directos de las actas para la tarjeta de cada diputacion.
    indice_slug = {s: i for i, s in enumerate(vot["orden"])} if vot else {}
    con_lista = actas.get("sesiones_con_lista_de_presentes")
    for dip in datos["diputados"]:
        resumen, desc = [], []
        a = (actas.get("asistencia") or {}).get(dip["slug"])
        if a and con_lista:
            resumen.append(f"Presente en {a['presente']} de {con_lista} sesiones")
            desc.append(f"presente en {a['presente']} de {con_lista} sesiones del Plenario")
        if vot and dip["slug"] in indice_slug:
            k = indice_slug[dip["slug"]]
            votos = [v["v"][k] for v in vot["votaciones"]]
            # Participacion y no el reparto a favor/en contra: sin saber que
            # se votaba (muchas son mociones de tramite), «4 000 en contra»
            # engaña aunque sea un conteo exacto.
            emitidos = sum(1 for x in votos if x in "FC")
            resumen.append(f"Votó en {emitidos} de {len(votos)} votaciones")
            desc.append(f"votó en {emitidos} de {len(votos)} votaciones nominales")
        imagen = f"og/diputado/{dip['slug']}.jpg"
        tarjeta_diputado(datos, dip, resumen, dist, dist / imagen)
        meta = " · ".join(x for x in (dip.get("fraccion"), dip.get("provincia")) if x)
        escribir(f"diputado/{dip['slug']}", f"{dip['nombre']} · Asamblea Abierta",
                 f"{meta}. " + (f"Según las actas oficiales: {', '.join(desc)}." if desc else
                                "Ficha con datos oficiales de la Asamblea Legislativa."), imagen)

    if vot:
        for v in vot["votaciones"]:
            s = vot["sesiones"][v["s"]]
            clave = f"{s['tipo']}-{s['numero']}-{v['n']}"
            if (date.today() - date.fromisoformat(s["fecha"])).days <= DIAS_IMAGEN_VOTACION:
                imagen = f"og/votacion/{clave}.png"
                tarjeta_votacion(datos, vot, v, indice_slug, dist / imagen)
            else:
                imagen = portada
            fav, con, nov = (x if x is not None else "—" for x in v["d"])
            escribir(f"votacion/{clave}", f"{v['p'] or 'Votación'} · Asamblea Abierta",
                     f"Cómo votó cada diputación: {fav} a favor, {con} en contra, {nov} no votó. "
                     f"Sesión {s['tipo']} N.º {s['numero']}, {fecha_larga(s['fecha'])}, según el "
                     "acta oficial.", imagen)

    hoy = date.today().isoformat()
    (dist / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"  <url><loc>{html.escape(u)}</loc><lastmod>{hoy}</lastmod></url>\n" for u in urls)
        + "</urlset>\n", encoding="utf-8")
    (dist / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {sitio}/sitemap.xml\n",
                                     encoding="utf-8")
    peso = sum(p.stat().st_size for p in og.rglob("*.png")) / 1e6
    print(f"{len(urls)} paginas, {len(list(og.rglob('*.png')))} imagenes ({peso:.1f} MB), sitemap y robots.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
