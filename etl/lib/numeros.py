"""
Numeros cantados en español, como los transcriben el subtitulo y las actas.

Lo usan `fetch_votaciones.py` (subtitulo de la transmision) y la lectura de
actas (`lib/acta.py`): la Presidencia canta los totales en letras
("cuarenta y dos en contra") y a veces en digitos.
"""

from __future__ import annotations

import re

# El subtitulo canta los votos en letras ("cuarenta y dos en contra") y a veces
# en digitos. Hace falta entender ambos hasta 99, que es mas que suficiente.

UNIDADES = {
    "cero": 0, "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4,
    "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
    "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
    "dieciseis": 16, "dieciséis": 16, "diecisiete": 17, "dieciocho": 18,
    "diecinueve": 19, "veinte": 20, "veintiuno": 21, "veintiun": 21,
    "veintidos": 22, "veintidós": 22, "veintitres": 23, "veintitrés": 23,
    "veinticuatro": 24, "veinticinco": 25, "veintiseis": 26, "veintiséis": 26,
    "veintisiete": 27, "veintiocho": 28, "veintinueve": 29,
}
DECENAS = {
    "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60,
    "setenta": 70, "ochenta": 80, "noventa": 90,
}

# Un numero es: digitos, o una palabra suelta, o "cuarenta y dos".
PALABRAS = sorted(list(UNIDADES) + list(DECENAS), key=len, reverse=True)
NUM = (
    r"(\d{1,3}|(?:" + "|".join(DECENAS) + r")\s+y\s+(?:"
    + "|".join(sorted(UNIDADES, key=len, reverse=True)) + r")|"
    + "|".join(PALABRAS) + r")"
)


def a_numero(texto: str) -> int | None:
    """Convierte '42', 'cuarenta y dos' o 'uno' en entero. None si no se puede."""
    t = texto.strip().lower().replace(",", "")
    if t.isdigit():
        return int(t)
    if t in UNIDADES:
        return UNIDADES[t]
    if t in DECENAS:
        return DECENAS[t]
    m = re.match(r"(\w+)\s+y\s+(\w+)$", t)
    if m and m.group(1) in DECENAS and m.group(2) in UNIDADES:
        return DECENAS[m.group(1)] + UNIDADES[m.group(2)]
    return None
