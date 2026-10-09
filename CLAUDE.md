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

Portal vigente de datos abiertos: subsitio **`pa/datosabiertos`**, biblioteca
`Documentos compartidos/`, con Excel mensuales de asistencia, salarios,
vehículos, combustible y viajes. Los subsitios no se pueden enumerar por la
API: un conjunto viejo congelado puede haberse **mudado**, no muerto. Ver
ADR-020.

Actas del Plenario —voto nominal y presentes por sesión—: **SIL+**, en
`produccion.asamblea.go.cr/SILConsulta`. Es una aplicación interna sin API
documentada; el protocolo está en ADR-021.

## Cómo trabajar en este repo

Regenerar todo (en orden, cada paso depende del anterior):

```bash
python etl/fetch_diputados.py    # padron oficial de 57
python etl/fetch_directorio.py   # Directorio Legislativo
python etl/fetch_assets.py       # fotos, banderas, escudo
python etl/derive_colores.py     # color por bancada
python etl/fetch_actividad.py    # leyes, mociones, intervenciones
python etl/fetch_gasto.py        # remuneracion y combustible por diputacion
python etl/publish_web.py        # geometria + payload del sitio
cd web && npm run dev
```

`python etl/curules.py` muestra el mapa de asientos y el estado de la
curaduría; `--set` y `--quitar` la editan.

Las votaciones y la asistencia por sesión tienen su propia vía:

```bash
python etl/fetch_actas.py         # actas oficiales del SIL+: presentes y voto nominal
python etl/fetch_sesiones.py      # indice de transmisiones (solo para contrastar)
python etl/fetch_votaciones.py    # totales del subtitulo (solo para contrastar)
```

`fetch_actas.py` es la **fuente primaria** (ADR-021): lee el acta oficial de
cada sesión, valida cada votación y marca `publicable` solo las que cuadran.
`publish_web.py` la publica: el resumen de asistencia va en `asamblea.json` y
las votaciones en `datos/votaciones.json`, que el sitio carga aparte (ADR-022). Las otras dos no se publican nunca:
son totales transcritos por una máquina y sirven para detectar actas
incompletas (ADR-018, ADR-019). Los nombres que el acta escribe distinto que
el padrón se resuelven con `data/curated/equivalencias_nombres.json`, que se
edita a mano.

Todo lo anterior corre en un solo paso con `python etl/actualizar.py`, que
se puede programar a diario (ver `docs/test-playbook.md`).

En producción, `.github/workflows/actualizar.yml` corre cada día
`etl/actualizar.py --fuentes sil` (actas), guarda `data/` en el repo y
publica el sitio en GitHub Pages (ADR-024). **`www.asamblea.go.cr` no
responde desde fuera de Costa Rica**: el padrón, la actividad y el gasto
(`--fuentes sharepoint`) solo se pueden extraer desde una computadora en el
país: la tarea programada de Windows lo corre con `--subir` en una copia
dedicada (`%LOCALAPPDATA%\AsambleaAbierta\repo`) y el push publica. Antes de
trabajar en local, `git pull`: llegan commits de datos a diario.

Antes de dar una tarea por terminada, ver `docs/test-playbook.md`.

## Restricciones

- **Windows**: usar `PYTHONIOENCODING=utf-8` al correr el ETL, o los acentos
  revientan la consola.
- **TLS**: los servidores de la Asamblea mandan solo su certificado, sin el
  intermedio. El SharePoint corre sin verificar (ADR-002); el SIL+ verifica
  con el intermedio guardado en `etl/lib/certs/` (ADR-024). Windows completa
  la cadena solo: que algo funcione en local no prueba que funcione en Linux.
- Sin dependencias de pago. El ETL es Python plano y corre igual en local;
  la nube (GitHub Actions + Pages, gratis en repos públicos) solo lo
  programa y publica (ADR-024).
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
   Igual con `data/curated/equivalencias_nombres.json`: variantes de nombre de
   las actas, una por una y con su motivo. Nunca por parecido.
7. Que la solicitud de transparencia (2026-09-02) **fue respondida a tiempo**
   (2026-10-01) y ya se evaluó: en lo esencial es correcta y obligó a
   corregir la auditoría propia (ADR-020). Pendiente: el acuse de recibo. Las
   actas sí traen el voto nominal (ADR-021). Bitácora y
   evaluación en `docs/solicitud-transparencia.md`.
8. Que la **fuente oficial del voto nominal y de la asistencia por sesión
   es el acta del Plenario en el SIL+** (ADR-021), con el protocolo de
   descarga documentado ahí. Las 3.215 votaciones extraídas de la transmisión
   (`data/processed/votaciones.json`) **no son publicables**: son totales del
   subtítulo y quedan solo como contraste.
