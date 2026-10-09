# Cómo validar el proyecto

## Regenerar todo desde cero

En Windows, siempre con `PYTHONIOENCODING=utf-8`:

```bash
PYTHONIOENCODING=utf-8 python etl/fetch_diputados.py
PYTHONIOENCODING=utf-8 python etl/fetch_directorio.py
PYTHONIOENCODING=utf-8 python etl/fetch_assets.py
PYTHONIOENCODING=utf-8 python etl/derive_colores.py
PYTHONIOENCODING=utf-8 python etl/fetch_actividad.py
PYTHONIOENCODING=utf-8 python etl/publish_web.py
```

El orden importa: cada paso consume la salida del anterior.

## Qué tiene que dar

| Paso | Salida esperada |
|---|---|
| `fetch_diputados` | `57 diputaciones`, `sin advertencias de integridad` |
| | `{'PPSO': 31, 'PLN': 17, 'PFA': 7, 'CAC': 1, 'PUSC': 1}` |
| `fetch_directorio` | 6 miembros; 3 marcados `[mesa]`; sin avisos |
| `fetch_assets` | `57 descargadas`, `8 descargadas`, escudo, sin avisos |
| `derive_colores` | 8 fracciones; CAC marcada como separada por colisión |
| `publish_web` | `54 en bancadas (N curadas, M por curar) + 3 en la mesa` |
| `fetch_actividad` | 1.617 leyes, ~27.000 mociones, 160 intervenciones (56/57) |
| `curules.py` | mapa de asientos; debe decir `54 curadas, 0 por curar` |

**Cualquier desviación se investiga, no se ignora.** Si el conteo no da 57 es
que cambió la composición (renuncia, sustitución) o cambió la fuente. Las dos
cosas hay que entenderlas antes de seguir.

## Frontend

```bash
cd web
npx tsc --noEmit     # debe salir sin errores
npm run dev          # http://localhost:5173
npm run build        # antes de cualquier despliegue
```

`tsc -b` (el que corre `npm run build`) es más estricto que `--noEmit` y
detecta cosas que el otro deja pasar. Ante la duda, vale el `build`.

**Si un identificador importado aparece como "is not defined" en el navegador**,
casi siempre es la caché de dependencias de Vite quedando obsoleta al agregar
un import nuevo. Se arregla con:

```bash
rm -rf web/node_modules/.vite
```

y reiniciando el servidor.

## Comprobaciones manuales

Con el sitio abierto:

1. **Carga.** Aparecen 57 curules con foto. La cabecera muestra la fecha de
   extracción.
2. **Composición.** La barra suma 57 y los segmentos guardan proporción con
   los chips.
3. **Zoom.** Rueda del ratón acerca y aleja; a partir de ~3,4× salen los
   apellidos. El botón de vista completa vuelve al inicio.
4. **Modos.** "Bancadas" deja solo color; "Caras" devuelve las fotos.
5. **Globo.** Al pasar el puntero sale foto, nombre, bandera de bancada,
   provincia y profesión.
6. **Ficha.** Al hacer clic abre el panel. El mapa **no** debe volar (la
   curul ya está a la vista). `Esc` cierra.
7. **Vuelo.** Al elegir desde el buscador **sí** debe volar hasta la curul.
8. **Buscador.** "villalta" deja una sola curul encendida y el resto
   atenuadas; el chip dice `1 de 57`.
9. **Filtros.** Bancada y provincia se combinan con el buscador.
10. **Sin datos inventados.** Abrir una ficha con campos incompletos: tiene
    que decir *"Sin dato oficial"*, nunca un valor de relleno.
11. **Artefacto de composición.** Abrir y cerrar varias fichas seguidas: no
    debe quedar ninguna mancha clara sobre el mapa (ver ADR-006).
12. **Salón 3D.** Entrar a la vista: aparece la sala rectangular con las dos
    bancadas enfrentadas y el Directorio al fondo. Las 57 caras se ven **desde
    cualquier ángulo** al girar (si alguna queda de espaldas, se rompió el
    Billboard, ADR-008). Hover sobre una cara muestra el globo; el clic abre
    la ficha.
13. **Peso del 3D.** En `npm run build`, el fragmento de Three.js debe salir
    separado del bundle principal. Si el índice se dispara sobre ~300 KB, se
    perdió la carga diferida.
14. **Escudo.** Girar la cámara mirando al muro del fondo: el escudo debe verse
    limpio. Si aparece rayado con las líneas de los listones, volvió el
    z-fighting (ADR-010).
15. **Límites de cámara.** Alejarse al máximo y desplazar con el botón derecho:
    nunca debe verse el salón desde afuera ni el vacío detrás de los muros
    (ADR-011). A la vez, el desplazamiento **sí** debe alcanzar las curules del
    fondo y las de la entrada: si no llegan, el recorte del punto de mira
    volvió a ser una esfera.
15b. **Volar a una curul.** Escribir un apellido que deje una sola coincidencia:
    la cámara debe viajar hasta esa curul, con la persona iluminada y el resto
    atenuado. Es el gesto central para curar el mapa.
16. **Mesa del Directorio.** Tres personas sentadas de cara al plenario, con
    aro dorado. La del centro es la Presidencia. Al pasar el puntero, el globo
    muestra el cargo.
17. **Curaduría de curules.** El aviso del 3D dice cuántas van verificadas. Al
    pasar el puntero sobre alguien, el globo muestra su curul (p. ej.
    `S1-F1-A11`) y si está verificada o pendiente. Una curul curada en
    `data/curated/asignacion_curules.json` debe aparecer exactamente donde
    dice el archivo; si no, `python etl/curules.py` lo reporta como aviso.

18. **Actividad legislativa.** Bajo el mapa aparecen tres tarjetas con su
    sello de actualización. El sello debe reflejar **la fecha de la fuente**,
    no la del ETL: si dice "hoy" en mociones, es porque la Asamblea las tocó
    hoy. Los botones "Ver las más recientes" despliegan el listado.
19. **Intervenciones en la ficha.** Abrir una diputación con documentos: debe
    aparecer la sección con enlaces al `.docx` oficial. Juan Manuel Quesada
    Espinoza es el único sin registro, así que su ficha no muestra la sección.

20. **Enlaces directos.** Abrir en frío `/diputado/jose-maria-villalta-florez-estrada`:
    la ficha debe abrirse sola y el título del navegador debe ser el nombre de
    esa persona. Abrir `/provincia/cartago`: Cartago queda activa y solo sus 6
    diputaciones se ven resaltadas. **Si la pantalla se queda cargando, alguna
    ruta de recurso volvió a ser relativa** (ADR-017).
21. **Volver con el botón atrás.** Tras abrir una ficha y cerrarla, el botón
    atrás del navegador debe devolver a donde estaba.
22. **Móvil.** En 375 px de ancho, el mapa debe verse sin hacer scroll más allá
    de la banda de provincias.

## Votaciones desde la transmisión

Vía aparte, fuera del ciclo de publicación. Ver ADR-018 y ADR-019.

**Prueba de regresión fija.** La revisión 497 de la sesión Ordinaria #58 se
verificó a mano contra el fotograma del tablero. Debe seguir dando lo mismo:

```bash
PYTHONIOENCODING=utf-8 python etl/fetch_votaciones.py --video dzBsCitMFAo
```

Esperado: `1 a favor / 42 en contra`, tablero en `1:19:45`. Si cambia, algo se
rompió en el parseo o en el índice de tiempos.

Otras comprobaciones:

- Una corrida parcial (`--video`) **no** puede reducir el total del JSON: se
  funde con lo ya extraído. Debe seguir diciendo 77 sesiones.
- `_publicable` tiene que seguir en `false` mientras no exista el contraste
  contra el tablero. Si alguien lo pone en `true`, tiene que haber un ADR.
- Cero votaciones en una sesión es válido (control político). Lo que **no** es
  válido es cero votaciones con marcadores del ritual presentes: eso significa
  que el patrón dejó de calzar y el script lo advierte.

## Actas del Plenario (SIL+)

Fuente primaria del voto nominal y de la asistencia por sesión. Ver ADR-021.

**Prueba de regresión fija.** El acta de la ordinaria #58 (27/08/2026) se
contrastó a mano contra el tablero de votación de la transmisión:

```bash
PYTHONIOENCODING=utf-8 python etl/fetch_actas.py --desde 2026-08-27 --hasta 2026-08-27 --sin-descargar
```

Esperado para la ordinaria #58: **50 presentes, 171 votaciones, 171
publicables**. En la revisión 497 (`REVISION MOCION FONDO #497 EXP 24290`):
a favor solo `joselyn-saenz-nunez`; no votación `jose-maria-villalta-florez-estrada`
y `sigrid-segura-artavia`; 42 en contra. Si algo de esto cambia, se rompió el
lector del acta (`etl/lib/acta.py`) o la tabla de equivalencias.

Otras comprobaciones:

- `variantes_sin_resolver` en `data/processed/actas_plenario.json` tiene que
  estar vacío o explicado. Una variante nueva **no** se resuelve sola: se
  revisan sus candidatos y, si es inequívoca, se agrega a mano a
  `data/curated/equivalencias_nombres.json` con su motivo.
- Una sesión con cero votaciones puede ser correcta (control político). Se
  contrasta con el subtítulo: si el subtítulo encontró votaciones y el acta
  no, es un aviso.
- Si el SIL+ responde «Error del Sistema», el protocolo cambió: el ETL aborta
  y hay que volver a capturarlo (ADR-021). No se reintenta a ciegas.

## Actualización automática

`python etl/actualizar.py` corre el ETL en orden (padrón, Directorio,
actividad, actas de los últimos 14 días y payload del sitio) y deja una
bitácora en `data/bitacora/`. Códigos de salida: **0** sin novedad; **1** un
paso falló y el sitio quedó con el último dato bueno; **2** corrió bien pero
hay algo que requiere ojo humano (otra cantidad de diputaciones, un nombre de
acta sin resolver, votaciones no publicables, actas que no aparecen).

**En producción corre en GitHub** (`.github/workflows/actualizar.yml`,
ADR-024): todos los días a las 06:17 de Costa Rica, y a mano desde la pestaña
Actions → «Actualizar y publicar» → *Run workflow*. Cómo comprobar una
corrida:

- El resumen de la corrida muestra la salida de `actualizar.py`; la bitácora
  completa va adjunta como artefacto `bitacora`.
- Código 0 o 2: aparece un commit «Datos: actualizacion automatica del …»
  de `github-actions[bot]` (si algo cambió) y el sitio se publica.
- Código 2: se abre o actualiza el issue «La actualizacion automatica
  requiere atencion». Código 1: corrida en rojo, nada se guarda ni se publica.
- En la nube los `.docx` de las actas no persisten: `--solo-nuevas` evita
  volver a bajarlos. Para reprocesar actas viejas (cambió el lector o la
  tabla de equivalencias), correr `fetch_actas.py` en local y subir el
  resultado.

Programarlo en Windows ya no hace falta y choca con los commits del bot. Si
se quisiera de todos modos (reemplazar las rutas; la de python sale de
`where python`):

```
schtasks /Create /TN "Asamblea Abierta - actualizar" /SC DAILY /ST 06:00 /TR "<ruta a python.exe> <ruta del proyecto>/etl/actualizar.py"
```

Con `--completo` también refresca fotos, banderas y colores; basta una vez
por semana.

## Antes de dar una tarea por terminada

- [ ] El ETL corre limpio de punta a punta y los cuadres dan.
- [ ] `npx tsc --noEmit` sin errores.
- [ ] Las comprobaciones manuales de arriba pasan.
- [ ] Ningún dato nuevo sin `_fuente`; ningún derivado sin marcar como tal.
- [ ] `docs/current-state.md` actualizado.
- [ ] Si se tomó una decisión de peso, quedó un ADR en `docs/decisions.md`.
