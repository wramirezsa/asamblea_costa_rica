# Arquitectura de información — reorganización del sitio

**Pedido del usuario (2026-10-09):** «me gusta lo que veo, pero a nivel de
información siento que no se hallan bien las cosas». Prioridad 1.

**Restricción:** el **salón 3D está perfecto** — no se toca. Se reorganiza la
información alrededor.

## Inventario: qué hay hoy y dónde

La página es una sola columna larga; todo se descubre bajando:

| # | Bloque | Qué contiene |
|---|---|---|
| 1 | Cabecera | Marca y fecha de los datos oficiales |
| 2 | ¿Quién te representa? | Las 7 provincias |
| 3 | Barra de composición | 31/17/7/1/1, mayoría simple y calificada |
| 4 | Controles | Buscador, chips de bancada, provincia, Caras/Bancadas, Composición/Salón 3D |
| 5 | Barra de votación | Solo si hay una votación activa |
| 6 | Mapa | Composición (SVG) o salón 3D |
| 7 | Votaciones del Plenario | Selector de sesión y lista de votaciones |
| 8 | Actividad legislativa | Leyes, mociones, intervenciones |
| 9 | Pie | Fuentes, qué no se muestra, donaciones (deshabilitado) |

La **ficha** (panel lateral) apila, en una sola tira: identidad, datos
personales, asistencia, votaciones, remuneración y combustible, contacto,
intervenciones y biografía.

## Problemas detectados

1. **No hay navegación.** Votaciones, actividad y fuentes existen, pero solo
   se encuentran bajando; nada en la parte de arriba dice que están ahí.
2. **La ficha mezcla todo sin jerarquía.** Quién es, cómo vota, cuánto gana y
   qué ha dicho están en la misma tira larga; lo más consultado (asistencia,
   votos, remuneración) queda en medio.
3. **Los controles del mapa compiten entre sí**: filtros, modo y vista en el
   mismo renglón, sin agrupar por intención.
4. **Las fuentes y fechas están dispersas**: cada bloque trae la suya, pero no
   hay un lugar que explique de dónde sale todo y qué tan fresco está.
5. **No hay resumen**: no se ve de un vistazo cuántas sesiones, votaciones o
   qué asistencia promedio hay.

## Propuesta

### Página
- **Navegación fija arriba** con secciones: **Plenario** (mapa) · **Votaciones**
  · **Actividad** · **Fuentes**. Enlaces de ancla o rutas propias
  (`/votaciones`, `/actividad`, `/fuentes`), coherentes con `rutas.ts`.
- **Plenario** como portada: «¿Quién te representa?» + mapa. La barra de
  composición pasa a ser cabecera del mapa.
- **Controles agrupados** por intención: *Buscar y filtrar* (buscador, bancada,
  provincia) separado de *Cómo ver* (Caras/Bancadas, Composición/Salón 3D).
- **Fuentes** como sección propia: una tabla con cada conjunto, de dónde sale,
  fecha de corte y qué no se muestra. Reúne lo que hoy está en el pie y en las
  notas sueltas.
- Un **resumen en números** arriba de Votaciones (sesiones con acta,
  votaciones, sin verificar, fecha de corte).

### Ficha: pestañas
| Pestaña | Contenido |
|---|---|
| **Perfil** | Datos personales, biografía, contacto |
| **En el Plenario** | Asistencia e historial de votos |
| **Remuneración** | Remuneración y combustible por mes |
| **Intervenciones** | Documentos de intervenciones |

La cabecera de la ficha (foto, bancada, provincia, cargo) queda siempre
visible. Cada pestaña cierra con su propia fuente y fecha de corte.

## Reglas que no cambian
- Regla número uno: nada sin fuente; vacío = «Sin dato oficial».
- Lo derivado se declara donde se muestra.
- Color nunca como único portador de significado.
- Los filtros atenúan, no ocultan.

## Estado
- [x] Validar la propuesta con el usuario: «démosle de una con todo»
  (2026-10-09).
- [x] Ficha con pestañas (2026-10-09): Perfil · En el Plenario · Remuneración ·
  Intervenciones. Votaciones se cargan recién al abrir su pestaña.
- [x] Navegación fija y secciones con ruta propia (2026-10-09): `/` (Plenario),
  `/votaciones`, `/actividad`, `/fuentes`. Los enlaces son `<a>` reales (se
  pueden abrir en otra pestaña) y atrás/adelante funciona. «Ver en el mapa»
  desde Votaciones vuelve al Plenario con la votación pintada.
- [x] Controles del mapa agrupados: *Buscar y filtrar* y *Cómo ver*. La barra
  de composición quedó como cabecera del mapa.
- [x] Sección Fuentes: tabla con cada conjunto, su fuente oficial (las URL y
  notas vienen del payload) y su última extracción; qué no mostramos y por
  qué; qué es reconstrucción o cálculo propio.
- [x] Resumen en números de Votaciones: sesiones con acta, votaciones
  publicadas, excluidas por no cuadrar (y con resultado sin verificar) y
  actas sin texto todavía. Todo conteo directo, nada estimado.

La ficha abre en **En el Plenario** (asistencia y votos), que va primera;
Perfil queda segunda. Pedido del usuario el 2026-10-12.

En celular se mantuvo la decisión previa de mostrar el mapa antes que los
filtros. La cabecera fija ocupaba 171 px; ahora solo queda pegada la fila de
navegación (38 px) y la fecha se muestra sin la etiqueta, que sigue ahí para
lectores de pantalla.

De paso se corrigieron dos textos que ya no eran ciertos: el pie decía que el
sitio no muestra asistencia ni votaciones nominales (se muestran desde
ADR-021) y Actividad decía que la asistencia y los vehículos «dejaron de
alimentarse» (se mudaron al portal de datos abiertos, ADR-020).
