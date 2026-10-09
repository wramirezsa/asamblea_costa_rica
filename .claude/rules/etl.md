# Reglas del ETL (`etl/`)

Complementan `CLAUDE.md`; no lo repiten.

## Procedencia

- Todo registro normalizado lleva `_fuente` (URL exacta consultada) y
  `_extraido` (ISO 8601 UTC).
- La respuesta cruda se guarda **sin tocar** en `data/raw/`. Es la prueba de
  qué dijo la fuente ese día. Nunca se edita a mano.
- Un valor que no viene de la fuente tal cual es **derivado** y debe declarar
  de qué norma o cálculo sale (ejemplos: `hemiciclo.confianza`,
  `color_derivado_de_bandera`, `nombre_tomado_de`).

## Ausencias

- Falta un dato → `None`. Nunca `""`, `0`, `"N/D"` ni un valor plausible.
- Cruzar campos **oficiales entre sí** sí es válido (así se completa el
  nombre de fracción desde `FraccionParlamentaria`), siempre que quede
  registrado de dónde salió.

## Nombres de personas

- Las fuentes oficiales no escriben igual a las mismas personas («Roberth» en
  el acta y «Robert» en el padrón). Un nombre se resuelve **exacto** (sin
  tildes ni mayúsculas) o por `data/curated/equivalencias_nombres.json`.
  **Nunca por parecido**, nunca con distancia de edición.
- Lo que no se resuelve queda en `None`, se reporta con sus candidatos y la
  votación se marca no publicable. Un humano decide si agrega la equivalencia.
- Si existe un identificador (la cédula, en el SIL+), se cruza por ese y no
  por el nombre.

## Validación

- Las verificaciones de integridad **reportan**, no corrigen. Si aparecen 56
  o 58 diputaciones, el script lo dice y sigue; que un humano decida.
- Los cuadres conocidos (57 en total, 31/17/7/1/1 por bancada, 18/12/6/6/5/5/5
  por provincia) son la red de seguridad principal.

## Red y errores

- Solo `GET`. Nunca se escribe en la fuente.
- Reintentos con espera creciente; a la tercera falla se lanza `FuenteError`.
  Preferimos fallar ruidosamente antes que publicar datos a medias.
- `User-Agent` identificable, con el propósito del proyecto.
- URLs de SharePoint: `unquote` antes de `quote`. Vienen mezcladas, unas ya
  codificadas y otras con espacios literales.

## Windows

- `PYTHONIOENCODING=utf-8` siempre. SharePoint inyecta caracteres de ancho
  cero (`​`) que revientan la consola por defecto.
- La función `limpiar()` los quita; usarla en todo texto que venga de la API.
