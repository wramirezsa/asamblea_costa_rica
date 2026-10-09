"""
Cliente del SIL+ (Sistema de Informacion Legislativo) de la Asamblea.

El SIL+ es una aplicacion interna (ASP.NET) que la Asamblea expone al publico
en produccion.asamblea.go.cr con un usuario anonimo propio
(`ASAMBLEA\\USR_SIL_ANONIMO`). De ahi salen las actas del Plenario, que traen
la lista de presentes y el voto nominal de cada votacion (ADR-021).

No tiene API documentada. El protocolo se capturo en el navegador el
2026-10-08 y esta descrito en ADR-021. Lo que importa saber para tocar esto:

- Cada campo de los formularios viaja como `base64|<valor en base64>`.
- Cada pedido lleva los encabezados `sistema: SIL`, `basedatos: SIL` y
  `diseno: DT`, mas `X-Requested-With`. Sin ellos el servidor responde una
  pagina de "Error del Sistema" con codigo 200.
- La sesion vive en cookies: hay que abrirla y abrir la pantalla antes de
  consultar.

Como es una aplicacion que puede cambiar sin aviso, este cliente falla
ruidosamente ante cualquier respuesta con forma inesperada. Nunca adivina.

Es un servidor de produccion de la Asamblea: se le pide una cosa a la vez y
con pausa.
"""

from __future__ import annotations

import base64
import http.cookiejar
import json
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from .sharepoint import FuenteError

BASE = "https://produccion.asamblea.go.cr/SILConsulta/"
UA = "asamblea-abierta/0.1 (proyecto civico; datos abiertos CC-BY-4.0)"
PAUSA = 1.5  # segundos entre pedidos

# Este servidor manda solo su propio certificado, sin el intermedio de
# GlobalSign. Windows lo completa solo (lo baja por AIA) y por eso funcionaba
# en local; Linux no, y en la nube fallaba la verificacion. Se agrega el
# intermedio publico, guardado en el repo, y TLS se verifica normalmente
# contra las raices del sistema (ADR-024). Si la Asamblea cambia de
# certificadora, la verificacion falla ruidosamente: nunca se apaga.
INTERMEDIO = Path(__file__).with_name("certs") / "globalsign_gcc_r3_dv_tls_ca_2020.pem"
_CTX = ssl.create_default_context()
_CTX.load_verify_locations(cafile=str(INTERMEDIO))

PANTALLA_ACTAS = "SIL_CNSACTAPLENARIO_PRINCIPAL"
MARCO_FILTRO = "ff_CNSACTAPLENARIO_FiltroFechas"
MARCO_LISTA = "ll_CNSACTAPLENARIO_Actas"
CONSULTA_LISTA = "C_ll_CNSACTAPLENARIO_ActasPlenario"

# Acciones de descarga disponibles en la lista de actas.
TEXTO_ACTA = "TextoActaSQL"
TEXTO_RESUMEN = "TextoSQLActaResumen"
TEXTO_FIRMADA = "TextoSQLActaFirmada"

# La lista del SIL+ pagina de a 30. Si una consulta devuelve exactamente
# esto, puede haber filas cortadas y se parte el rango.
TOPE_PAGINA = 30


def _b64(valor: str) -> str:
    return "base64|" + base64.b64encode(valor.encode("utf-8")).decode("ascii")


def _multipart(campos: dict[str, str]) -> tuple[bytes, str]:
    frontera = "----asamblea" + uuid.uuid4().hex
    partes = [
        f'--{frontera}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'
        for k, v in campos.items()
    ]
    partes.append(f"--{frontera}--\r\n")
    return "".join(partes).encode("utf-8"), f"multipart/form-data; boundary={frontera}"


def _fecha_sil(d: date) -> str:
    return d.strftime("%d/%m/%Y 00:00:00")


class ClienteSIL:
    """Una sesion anonima del SIL+. Abrir una por corrida y reutilizarla."""

    def __init__(self, pausa: float = PAUSA) -> None:
        self.pausa = pausa
        self._abridor = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=_CTX),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        )
        self._pantalla_abierta: str | None = None
        self.pedidos = 0

    # ------------------------------------------------------------ transporte

    def _pedir(self, ruta: str, *, campos: dict[str, str] | None = None,
               urlencoded: dict[str, str] | None = None, metodo: str = "POST",
               intentos: int = 3) -> tuple[bytes, Any]:
        if urlencoded is not None:
            cuerpo = urllib.parse.urlencode(urlencoded).encode("utf-8")
            tipo = "application/x-www-form-urlencoded; charset=UTF-8"
        else:
            cuerpo, tipo = _multipart({k: _b64(v) for k, v in (campos or {}).items()})
        cabeceras = {
            "User-Agent": UA,
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "sistema": "SIL",
            "basedatos": "SIL",
            "diseno": "DT",
            "Referer": BASE + "Monitor/Principal",
        }
        if metodo == "POST":
            cabeceras["Content-Type"] = tipo
        ultimo: Exception | None = None
        for n in range(intentos):
            try:
                time.sleep(self.pausa)
                req = urllib.request.Request(
                    BASE + ruta, data=cuerpo if metodo == "POST" else None,
                    method=metodo, headers=cabeceras)
                with self._abridor.open(req, timeout=120) as r:
                    self.pedidos += 1
                    return r.read(), r.headers
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                ultimo = e
                time.sleep(3 * (n + 1))
        raise FuenteError(f"SIL+: no se pudo leer {ruta} tras {intentos} intentos: {ultimo}")

    def _json(self, ruta: str, **kw) -> dict:
        datos, _ = self._pedir(ruta, **kw)
        if b"Error del Sistema" in datos[:2000]:
            raise FuenteError(
                f"SIL+ respondio 'Error del Sistema' en {ruta}. El protocolo pudo "
                "haber cambiado: revisar ADR-021 y volver a capturarlo."
            )
        try:
            return json.loads(datos)
        except json.JSONDecodeError as e:
            raise FuenteError(f"SIL+: {ruta} no devolvio JSON: {datos[:200]!r}") from e

    # ---------------------------------------------------------------- sesion

    def abrir(self) -> None:
        """Abre la sesion anonima, como lo hace el navegador al entrar."""
        self._pedir("Monitor/Principal", metodo="GET")
        menu = self._json("Monitor/Iniciar", campos={})
        if "MENU" not in menu:
            raise FuenteError("SIL+: Monitor/Iniciar no trajo el menu esperado.")
        self._json("Monitor/ObtenerBundleSistema",
                   urlencoded={"sistema": _b64("SIL"), "diseño": _b64("DT")})
        self._json("Monitor/ObtenerContextosVisuales",
                   urlencoded={"diseño": _b64("DT")})

    def _abrir_pantalla(self, pantalla: str) -> None:
        if self._pantalla_abierta == pantalla:
            return
        datos, _ = self._pedir(pantalla, campos={"parametros": json.dumps(
            {"sistema": "SIL", "basedatos": "SIL", "ventanaPrincipal": True})})
        if b"Error del Sistema" in datos[:2000]:
            raise FuenteError(f"SIL+: no se pudo abrir la pantalla {pantalla}.")
        self._pantalla_abierta = pantalla

    # ----------------------------------------------------------------- actas

    def _actas_rango(self, desde: date, hasta: date) -> list[dict]:
        contexto = [
            {"nombre": "Fecha_Inicio", "valor": _fecha_sil(desde), "marco": MARCO_FILTRO},
            {"nombre": "Fecha_Fin", "valor": _fecha_sil(hasta), "marco": MARCO_FILTRO},
        ]
        self._json(f"{PANTALLA_ACTAS}/Contexto",
                   campos={"sis_contexto": json.dumps(contexto, ensure_ascii=False)})
        buscar = {"Fecha_Inicio": _fecha_sil(desde), "Fecha_Fin": _fecha_sil(hasta),
                  "marco": MARCO_FILTRO, "accion": "Buscar"}
        self._json(f"{PANTALLA_ACTAS}/Procesar", campos={
            "accion": "Buscar", "marco": MARCO_FILTRO, "adjuntos": "[]",
            "datos": json.dumps(buscar, ensure_ascii=False)})
        r = self._json(f"{PANTALLA_ACTAS}/Datos", campos={
            "marco": MARCO_LISTA, "consultas": "[]", "parametros": "[]"})
        try:
            filas = r["datos"][CONSULTA_LISTA]["0"]
        except (KeyError, TypeError) as e:
            raise FuenteError(
                f"SIL+: la lista de actas no trae '{CONSULTA_LISTA}': {str(r)[:200]}"
            ) from e
        return filas

    def actas_plenario(self, desde: date, hasta: date, ventana_dias: int = 7) -> list[dict]:
        """Filas de la lista de actas del Plenario entre dos fechas.

        Se consulta por ventanas cortas porque la lista pagina de a 30. Si una
        ventana llega al tope, se parte en dos: preferimos pedir de mas a
        perder actas en silencio.
        """
        self._abrir_pantalla(PANTALLA_ACTAS)
        vistas: dict[Any, dict] = {}
        pendientes = []
        d = desde
        while d <= hasta:
            fin = min(d + timedelta(days=ventana_dias - 1), hasta)
            pendientes.append((d, fin))
            d = fin + timedelta(days=1)
        while pendientes:
            ini, fin = pendientes.pop(0)
            filas = self._actas_rango(ini, fin)
            if len(filas) >= TOPE_PAGINA:
                if ini == fin:
                    raise FuenteError(
                        f"SIL+: {len(filas)} actas en un solo dia ({ini}); no se "
                        "puede partir mas el rango."
                    )
                medio = ini + (fin - ini) // 2
                pendientes[:0] = [(ini, medio), (medio + timedelta(days=1), fin)]
                continue
            for f in filas:
                vistas[f.get("Id_Orden_Dia")] = {k: v for k, v in f.items()
                                                 if not k.startswith("_")}
        return list(vistas.values())

    def documento_acta(self, fila: dict, accion: str = TEXTO_ACTA) -> bytes:
        """Descarga un documento del acta (por defecto, el texto completo)."""
        self._abrir_pantalla(PANTALLA_ACTAS)
        seleccion = {"seleccion": [fila], "marco": MARCO_LISTA, "accion": accion}
        r = self._json(f"{PANTALLA_ACTAS}/Procesar", campos={
            "accion": accion, "marco": MARCO_LISTA, "adjuntos": "[]",
            "datos": json.dumps(seleccion, ensure_ascii=False)})
        servicios = r.get("resultadosServiciosIU") or []
        abrir = next((s for s in servicios if s.get("accion") == "archivoAbrir"), None)
        if not abrir or not abrir.get("id"):
            mensajes = r.get("Mensajes") or r.get("mensajes")
            raise FuenteError(
                f"SIL+: {accion} no devolvio archivo para la sesion "
                f"{fila.get('Numero_Sesion_1')} ({fila.get('Fecha_Sesion')}). "
                f"Mensajes: {mensajes}"
            )
        datos, cabeceras = self._pedir(
            f"Utilidades/DescargarArchivo?id={urllib.parse.quote(abrir['id'])}",
            metodo="GET")
        if datos[:2] != b"PK":
            raise FuenteError(
                f"SIL+: el documento de la sesion {fila.get('Numero_Sesion_1')} no "
                f"es un .docx (empieza con {datos[:12]!r})."
            )
        return datos
