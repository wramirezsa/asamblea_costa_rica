"""
Lectura del acta oficial de una sesion del Plenario (.docx del SIL+).

El acta la redacta el Area de Actas, Sonido y Grabacion del Departamento de
Servicios Parlamentarios. Trae, en texto:

    ACTA DE LA SESION PLENARIA ORDINARIA N.º 58
    Jueves 27 de agosto de 2026
    ...
    Directorio
    <presidencia y secretarias>
    Diputados presentes
    <un nombre por linea>
    ...
    Cerramos puertas con cuarenta y tres diputados, iniciar votacion. [...]
    Finalizar votacion. Cuarenta y dos en contra, uno a favor. Rechazada.
    Lista de nombres
    Nombre Propuesta:
    REVISION MOCION FONDO #497 EXP 24290
    A Favor (Voto: 1)
    Joselyn Saenz Nunez
    En Contra (Voto: 42)
    <nombres>
    No-Votacion (Total: 2)
    <nombres, a veces varios por linea separados por tabulador>

Aqui solo se LEE y se VALIDA. Nada se corrige: un nombre que no calza con el
padron queda sin resolver y se reporta, y una votacion cuyo total declarado
no coincide con los nombres listados se marca como no publicable.
"""

from __future__ import annotations

import io
import re
import unicodedata
import zipfile
from xml.etree import ElementTree as ET

from .numeros import NUM, a_numero

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "setiembre": 9, "septiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

CABECERA = re.compile(
    r"ACTA DE LA SESI[ÓO]N PLENARIA\s+(ORDINARIA|EXTRAORDINARIA|SOLEMNE)\s+N\.?\s*[º°o]?\s*(\d+)",
    re.I)
# "Viernes 1º de mayo de 2026": el primero del mes lleva ordinal.
FECHA = re.compile(r"(\d{1,2})\s*[º°ºo]?\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})", re.I)
# Numeracion de las listas de presentes en las actas de mayo: "1.Nogui ...".
NUMERACION = re.compile(r"^\d+\s*\.\s*")
PRESENTES = re.compile(r"^diputad[oa]s(\s+y\s+diputad[oa]s)?\s+presentes$", re.I)
SECCIONES = {
    "favor": re.compile(r"^A\s+Favor\s*\(Voto:\s*(\d+)\)$", re.I),
    "contra": re.compile(r"^En\s+Contra\s*\(Voto:\s*(\d+)\)$", re.I),
    "no_votacion": re.compile(r"^No-?\s*Votaci[óo]n\s*\(Total:\s*(\d+)\)$", re.I),
}
PROPUESTA = re.compile(r"^(?P<tipo>.*?)\s*#\s*(?P<numero>\d+)(?:\s+EXP\.?\s*(?P<exp>[\d\.]+))?", re.I)
RESULTADO = re.compile(r"\b(aprobad[oa]s?|rechazad[oa]s?)\b", re.I)
TOTALES = re.compile(
    NUM + r"\s*,?\s*(?:votos?\s+)?en\s+contra[.,;]?\s+" + NUM + r"\s*,?\s*(?:votos?\s+)?a\s+favor"
    r"|" + NUM + r"\s*,?\s*(?:votos?\s+)?a\s+favor[.,;]?\s+" + NUM + r"\s*,?\s*(?:votos?\s+)?en\s+contra",
    re.I)
CIERRE_PUERTAS = re.compile(r"cerra\w*\s+(?:las\s+)?puertas?\s+con\s+" + NUM + r"\s+diputad", re.I)

# Una linea "con forma de nombre": de 2 a 6 palabras que empiezan con
# mayuscula, sin punto final. Sirve para saber DONDE termina una lista; si la
# persona existe o no lo decide el padron, no esta regla.
FORMA_NOMBRE = re.compile(
    r"^[A-ZÁÉÍÓÚÑÜ][A-Za-zÁÉÍÓÚÑÜáéíóúñü'\.\-]*(?:\s+[A-Za-zÁÉÍÓÚÑÜáéíóúñü'\.\-]+){1,5}$")
# Palabras completas, no prefijos: "abr..." tambien agarraria a Abril.
PROCEDIMIENTO = re.compile(
    r"^(abrir|abrimos|abran|cerrar|cerramos|cierren|iniciar|iniciamos|finalizar|"
    r"finalizamos|continuamos|procedemos|tiene|se)\b", re.I)
CARGOS = re.compile(
    r"^(president[ae]|vicepresident[ae]|primer[ao]?\s+secretari[oa]|segund[oa]\s+secretari[oa]|"
    r"primer[ao]?\s+prosecretari[oa]|segund[oa]\s+prosecretari[oa]|directorio)$", re.I)


def plano(s: str) -> str:
    """Forma de comparacion: sin tildes, minusculas, espacios simples."""
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return " ".join(s.lower().replace(" ", " ").split())


def lineas_docx(docx: bytes) -> list[str]:
    """El texto del acta, una linea por parrafo (o por salto de linea)."""
    z = zipfile.ZipFile(io.BytesIO(docx))
    raiz = ET.fromstring(z.read("word/document.xml"))
    salida: list[str] = []
    for p in raiz.iter(f"{W}p"):
        trozos = []
        for n in p.iter():
            if n.tag == f"{W}t" and n.text:
                trozos.append(n.text)
            elif n.tag == f"{W}tab":
                trozos.append("\t")
            elif n.tag in (f"{W}br", f"{W}cr"):
                trozos.append("\n")
        for linea in "".join(trozos).split("\n"):
            linea = linea.replace(" ", " ").strip()
            if linea:
                salida.append(linea)
    return salida


def trozos_de_nombre(linea: str) -> list[str] | None:
    """Los nombres de una linea de lista, o None si la linea no es de nombres."""
    partes = [NUMERACION.sub("", p.strip()) for p in re.split(r"\t+|\s{3,}", linea) if p.strip()]
    # Un punto final indica una oracion del acta ("Abrir puertas."), no un
    # nombre. Los puntos internos si valen: "Royner G. Mora Ruiz". Y una linea
    # en mayusculas sostenidas es un titulo ("MOCION DE PLAZO CUATRIENAL"):
    # las actas escriben los nombres con mayuscula inicial.
    # Las ordenes de la Presidencia a veces vienen sin punto ("Abrir puertas").
    if partes and all(FORMA_NOMBRE.match(p) and not CARGOS.match(p) and not p.endswith(".")
                      and not p.isupper() and not PROCEDIMIENTO.match(p) for p in partes):
        return partes
    return None


class Resolutor:
    """Convierte un nombre tal como lo escribe el acta en el slug del padron.

    Primero exacto (sin tildes ni mayusculas), despues por la tabla de
    equivalencias curada a mano. Nunca por parecido: lo que no calza se
    devuelve como None y se reporta, con candidatos para que un humano decida.
    """

    def __init__(self, diputados: list[dict], equivalencias: list[dict]) -> None:
        self.por_nombre = {plano(d["nombre"]): d["slug"] for d in diputados}
        validos = {d["slug"] for d in diputados}
        # Un error de curaduria tiene que reventar aqui, no convertirse en un
        # voto atribuido a quien no existe.
        malos = [e for e in equivalencias if e["slug"] not in validos]
        if malos:
            raise ValueError(
                "equivalencias_nombres.json apunta a slugs que no estan en el padron: "
                + ", ".join(f"{e['variante']} -> {e['slug']}" for e in malos))
        self.por_variante = {plano(e["variante"]): e["slug"] for e in equivalencias}
        self.diputados = diputados

    def resolver(self, nombre: str) -> str | None:
        clave = plano(nombre)
        return self.por_nombre.get(clave) or self.por_variante.get(clave)

    def candidatos(self, nombre: str) -> list[str]:
        """Diputaciones cuyos dos apellidos aparecen en la variante. Solo sugiere."""
        palabras = set(plano(nombre).replace(".", " ").split())
        salida = []
        for d in self.diputados:
            partes = plano(d["nombre"]).split()
            if len(partes) >= 3 and partes[-1] in palabras and partes[-2] in palabras:
                salida.append(d["slug"])
        return salida


def _cabecera(lineas: list[str]) -> dict:
    tipo = numero = fecha = None
    for i, l in enumerate(lineas[:40]):
        m = CABECERA.search(l)
        if m:
            tipo, numero = m.group(1).lower(), int(m.group(2))
            for siguiente in lineas[i + 1:i + 4]:
                # "Del 1º de mayo de 2026 al 30 de abril de 2027" es el rango
                # de la legislatura, no la fecha de la sesion.
                if plano(siguiente).startswith("del "):
                    continue
                f = FECHA.search(siguiente)
                if f and plano(f.group(2)) in MESES:
                    fecha = f"{int(f.group(3)):04d}-{MESES[plano(f.group(2))]:02d}-{int(f.group(1)):02d}"
                    break
            break
    return {"tipo": tipo, "numero": numero, "fecha": fecha}


def _bloque_nombres(lineas: list[str], desde: int,
                    resolutor: "Resolutor | None" = None) -> tuple[list[str], int]:
    """Nombres consecutivos a partir de una posicion; devuelve tambien el fin.

    Una linea sin forma de nombre corta la lista, salvo que sea una variante
    ya curada (p. ej. la errata «attya Mora Montoya»): esa si se acepta.
    """
    nombres: list[str] = []
    i = desde
    while i < len(lineas):
        partes = trozos_de_nombre(lineas[i])
        if partes is None and resolutor is not None:
            crudas = [p.strip() for p in re.split(r"\t+|\s{3,}", lineas[i]) if p.strip()]
            if crudas and all(resolutor.resolver(NUMERACION.sub("", p)) for p in crudas):
                partes = [NUMERACION.sub("", p) for p in crudas]
        if partes is None:
            break
        nombres.extend(partes)
        i += 1
    return nombres, i


def _llamado(lineas: list[str], inicio_lista: int, frontera: int) -> dict:
    """Lo que canto la Presidencia antes de la lista: totales, resultado, presentes."""
    trozo = " ".join(lineas[max(frontera, inicio_lista - 8):inicio_lista])
    salida: dict = {"frase": None, "favor": None, "contra": None, "resultado": None,
                    "presentes": None}
    m = None
    for m in TOTALES.finditer(trozo):
        pass
    if m:
        grupos = [g for g in m.groups() if g]
        frase = m.group(0)
        if len(grupos) >= 2:
            if plano(frase).find("en contra") < plano(frase).find("a favor"):
                salida["contra"], salida["favor"] = a_numero(grupos[0]), a_numero(grupos[1])
            else:
                salida["favor"], salida["contra"] = a_numero(grupos[0]), a_numero(grupos[1])
        cola = trozo[m.end():m.end() + 80]
        r = RESULTADO.search(cola)
        if r:
            salida["resultado"] = "aprobada" if plano(r.group(1)).startswith("aprob") else "rechazada"
        salida["frase"] = re.sub(r"\s+", " ", trozo[m.start():m.end() + (r.end() if r else 0)]).strip()
    c = None
    for c in CIERRE_PUERTAS.finditer(trozo):
        pass
    if c:
        salida["presentes"] = a_numero(c.group(1))
    return salida


def leer_acta(docx: bytes, resolutor: Resolutor) -> dict:
    """Lee un acta completa. Devuelve datos y avisos; nunca corrige."""
    lineas = lineas_docx(docx)
    acta = _cabecera(lineas)
    avisos: list[str] = []
    sin_resolver: dict[str, int] = {}

    def resolver(nombre: str) -> str | None:
        slug = resolutor.resolver(nombre)
        if slug is None:
            sin_resolver[nombre] = sin_resolver.get(nombre, 0) + 1
        return slug

    # --- Directorio y presentes ---
    directorio: list[str] = []
    presentes_texto: list[str] = []
    presentes_corte = None
    try:
        i_pres = next(i for i, l in enumerate(lineas[:200]) if PRESENTES.match(l))
    except StopIteration:
        i_pres = None
        avisos.append("No se encontro el bloque 'Diputados presentes'.")
    if i_pres is not None:
        try:
            i_dir = next(i for i, l in enumerate(lineas[:i_pres]) if plano(l) == "directorio")
            for l in lineas[i_dir + 1:i_pres]:
                partes = trozos_de_nombre(l)
                if partes:
                    directorio.extend(partes)
        except StopIteration:
            avisos.append("No se encontro el bloque 'Directorio'.")
        presentes_texto, fin = _bloque_nombres(lineas, i_pres + 1, resolutor)
        # La linea donde se corto la lista: si alguien vota sin figurar en
        # presentes, esto dice por donde mirar.
        presentes_corte = lineas[fin] if fin < len(lineas) else None

    presentes = [s for s in (resolver(n) for n in presentes_texto) if s]
    directorio_slugs = [s for s in (resolver(n) for n in directorio) if s]
    en_sala = set(presentes) | set(directorio_slugs)

    # --- votaciones ---
    votaciones: list[dict] = []
    frontera = 0
    i = 0
    while i < len(lineas):
        if plano(lineas[i]) != "lista de nombres":
            i += 1
            continue
        inicio = i
        llamado = _llamado(lineas, inicio, frontera)
        i += 1
        propuesta = None
        if i < len(lineas) and plano(lineas[i]).startswith("nombre propuesta"):
            # El nombre puede ocupar varias lineas ("MOCION SESION" /
            # "EXTRAORDINARIA 27 AGOSTO"): se lee hasta el primer encabezado de
            # seccion, con un tope para no tragarse texto del acta.
            trozos = []
            resto = lineas[i].split(":", 1)[1].strip() if ":" in lineas[i] else ""
            if resto:
                trozos.append(resto)
            i += 1
            while (i < len(lineas) and len(trozos) < 4
                   and not any(p.match(lineas[i]) for p in SECCIONES.values())):
                trozos.append(lineas[i])
                i += 1
            propuesta = " ".join(trozos) or None
        declarado: dict[str, int] = {}
        listas: dict[str, list[str]] = {"favor": [], "contra": [], "no_votacion": []}
        while i < len(lineas):
            seccion = next((k for k, p in SECCIONES.items() if p.match(lineas[i])), None)
            if seccion is None:
                break
            declarado[seccion] = int(SECCIONES[seccion].match(lineas[i]).group(1))
            nombres, i = _bloque_nombres(lineas, i + 1, resolutor)
            listas[seccion].extend(nombres)
        frontera = i

        v: dict = {"orden": len(votaciones) + 1, "propuesta": propuesta,
                   "tipo_propuesta": None, "mocion": None, "expediente": None}
        if propuesta:
            mp = PROPUESTA.match(propuesta)
            if mp:
                v["tipo_propuesta"] = mp.group("tipo").strip() or None
                v["mocion"] = int(mp.group("numero"))
                v["expediente"] = mp.group("exp")
        v["declarado"] = {k: declarado.get(k) for k in listas}
        v["nombres"] = listas
        v["slugs"] = {k: [resolver(n) for n in listas[k]] for k in listas}
        v["llamado"] = llamado

        problemas: list[str] = []   # impiden publicar
        observaciones: list[str] = []  # se informan, no impiden
        for k in listas:
            if declarado.get(k) is None:
                problemas.append(f"falta la seccion '{k}'")
            elif declarado[k] != len(listas[k]):
                problemas.append(f"{k}: declara {declarado[k]} y lista {len(listas[k])}")
        no_resueltos = [n for k in listas for n, s in zip(listas[k], v["slugs"][k]) if s is None]
        if no_resueltos:
            problemas.append(f"nombres sin resolver: {no_resueltos}")
        todos = [s for k in listas for s in v["slugs"][k] if s]
        if len(todos) != len(set(todos)):
            problemas.append("una misma diputacion aparece dos veces")
        if len(todos) > 57:
            problemas.append(f"{len(todos)} nombres, mas que las 57 diputaciones")
        if propuesta is None:
            problemas.append("sin 'Nombre Propuesta'")
        if en_sala and (fuera := [s for s in todos if s not in en_sala]):
            observaciones.append(f"{len(fuera)} votante(s) no figuran en presentes: {fuera}")
        if llamado["favor"] is not None and llamado["favor"] != declarado.get("favor"):
            observaciones.append(
                f"la Presidencia canto {llamado['favor']} a favor y la lista dice {declarado.get('favor')}")
        if llamado["contra"] is not None and llamado["contra"] != declarado.get("contra"):
            observaciones.append(
                f"la Presidencia canto {llamado['contra']} en contra y la lista dice {declarado.get('contra')}")
        v["publicable"] = not problemas
        v["problemas"] = problemas
        v["observaciones"] = observaciones
        votaciones.append(v)

    if not votaciones:
        avisos.append("El acta no tiene ninguna 'Lista de nombres' (puede ser correcto: "
                      "sesion sin votaciones nominales).")

    return {
        **acta,
        "directorio_texto": directorio,
        "directorio": directorio_slugs,
        "presentes_texto": presentes_texto,
        "presentes_corte": presentes_corte,
        "presentes": presentes,
        "votaciones": votaciones,
        "sin_resolver": sin_resolver,
        "avisos": avisos,
        "lineas": len(lineas),
    }
