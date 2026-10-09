"""
Cliente para la API REST de SharePoint de la Asamblea Legislativa de Costa Rica.

FUENTE DE LA VERDAD: https://www.asamblea.go.cr
La Asamblea corre SharePoint con la API REST (`/_api/web/`) abierta de forma
anonima. Esto nos permite leer datos estructurados sin scraping de HTML.

NOTA SOBRE TLS: el servidor de la Asamblea envia una cadena de certificados
incompleta (no incluye el intermedio). Los navegadores lo resuelven con
AIA-fetching, pero Python no. Ver docs/decisions.md ADR-002.
"""

from __future__ import annotations

import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html import unescape
from typing import Any

BASE = "https://www.asamblea.go.cr"

# La cadena incompleta del servidor obliga a relajar la verificacion.
# Mitigacion: fijamos el host, solo hacemos GET y no enviamos credenciales.
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE

_HEADERS = {
    "Accept": "application/json;odata=nometadata",
    "User-Agent": "asamblea-abierta/0.1 (proyecto civico; datos abiertos CC-BY-4.0)",
}


class FuenteError(RuntimeError):
    """La fuente oficial no respondio como se esperaba. Nunca inventamos datos."""


def ahora_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _get(url: str, intentos: int = 3) -> dict[str, Any]:
    ultimo = None
    for n in range(intentos):
        try:
            req = urllib.request.Request(url, headers=_HEADERS)
            with urllib.request.urlopen(req, context=_CTX, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            ultimo = e
            if n < intentos - 1:
                time.sleep(2 * (n + 1))
    raise FuenteError(f"No se pudo leer {url} tras {intentos} intentos: {ultimo}")


def obtener_lista(
    sitio: str,
    lista: str,
    *,
    select: str | None = None,
    filtro: str | None = None,
    orden: str | None = None,
    top: int = 5000,
) -> tuple[list[dict], str]:
    """
    Lee todos los items de una lista de SharePoint, siguiendo la paginacion.

    Devuelve (items, url_consultada) — la URL se guarda como procedencia.
    """
    ruta = f"{BASE}/{sitio}/_api/web/lists/getbytitle('{urllib.parse.quote(lista)}')/items"
    params = {"$top": str(min(top, 5000))}
    if select:
        params["$select"] = select
    if filtro:
        params["$filter"] = filtro
    if orden:
        params["$orderby"] = orden

    url = f"{ruta}?{urllib.parse.urlencode(params, quote_via=urllib.parse.quote)}"
    url_original = url

    items: list[dict] = []
    while url:
        data = _get(url)
        if "value" not in data:
            raise FuenteError(f"Respuesta sin 'value' en {url}: {str(data)[:200]}")
        items.extend(data["value"])
        url = data.get("odata.nextLink") or data.get("@odata.nextLink")
        if url and not url.startswith("http"):
            url = f"{BASE}/{sitio}/_api/web/{url}"

    return items, url_original


def valor_url(campo: Any) -> str | None:
    """Los campos tipo 'Hipervinculo o imagen' vienen como {Description, Url}."""
    if isinstance(campo, dict):
        u = (campo.get("Url") or "").strip()
        return u or None
    if isinstance(campo, str) and campo.strip():
        return campo.strip()
    return None


def texto_url(campo: Any) -> str | None:
    """Devuelve la Description de un campo hipervinculo (a veces trae el nombre)."""
    if isinstance(campo, dict):
        d = (campo.get("Description") or "").strip()
        return d or None
    return None


def html_a_texto(html: str | None) -> str | None:
    """
    Convierte el HTML enriquecido de SharePoint a texto plano legible.

    Las listas guardan resumenes y titulos como HTML con estilos incrustados.
    Se conservan los saltos de linea y las vinetas; se descarta el resto.
    """
    if not html:
        return None
    salto = chr(10)
    t = re.sub(r"(?i)<\s*(br|/p|/div|/li|/tr)\s*/?>", salto, html)
    t = re.sub(r"(?i)<\s*li[^>]*>", "\u2022 ", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = unescape(t).replace(chr(0x200B), "").replace(chr(0xA0), " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n\s*\n\s*\n+", salto * 2, t)
    t = salto.join(linea.strip() for linea in t.split(salto))
    return t.strip() or None


def limpiar(texto: Any) -> str | None:
    """Normaliza texto de SharePoint: quita zero-width y espacios sobrantes."""
    if not isinstance(texto, str):
        return None
    t = texto.replace("​", "").replace("\xa0", " ").strip()
    return t or None
