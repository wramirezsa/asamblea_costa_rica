# Asamblea Abierta CR

Mapa interactivo del plenario de la Asamblea Legislativa de Costa Rica,
período **2026-2030**. Proyecto ciudadano independiente, sin vínculo con la
Asamblea Legislativa.

Pasás el puntero sobre una curul y ves quién la ocupa. Hacés clic y se abre su
ficha completa. Te acercás y las curules se convierten en caras.

## Qué muestra

- Las **57 diputaciones** con su fotografía oficial, agrupadas por bancada.
- Dos vistas: **Composición** (diagrama de reparto de escaños) y **Salón 3D**
  (el salón de sesiones reconstruido con su forma real: sala rectangular con
  dos bancadas enfrentadas, no un hemiciclo).
- Ficha por persona: provincia, profesión, edad, cédula, correo oficial,
  redes sociales y biografía (educación, experiencia laboral y política,
  áreas de interés).
- Composición de la Asamblea con los umbrales de mayoría simple y calificada.
- **Actividad legislativa**: leyes aprobadas, mociones con su resultado e
  intervenciones en plenario. Cada bloque indica **cuándo la Asamblea
  actualizó ese dato por última vez**, no cuándo lo extrajimos.
- Buscador y filtros por bancada y provincia.

## Qué NO muestra, y por qué

Asistencia diaria y votaciones nominales. La Asamblea dejó de publicar su
conjunto de asistencia en **2019** y no expone las votaciones del plenario en
formato estructurado. Antes que llenar ese vacío con estimaciones, lo dejamos
visible. Detalle completo en [`docs/fuentes-de-datos.md`](docs/fuentes-de-datos.md).

## Requisitos

Python 3.10+ y Node 20+.

## Puesta en marcha

```bash
PYTHONIOENCODING=utf-8 python etl/fetch_diputados.py
PYTHONIOENCODING=utf-8 python etl/fetch_directorio.py
PYTHONIOENCODING=utf-8 python etl/fetch_assets.py
PYTHONIOENCODING=utf-8 python etl/derive_colores.py
PYTHONIOENCODING=utf-8 python etl/fetch_actividad.py
PYTHONIOENCODING=utf-8 python etl/publish_web.py

cd web
npm install
npm run dev
```

Abrir http://localhost:5173

## Cómo está armado

```
etl/    Python. Lee la fuente oficial y escribe JSON validado.
data/   raw/ (respuesta cruda, auditable) + processed/ + assets/
web/    Vite + React + TypeScript. Solo consume data/.
docs/   Fuentes, decisiones, estado, backlog y guía de pruebas.
```

El frontend nunca consulta la Asamblea directamente: los datos se refrescan
al correr el ETL y el sitio muestra siempre su fecha de extracción.

## Datos y licencia

Los datos provienen del portal de datos abiertos de la
[Asamblea Legislativa de Costa Rica](https://www.asamblea.go.cr), publicados
bajo **CC BY 4.0**. Las fotografías y banderas son de la Asamblea.

## Documentación

| Archivo | Contenido |
|---|---|
| [CLAUDE.md](CLAUDE.md) | Reglas del proyecto y arquitectura |
| [docs/fuentes-de-datos.md](docs/fuentes-de-datos.md) | Qué datos existen y cuáles no |
| [docs/decisions.md](docs/decisions.md) | Decisiones técnicas y su motivo |
| [docs/current-state.md](docs/current-state.md) | Estado vivo |
| [docs/backlog.md](docs/backlog.md) | Qué sigue |
| [docs/test-playbook.md](docs/test-playbook.md) | Cómo validar |
| [docs/solicitud-transparencia.md](docs/solicitud-transparencia.md) | Gestión ante la Asamblea por los datos abandonados |
