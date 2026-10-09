# Asamblea Abierta CR

Mapa interactivo del plenario de la Asamblea Legislativa de Costa Rica.
Proyecto ciudadano independiente. Período legislativo **2026-2030**.

## Regla número uno

**Nada se muestra sin fuente verificable.** Si un dato no está en una fuente
oficial o citable, no se publica, no se estima y no se completa "para que se
vea bien". Un campo vacío se muestra como *"Sin dato oficial"*.

Esto no es una preferencia de estilo: la credibilidad del sitio es su único
activo. Un solo dato inventado la destruye.

Corolarios operativos:

- Todo registro lleva `_fuente` (URL consultada) y `_extraido` (timestamp).
- Los datos derivados (no leídos tal cual de la fuente) se marcan como tales
  y explican de qué norma o cálculo salen.
- Si el ETL detecta una inconsistencia, la **reporta**; nunca la corrige en
  silencio.
- **"No lo encontré" nunca es "no existe".** Verificar que una fuente concreta
  no sirve es un hallazgo; afirmar que no hay ninguna exige agotar la
  búsqueda. Ya pasó una vez: se dio por inexistente una ley que sí obliga a la
  Asamblea. Ver ADR-015.
- Lo que se publica debe estar **vigente**. Un conjunto congelado hace años se
  muestra con su fecha real o no se muestra. Ver ADR-014.

## Un hecho que no se debe olvidar

**El plenario de Costa Rica NO es un hemiciclo.** Es una sala rectangular con
dos bancadas escalonadas enfrentadas y la mesa del Directorio al fondo. La
vista de arcos del sitio es un *diagrama de composición* (convención para
mostrar reparto de escaños), no un retrato del salón, y así se etiqueta. La
vista "Salón 3D" sí reproduce la forma real. Ver ADR-007.

## Arquitectura

Tres capas, sin acoplamiento:

```
etl/      Python. Lee las fuentes oficiales y escribe JSON validado.
data/     raw/ (respuesta cruda, auditable) + processed/ (normalizado) + assets/
web/      Vite + React + TypeScript. Solo consume data/. No consulta fuentes.
          Dos vistas: composición (SVG) y salón 3D (Three.js, carga diferida).
```

El frontend **nunca** llama a la Asamblea directamente: si la fuente cae o
cambia, el sitio sigue en pie con el último dato bueno, fechado.

## Fuente de la verdad

`https://www.asamblea.go.cr` corre SharePoint con la **API REST anónima
abierta** (`/{sitio}/_api/web/lists/getbytitle('X')/items`). Eso evita
scraping de HTML. Detalle completo en `docs/fuentes-de-datos.md`.

Listas clave (subsitio `Diputados`):
- `Diputados_y_Diputadas_2026_2030` — 57 registros, con foto oficial
- `Fracciones_2026-2030` — banderas de bancadas

## Cómo trabajar en este repo

Regenerar todo (en orden, cada paso depende del anterior):

```bash
python etl/fetch_diputados.py    # padron oficial de 57
python etl/fetch_directorio.py   # Directorio Legislativo
python etl/fetch_assets.py       # fotos, banderas, escudo
python etl/derive_colores.py     # color por bancada
python etl/fetch_actividad.py    # leyes, mociones, intervenciones
python etl/publish_web.py        # geometria + payload del sitio
cd web && npm run dev
```

`python etl/curules.py` muestra el mapa de asientos y el estado de la
curaduría; `--set` y `--quitar` la editan.

Fuera de esa cadena, y **a propósito**, hay una vía aparte para las votaciones:

```bash
python etl/fetch_sesiones.py      # indice de sesiones del Plenario
python etl/fetch_votaciones.py    # totales de votacion desde el subtitulo
```

No forman parte del ciclo de publicación y `publish_web.py` no los consume. Lo
que producen está marcado `_publicable: false` porque son totales cantados y
transcritos por una máquina, sin contrastar todavía contra el tablero. No se
suben al sitio hasta que ese contraste exista. Ver ADR-018 y ADR-019.

Antes de dar una tarea por terminada, ver `docs/test-playbook.md`.

## Restricciones

- **Windows**: usar `PYTHONIOENCODING=utf-8` al correr el ETL, o los acentos
  revientan la consola.
- **TLS**: el servidor de la Asamblea manda una cadena de certificados
  incompleta. Ver ADR-002 en `docs/decisions.md`.
- Sin dependencias de pago ni servicios externos. Todo corre local.
- El botón de donaciones está **deshabilitado a propósito** hasta que exista
  una cuenta real. No se publican botones que no funcionan.

## Qué preservar al compactar

1. La regla número uno (arriba).
2. El estado vivo: `docs/current-state.md`.
3. Las decisiones y su motivo: `docs/decisions.md`.
4. Los huecos de datos conocidos: sección "Lo que NO existe" en
   `docs/fuentes-de-datos.md`. Es lo más fácil de olvidar y lo más caro de
   re-descubrir.
5. Que el plenario no es un hemiciclo (arriba).
6. Que el mapa de curules se levantó a mano y está completo: 57 de 57. Vive en
   `data/curated/asignacion_curules.json` y el ETL **nunca** lo sobreescribe.
7. Que hay una solicitud de transparencia enviada y a la espera:
   `docs/solicitud-transparencia.md`.
8. Que las votaciones extraídas de la transmisión (3.215, en
   `data/processed/votaciones.json`) **no son publicables todavía**: son
   totales del subtítulo, sin voto por persona y sin contrastar. Falta el
   paso del tablero, y ese depende de resolver la vía de acceso al video.
