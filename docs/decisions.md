# Decisiones técnicas

Formato: fecha · decisión · motivo · impacto.

---

## ADR-001 — API REST de SharePoint en vez de scraping HTML

**2026-09-02**

**Decisión.** Leer los datos por `/_api/web/lists/getbytitle(...)/items` en
lugar de parsear el HTML del sitio.

**Motivo.** La API está abierta sin autenticación y devuelve JSON tipado. El
HTML de SharePoint es generado y cambia con cualquier retoque de plantilla;
la API es estable y trae campos que el HTML ni muestra (cédula, profesión,
biografías, redes).

**Impacto.** ETL mucho más corto y robusto. Dependemos de que la Asamblea no
cierre el acceso anónimo: si eso pasa, `data/raw/` conserva la última copia
buena y habría que reevaluar. Riesgo registrado en el backlog.

---

## ADR-002 — Verificación TLS relajada contra asamblea.go.cr

**2026-09-02**

**Decisión.** En `etl/lib/sharepoint.py` se usa un contexto SSL sin
verificación de cadena.

**Motivo.** El servidor manda una cadena incompleta (no incluye el
certificado intermedio). Los navegadores lo resuelven descargando el
intermedio vía AIA; Python no lo hace y falla con
`unable to verify the first certificate`. No es un problema nuestro sino de
la configuración del servidor.

**Mitigación.** El host está fijo en el código, solo se hacen `GET`, no se
envían credenciales ni datos del usuario, y todo lo que se lee es información
pública. El riesgo real es que alguien en la red sirva datos falsos; se
acota con las verificaciones de integridad del ETL (conteo de 57, cuadre por
partido).

**Alternativa descartada por ahora.** Empaquetar el certificado intermedio y
verificar contra él. Es lo correcto a futuro; queda en el backlog.

---

## ADR-003 — El hemiciclo agrupa por bancada, no por curul real

**2026-09-02**

**Decisión.** Las 57 curules se dibujan en 5 arcos concéntricos y se asignan
por bancada en el orden PPSO, PLN, PFA, PUSC, CAC (izquierda a derecha del
Directorio). La interfaz lo declara con un aviso permanente.

**Motivo.** La Asamblea **no publica** el asiento de cada diputación. Existe
la norma (Reglamento del Ceremonial Protocolar, art. 15) y hay reportes de
prensa sobre el acomodo, pero no el detalle persona-curul. Inventar la
asignación individual sería exactamente el tipo de mentira que hunde el
proyecto.

**Impacto.** El mapa se lee correctamente como distribución política, que es
su función principal. Lo que no puede afirmarse es "esta persona se sienta
aquí". Si aparece la fuente real, solo cambia `publish_web.py`: el frontend ya
lee `hemiciclo.confianza`, que pasaría de `derivado` a `oficial`.

---

## ADR-004 — Colores de bancada derivados de las banderas oficiales

**2026-09-02**

**Decisión.** `etl/derive_colores.py` extrae el color cromático dominante de
la bandera oficial de cada fracción, acota luminosidad y saturación para que
se lea sobre fondo oscuro, y respeta el tono.

**Motivo.** Elegir colores "a ojo" es una decisión editorial invisible que el
lector no puede auditar. Derivarlos de un activo oficial los hace trazables:
cada color guarda `derivado_de` y `hex_derivado`.

**Detalle.** Cuando dos bancadas quedan a menos de 22° de tono (pasó con PFA
y CAC, ambas amarillas), se corre el tono de la bancada **más pequeña** lo
mínimo necesario y se marca `separado_por_colision: true`. CAC se movió 11°
(de `#fbbe0e` a `#fb930e`). El color original nunca se pierde.

**Impacto.** Las 5 bancadas con escaños quedan a ≥22° entre sí, legibles para
la mayoría de daltonismos por diferencia de tono y luminosidad a la vez.

---

## ADR-005 — El frontend no consulta fuentes externas

**2026-09-02**

**Decisión.** `web/` solo lee `web/public/datos/asamblea.json` y los activos
locales. Las fotos se descargan y se sirven desde el propio sitio.

**Motivo.** Tres razones: no le generamos carga a la Asamblea con cada visita;
el sitio no se cae ni se degrada si la fuente está caída; y la fecha del dato
mostrada al usuario es siempre cierta, porque corresponde a una extracción
concreta.

**Impacto.** Los datos se actualizan cuando corre el ETL, no en vivo. El
sitio muestra siempre la fecha de extracción para que quede explícito.
Automatizarlo está en el backlog.

---

## ADR-006 — Sin `backdrop-filter` sobre el mapa

**2026-09-02**

**Decisión.** El velo del panel de detalle usa fondo opaco en vez de
`backdrop-filter: blur()`. `.lienzo` lleva `isolation: isolate` y `.panel`
lleva `will-change: transform`.

**Motivo.** Al combinar `backdrop-filter` con la animación de zoom del SVG,
Chrome dejaba una capa GPU obsoleta: una mancha clara sobre el mapa que
sobrevivía a repintados forzados y no correspondía a ningún elemento del DOM.

**Impacto.** Efecto visual casi idéntico, sin el artefacto. Si en el futuro
se agregan más capas animadas sobre el mapa, revisar esto primero.

---

## ADR-007 — El plenario NO es un hemiciclo: se agrega la vista 3D del salón

**2026-09-02**

**Decisión.** Se reconstruye el salón de sesiones en 3D con su forma real —sala
rectangular, dos bancadas escalonadas enfrentadas, mesa del Directorio al
fondo— y se ofrece como vista alternativa. La vista de arcos se renombra a
**"Composición"**.

**Motivo.** Fotografías del plenario mostraron que la sala no tiene forma de
hemiciclo. El diagrama de arcos, presentado como si fuera el salón, afirmaba
algo falso sobre el espacio físico. Como *diagrama de composición* sigue siendo
válido y es una convención reconocida internacionalmente para mostrar reparto
de escaños; el problema era la etiqueta, no el gráfico.

**Datos del edificio** (prensa, verificados): inaugurado en octubre de 2020,
arquitecto Javier Salinas, 57 curules con previsión estructural para 114, cada
curul con pantalla táctil y sistema de votación electrónica. La prensa reporta
que "las curules tienen exacta distribución en el nuevo plenario que en el
actual".

**Alcance de lo reconstruido.** La forma general de la sala está respaldada por
fotografías: **dos gradas por bancada**, no tres. El conteo exacto por grada es
una lectura de esas fotos, no un plano oficial. Queda marcado como
`sala.confianza = "reconstruido"` y declarado en pantalla. Si aparece el plano,
solo cambia la constante `GRADAS` en `publish_web.py`.

**Impacto.** La vista 3D carga en un fragmento aparte (241 KB comprimidos) que
solo se descarga si la persona entra a ella; el arranque del sitio no cambia.

---

## ADR-008 — Los retratos del 3D van en Billboard

**2026-09-02**

**Decisión.** Los retratos sobre cada curul siempre miran a la cámara
(`<Billboard>` de drei) en vez de estar fijos hacia el pasillo.

**Motivo.** Con las caras orientadas al pasillo, al girar la sala media bancada
quedaba de espaldas: solo se veía el aro de color. El propósito de la vista es
reconocer personas; un retrato que se puede perder de vista no cumple.

**Impacto.** El retrato funciona como marcador legible desde cualquier ángulo.
El escritorio y la silla sí conservan su orientación real hacia el pasillo, que
es lo que da la lectura de "dos bancadas enfrentadas".

---

## ADR-009 — El Directorio se sienta en la mesa, no en las bancadas

**2026-09-02**

**Decisión.** Las tres personas que presiden la sesión (Presidencia, Primera y
Segunda Secretaría) se ubican en la mesa del Directorio, de cara al plenario.
Las bancadas pasan de 57 a **54 curules**.

**Motivo.** Es como funciona el salón: quien preside no ocupa su curul durante
la sesión. Mostrar 57 en las bancadas daba una imagen falsa de la sala.

**Fuente.** Página oficial de Integración del Directorio Legislativo. El
extractor (`etl/fetch_directorio.py`) no parsea el HTML por estructura: busca
los nombres del padrón dentro del texto y lee el cargo contiguo. Si un nombre
no está en el padrón, no se acepta; si falta alguno de los tres de la mesa,
falla en vez de dibujar la mesa vacía o inventada.

**Directorio 2026-2030** (los seis cargos, todos de PPSO): Yara Jiménez Fallas
(Presidencia), Gerald Bogantes Rivera (Primera Secretaría), Reynaldo Arias Mora
(Segunda Secretaría), Esmeralda Britton González (Vicepresidencia), Kattya Mora
Montoya (Primera Prosecretaría), Nayuribe Guadamuz Rosales (Segunda
Prosecretaría).

**Impacto.** `GRADAS` en `publish_web.py` suma 54. El cargo aparece en la ficha
y en el globo con una insignia dorada, y quienes presiden llevan un aro dorado
extra en el 3D.

---

## ADR-010 — El escudo va separado del muro de listones

**2026-09-02**

**Decisión.** El escudo nacional se dibuja a 0,55 unidades del muro del fondo,
mientras los listones quedan a 0,09–0,23. Antes estaba pegado a ellos.

**Motivo.** Compartían casi la misma profundidad y la GPU no podía decidir cuál
va delante (*z-fighting*): al mover la cámara, el escudo se veía rayado con las
líneas de los listones atravesándolo.

**Origen del escudo.** Es el logotipo que la propia Asamblea publica en
`SiteAssets/Asamblea Logo.png`, que es el escudo nacional. `fetch_assets.py`
genera además una versión en bronce, porque en el salón el escudo es un relieve
metálico y no la versión a color. El símbolo no se altera: solo su acabado.

---

## ADR-011 — La cámara no puede salirse del salón

**2026-09-02**

**Decisión.** En cada cambio de la cámara se mide, en la dirección que está
mirando, cuánto puede alejarse antes de tocar un muro, y ese valor se le pasa a
`maxDistance`. La sala se cerró por los cuatro costados y se le puso cielo raso.

**Motivo.** Al alejarse, la cámara atravesaba los muros y se veía el salón por
fuera, flotando en el vacío. Eso rompe la sensación de estar adentro.

**Lo que NO funciona, y por qué.** El primer intento recortaba directamente la
posición de la cámara en cada cuadro. Falla: OrbitControls recalcula esa
posición a partir de ella misma, así que el recorte se realimenta, la cámara
colapsa sobre el punto de mira y **la pantalla queda en negro**. El síntoma
engaña, porque no lanza ningún error en consola.

El cálculo va en el evento `onChange` del propio control, no en `useFrame`: así
no compite con OrbitControls ni depende de prioridades del bucle de render.

**El punto de mira sí se puede recortar**, y se recorta contra una **caja**
(`MIRA`). OrbitControls guarda el objetivo tal cual, no lo deriva de la cámara,
así que no hay realimentación. Al principio se usó `maxTargetRadius`, que es
una **esfera**: en una sala larga eso dejaba fuera de alcance las curules del
fondo y las de la entrada, justo las que había que revisar.

**Volar a una curul.** Al seleccionar a alguien —o al dejar una sola persona en
el buscador— la cámara viaja hasta su curul. Se animan **juntos** el objetivo y
la posición, y se llama `update()`: ese par coherente es lo que OrbitControls
espera. Mover solo la posición es lo que rompía la vista.

---

## ADR-012 — Bancada izquierda entera de PPSO, derecha toda la oposición

**2026-09-02**

**Decisión.** La bancada izquierda tiene **28 curules, todas de PPSO**, y la
derecha **26**, con PLN (17), PFA (7), PUSC (1) y CAC (1). Dos gradas por
bancada.

**Motivo.** El reparto deja de ser una elección nuestra y pasa a estar anclado
a una fuente. La prensa reportó que "PPSO quedó al lado izquierdo del
Directorio con 28 de sus diputaciones, mientras PLN, PFA y las fracciones de
una persona quedaron en el sector derecho" (observador.cr, abril 2026).

Ese 28 no cuadraba contra las 31 diputaciones de PPSO y quedó anotado como
inconsistencia de la prensa. **Cuadra al descontar las tres que se sientan en
la mesa del Directorio**: 31 − 3 = 28. Y las demás fracciones suman
exactamente 26. Total 54, que son las curules de bancada.

**Impacto.** Dentro de cada bancada las curules se llenan por tramos continuos
que abarcan ambas gradas, no grada por grada; de lo contrario un partido
quedaría todo adelante y otro todo atrás. La asignación individual sigue sin
ser un dato público y se mantiene declarada como ilustrativa (ADR-003).

---

## ADR-013 — Curaduría manual del mapa de curules

**2026-09-02**

**Decisión.** Se crea `data/curated/asignacion_curules.json`, editado a mano,
donde se registra qué diputación ocupa cada curul. El ETL **nunca** lo
sobreescribe. Lo curado manda; lo que falta se coloca por regla automática.

**Numeración.** `S{sección}-F{fila}-A{asiento}`:
- **Sección 1** oficialismo (izquierda del Directorio), **sección 2** oposición
- **Fila 1** pegada al pasillo central; **fila 2** contra la pared
- **Asiento 1** el más cercano al Directorio, contando hacia la entrada
- La mesa del Directorio usa `MESA-1..3` y viene de fuente oficial

**Motivo.** La Asamblea no publica el asiento de cada persona y no hay indicios
de que lo vaya a hacer. Levantarlo por observación directa es la única vía. Lo
importante es que **no se confunda con un dato oficial**: cada curul lleva
`origen` (`curado` | `derivado`) y el sitio lo muestra —al pasar el puntero se
ve la curul y si ya fue verificada, y el aviso lleva el conteo de avance.

**Validaciones.** El repartidor reporta, sin corregir: curul inexistente, slug
fuera del padrón, curul asignada dos veces, persona en dos curules, alguien de
la mesa del Directorio puesto en bancada, descuadre entre personas y asientos
libres, y una curul curada cuyo partido contradice su sección.

**Herramienta.** `python etl/curules.py` imprime el mapa y lo que falta por
curar. Es el tablero de avance de esta tarea.

---

## ADR-014 — Solo se publica lo que la Asamblea mantiene al día

**2026-09-02**

**Decisión.** Se auditó la vigencia de todas las listas grandes midiendo el año
de última modificación. El sitio solo muestra los conjuntos vivos: leyes
aprobadas, mociones e intervenciones. Cada bloque exhibe **la fecha en que la
Asamblea tocó el dato**, no la de nuestra extracción.

**Motivo.** Publicar un conjunto congelado en 2016 como si fuera vigente sería
engañoso aunque el dato en sí sea cierto. Y mostrar la fecha del ETL en vez de
la de la fuente escondería exactamente lo que hay que hacer visible: cuándo
un conjunto deja de alimentarse.

**Hallazgo.** La mayor parte del catálogo está abandonado: órdenes del día
2016, uso de la palabra 2018, asistencia y actas 2019, uso de vehículos 2021,
proyectos dictaminados 2022. Eso descarta publicar gasto por diputación como
dato vigente, que estaba en el backlog.

**Impacto.** El sitio muestra tres bloques con su sello de frescura. Si mañana
uno se congela, se nota solo, sin que nadie tenga que auditarlo.

---

## ADR-015 — Verificar que una fuente no sirve ≠ verificar que no existe ninguna

**2026-09-02**

**Contexto.** Al fundamentar la solicitud de transparencia se buscó qué norma
obliga a la Asamblea a publicar datos. Se encontró la **Ley 10520**, se
verificó que su artículo 2 excluye al Poder Legislativo, y se concluyó que
**no existía ley aplicable**, dejando la gestión apoyada solo en la
Constitución y en la Ley 9097.

**El error.** Esa conclusión era falsa. Existe la **Ley N.º 10554, Ley Marco
de Acceso a la Información Pública** (vigente desde el 1.º de noviembre de
2024), cuyo artículo 5, inciso b), incluye expresamente a los **Poderes
Legislativo y Judicial** entre los sujetos obligados. Lo encontró el dueño del
proyecto con una búsqueda directa.

**Por qué importa.** La carta habría llegado con un fundamento débil,
invocando una norma constitucional genérica cuando existía una ley específica
con plazos, formatos abiertos exigidos y régimen sancionatorio. Una gestión
real se habría debilitado.

**Regla que queda.** Comprobar que una fuente concreta no sirve es un
hallazgo. Afirmar que **no existe ninguna** es una afirmación mucho más fuerte
que exige agotar la búsqueda: probar varias formulaciones, buscar por el
nombre genérico de la categoría, revisar si hay normas posteriores y leer el
texto oficial, no resúmenes. Si aun así no aparece, se dice **"no lo
encontré"**, nunca **"no existe"**.

Es el mismo principio que la regla número uno del proyecto, aplicado a la
investigación: un vacío declarado con honestidad vale más que una conclusión
cómoda.

---

## ADR-016 — La solicitud se funda en la Ley 10554

**2026-09-02**

**Decisión.** La solicitud de transparencia se apoya en la **Ley N.º 10554**
como norma principal, con la Constitución (arts. 27 y 30) como respaldo y la
Ley 9097 como vía subsidiaria.

**Motivo.** La 10554 obliga expresamente al Poder Legislativo (art. 5.b) y
aporta lo que las otras no: plazo de **diez días hábiles** (art. 10), entrega
**en formatos abiertos** (art. 13), **acuse de recibido** obligatorio (art.
12), publicación oficiosa actualizada (art. 16), amparo por omisión (art. 14)
y **régimen sancionatorio** (art. 15). Su Transitorio único dio seis meses
desde octubre de 2024 para actualizar los sitios web: ese plazo venció.

La Ley 9097 queda subsidiaria porque su propio artículo 3 excluye los asuntos
con procedimiento y plazos específicos, y la 10554 ya los establece.

**Detalle práctico.** La 10554 (art. 11) exige **únicamente** nombre,
identificación, información solicitada y medio de respuesta —sin firma y sin
justificar motivos—, mientras la 9097 (art. 4) sí exige firma. La carta
incluye firma porque cubre ambas vías sin costo. Lo que no se hace es explicar
por qué se pide la información: la ley prohíbe condicionarlo a eso.

**Estado.** Enviada el 2026-09-02. A la espera de respuesta.

---

## ADR-017 — Ruteo propio y "¿Quién te representa?"

**2026-09-03**

**Contexto.** Se investigó qué existe ya en Costa Rica. **Acontecer** tiene un
Monitor Legislativo con votaciones en tiempo real, más de 5.000 expedientes
rastreados cada 30 minutos, transmisión en vivo y canal de Telegram.
**Delfino** publica voto nominal. Ambos con redacción detrás.

**Conclusión estratégica.** No competir en monitoreo: ahí perdemos. Pero
**ninguno tiene representación visual del plenario** —usan tablas, fotos
miniatura y contadores—, y el mapa de curules no lo publica nadie, ni la
Asamblea. Ese es el terreno propio: la dimensión espacial y humana. Ellos
responden "qué pasó hoy"; nosotros, "quiénes son y dónde están".

**Decisión 1 — Ruteo.** Se agregan tres rutas con History API, sin
dependencias: `/`, `/diputado/{slug}` y `/provincia/{provincia}`. Título y
descripción cambian según la ruta.

**Motivo.** El sitio vivía en una sola dirección: no se podía enlazar a una
diputación. Nadie comparte lo que no puede enlazar, y los buscadores no tenían
qué indexar más allá de la portada. Es el cuello de botella de la difusión.

**Decisión 2 — "¿Quién te representa?"** Banda superior con las siete
provincias y su número de diputaciones. Al elegir una, el plenario resalta a
esas personas.

**Motivo.** Casi nadie llega buscando "datos legislativos", pero mucha gente no
sabe quiénes son sus diputaciones, y en Costa Rica se eligen **por provincia**.
Esa pregunta sí existe, la respuesta ya estaba completa en el padrón, y vivía
escondida en un selector entre otros controles.

**Bug que destapó el ruteo.** Todas las rutas de datos e imágenes eran
**relativas** (`datos/asamblea.json`, `assets/fotos/...`). Desde
`/diputado/villalta` resolvían a `/diputado/datos/...` y daban 404: **el sitio
entero se rompía en cualquier enlace directo**, sin error visible más allá de
la pantalla de carga. Se centralizaron en el ayudante `recurso()` de
`rutas.ts`, que respeta `BASE_URL` por si algún día se publica bajo un
subdirectorio.

**Regla que queda:** al servir un sitio de una sola página con rutas anidadas,
toda referencia a un recurso debe ser absoluta. Una ruta relativa funciona en
la portada y falla en todo lo demás.

**Orden en móvil.** El mapa quedaba enterrado bajo cinco filas de controles.
Con `order` en CSS, en pantalla chica va: cabecera → provincias → composición →
**mapa** → filtros. Lo que nos distingue se ve sin hacer scroll.

---

## ADR-018 — El voto nominal SÍ es extraíble desde la transmisión

**2026-09-03**

**Hallazgo.** Se probó de punta a punta con la sesión **Ordinaria #58 del 27 de
agosto de 2026** (`dzBsCitMFAo`, 4 h 20 m) y funciona.

**1. Las sesiones del Plenario tienen subtítulos automáticos en español.**
Cuatro de cuatro los tienen (`es`, `es-orig`). Las Comisiones Plenas, no.
No hace falta transcribir con Whisper: YouTube ya lo hace.

**2. El ritual de votación es rigurosamente regular**, y por eso parseable:

> «Abrir puertas. **Revisión 497**. Cerrar puertas **con 43 diputados**.
> Iniciar votación. […] Finalizar votación. **42 en contra, uno a favor.
> Rechazado**.»

De una sola sesión se extrajeron automáticamente **149 votaciones** con sus
totales y resultado, **132 conteos de diputaciones presentes** (rango 39 a 46)
y **161 identificadores de moción**. La suma favor+contra coincide con los
presentes declarados.

**3. El tablero en pantalla trae el voto nominal completo.** Extrayendo el
fotograma en el instante que marca el subtítulo, se obtiene:

```
Lista de Señoras y Señores Diputados
A favor — Voto: 1        Joselyn Sáenz Núñez
Contra  — Voto: 42       [42 nombres en cuatro columnas]
No-Votación — Total: 2   José María Villalta, Sigrid Segura
```

Texto tabular, alto contraste, perfectamente legible. **Y cuadra con el
subtítulo**: la revisión 497 decía «42 en contra, uno a favor» y el tablero
muestra exactamente eso. Dos fuentes independientes que se confirman.

**4. No hace falta descargar la sesión entera.** El formato 137 (1080p mp4 por
https) permite que ffmpeg salte al segundo exacto y saque un fotograma suelto.
Tres fotogramas costaron ~450 KB cada uno.

**Lo que esto significa.** Costa Rica tendría por primera vez el **voto
nominal en formato abierto y estructurado**, además de un proxy de asistencia
por votación. Ni la Asamblea lo publica ni existe en ningún otro lado en
formato reutilizable.

**Regla de validación, no negociable.** Solo se publica una votación cuando el
tablero y el subtítulo **coinciden en los totales**, y cuando todos los nombres
del tablero se resuelven contra el padrón de 57. Si no coinciden, se reporta y
no se publica. Es la regla número uno aplicada a una fuente nueva.

**Cabos sueltos, honestos:**
- Los nombres se truncan con «…» en el tablero. Se resuelven por prefijo
  contra el padrón, que ya tenemos completo; hay que verificar que ningún
  prefijo sea ambiguo entre las 57.
- Descargar video de YouTube va contra sus términos. La extracción por salto
  es mucho más liviana que bajar la sesión, pero el punto sigue abierto. La
  vía limpia es la lista **«Solicitud de Audios»** de `/ca/`: pedir el
  material por el canal formal, que además refuerza la gestión de
  transparencia ya enviada.
- El ASR confunde algunos números («revisión 52» donde debía decir 502). Por
  eso el número de moción debe cruzarse contra `mociones_total`, que ya
  tenemos con sus 26.923 registros y su calificación.

---

## ADR-019 — Índice de sesiones y extracción de totales: qué se derivó y qué no

**2026-09-04**

Construidos los pasos 1 y 2 de la tubería de ADR-018: `etl/fetch_sesiones.py`
(índice) y `etl/fetch_votaciones.py` (totales desde el subtítulo). Corridos
sobre todo el período: **77 sesiones, 3.215 votaciones**. Cinco decisiones
merecen quedar escritas, porque en todas se eligió declarar antes que rellenar.

**1. Una sesión puede ocupar varios videos, y agruparlos es derivado.**
La extraordinaria #21 se suspendió el 1 de setiembre y siguió el 2; la
ordinaria #31 igual, del 29 al 30 de junio. Contar cada video como una sesión
inflaba el total de 77 a 80. Pero la Asamblea **no declara en ninguna parte**
que dos videos sean la misma sesión: se infiere de que ella misma les puso el
mismo tipo y número. Queda marcado con `_agrupado_por`.

**2. La numeración se cuenta desde 1, no desde el primer video que aparece.**
El índice arranca en la ordinaria #3. Reportar huecos solo entre el mínimo y el
máximo habría escondido que faltan la #1 y la #2. Hallazgo real: **seis
sesiones del Plenario del período no tienen transmisión archivada** —
ordinarias 1, 2, 6 y 20; extraordinarias 8 y 20.

**3. Ningún dato se toma prestado del ciclo anterior.** Si un ciclo de votación
no repite «revisión N», la búsqueda hacia atrás encontraba la del ciclo previo
y le atribuía el voto a la moción equivocada. Se acotó la ventana con una
frontera en el fin de la votación anterior. Preferimos `None` declarado a un
identificador prestado. Solo **948 de 3.215** votaciones tienen número de
revisión legible, y así se dice.

**4. Rechazar con mayoría simple no es una contradicción.** Aparecieron dos
votaciones «rechazadas» con más votos a favor que en contra (30-23 y 34-20).
No es error de lectura: es el umbral de **dos tercios (38 de 57)** operando.
Se anota en el campo `_umbral` y solo se advierte cuando el rechazo ocurre
habiendo superado incluso ese umbral, que sí sería anómalo.

**5. Cero votaciones puede ser el dato correcto.** Diez sesiones no tienen
ninguna: la ordinaria #60 fue control político —«quedan en el uso de la
palabra… levantamos la sesión»— y no se votó nada. Para no confundir eso con
un parser roto, el script advierte solo cuando hay **cero votaciones pero sí
marcadores del ritual** en el subtítulo. Ese aviso apareció en tres sesiones y
destapó un fallo real: el patrón no contemplaba «40 **votos** en contra, nueve
a favor», con la palabra «votos» del lado contrario. Corregirlo recuperó
**479 votaciones** que se estaban perdiendo en silencio.

**El dato NO es publicable todavía**, y el JSON lo dice en `_publicable: false`.
Falta el paso 3 (leer el tablero) y el paso 4 (contrastar). Lo que hay hoy son
totales cantados por la Presidencia y transcritos por una máquina que se
equivoca: en la ordinaria #15 aparecen **59 votos emitidos**, más que las 57
diputaciones. Está reportado, no corregido. Publicar eso sin contrastar es
exactamente lo que la regla número uno prohíbe.

**Prueba de regresión.** La revisión 497 de la sesión #58 sale del extractor
como «1 a favor, 42 en contra» con el tablero en `1:19:45`. Coincide con el
fotograma verificado a mano en ADR-018, al segundo. Ese caso queda como prueba
fija: si algún día deja de dar eso, algo se rompió.

**Cabo suelto de ADR-018 que queda cerrado: los nombres truncados no son un
problema.** Se midió contra el padrón: bastan **9 caracteres** para distinguir
a las 57 diputaciones. La única colisión a 8 son *Antonio Barzuna Thompson* y
*Antonio Trejos Mazariegos*, y se resuelve en el carácter siguiente. El tablero
trunca alrededor de los 20 («Antonio Barzuna Thom…»), muy por encima del
umbral. El riesgo residual no es el truncamiento sino que el tablero use una
**variante del nombre** distinta a la del padrón, y eso solo se comprueba
contra fotogramas reales. Nota aparte: seis primeros apellidos se repiten —hay
cuatro Mora—, así que un tablero que mostrara solo apellidos sí sería ambiguo.
Muestra el nombre completo.

*Actualización 2026-10-08 — el riesgo residual se confirmó.* Releyendo el
fotograma de la revisión 497: el tablero escribe «**Roberth** Junior
Barrant…» y el padrón oficial «**Robert** Junior Barrantes Camacho». A 9
caracteres el prefijo no calza. El cruce del paso 3 necesita una tabla de
equivalencias curada a mano, no coincidencia por parecido. Las tildes («Ruiz»
en el tablero, «Ruíz» en el padrón) sí se resuelven normalizando.

---

## ADR-020 — El portal vigente está en `/pa/datosabiertos/`: la auditoría de abandono miraba ubicaciones viejas

**2026-10-08**

**Qué pasó.** La solicitud de transparencia del 2 de setiembre le dijo a la
Asamblea que asistencia, uso de vehículos y combustible, salarios, viajes y
ejecución presupuestaria «dejaron de alimentarse hace años». La respuesta
oficial del 1 de octubre remitió a `/pa/datosabiertos/`. Verificado contra la
API ese mismo día: el portal se actualiza mes a mes, con archivos publicados
en setiembre y octubre de 2026. **En lo esencial, la Asamblea tenía razón.**
Lo que estaba congelado eran las ubicaciones viejas —`opendata`,
`Diputados/Asistencia_Diputados`, `Diputados/UsoVehiculosYCombustiblesXDiputado`—,
no la publicación.

**Por qué se nos pasó.** `/_api/web/webs` responde 401, así que los subsitios
no se pueden enumerar; la auditoría recorrió los que conocíamos.
`pa/datosabiertos` es un subsitio anidado que no estaba en esa lista. Es la
segunda vez del mismo error de ADR-015: verificar que una fuente concreta no
sirve no es verificar que no existe ninguna.

**Regla nueva.** Antes de declarar muerto un conjunto, buscar su
**sucesor**: la navegación del propio portal, los enlaces de las páginas
institucionales y, si hace falta, preguntar. Un conjunto que se detiene de
golpe en una fecha suele indicar mudanza, no abandono.

**Consecuencias.**

- Corregidos en `fuentes-de-datos.md`: la asistencia en «Lo que NO existe» y
  la auditoría de vigencia, que ahora incluye la tabla del portal vigente.
- **Se reabre el gasto por diputación** —salarios, vehículos, combustible,
  viajes—, que el backlog había descartado.
- La asistencia oficial existe **mensual, por diputación y por órgano**, no
  por sesión. Sirve, siempre que se muestre con su fecha y su granularidad.
  La leyenda de sus columnas es oficial; «Prog» significa «Programadas No
  Realizadas».
- La afirmación de que las actas traen el voto nominal queda **sin
  verificar**: el enlace oficial del SIL a las actas del Plenario respondió
  404 a nuestro cliente. Si se confirma, el acta sería la fuente oficial del
  voto nominal, por encima de la transmisión (ADR-018).
- En la próxima comunicación con la Asamblea corresponde **reconocer** que
  esos conjuntos no estaban abandonados, sino reubicados.

---

## ADR-021 — El voto nominal y la asistencia por sesión salen del acta oficial del SIL, no de la transmisión

**2026-10-08**

**Hallazgo.** Siguiendo las rutas que la Asamblea marcó en rojo en una
captura de su respuesta, se revisó el SIL+ (`produccion.asamblea.go.cr/SILConsulta`,
que se consulta con un usuario anónimo propio: `USR_SIL_ANONIMO`). El acta
oficial de la sesión ordinaria #58 (27/08/2026) es un `.docx` de texto que
trae:

- **«Diputados presentes»**: 50 nombres. Es la asistencia por sesión.
- **171 votaciones con lista nominal completa.** En cada una: «Nombre
  Propuesta» (p. ej. `REVISION MOCION FONDO #497 EXP 24290`, con número de
  expediente), «A Favor (Voto: n)», «En Contra (Voto: n)» y «No-Votación
  (Total: n)», con los nombres completos, sin truncar.
- **Cero descuadres**: en las 171, el total declarado coincide con los
  nombres listados.
- La revisión 497 coincide **nombre por nombre** con el fotograma del
  tablero verificado a mano (ADR-018).
- El extractor por subtítulo había encontrado 149 votaciones en esa sesión;
  el acta tiene 171. **Al subtítulo se le escapaba el 13 %.**

La sesión aparece en la lista del SIL+ el mismo día, pero **el texto del
acta llega después**: el 9 de octubre, las dos sesiones del 8 todavía
respondían «[30016] No existe un texto asociado». *(Corrección: en un primer
momento se dijo que el acta se publicaba el mismo día; lo que aparece ese día
es la fila de la sesión, no el texto.)*

El módulo **«Asistencia a Sesiones Legislativas»** (pantalla
`CNSASISTENCIASESION`) devuelve JSON por sesión y por diputación:
`Cedula_Diputado`, órgano, tipo y número de sesión, fecha, hora y
`Nombre_Asistencia` (PRESENTE, AUSENTE…). Liga por **cédula**, que ya está en
el padrón: no hay que pelear con variantes de nombre. Falta confirmar si
cubre el Plenario; en la muestra revisada solo aparecían comisiones.

**Decisión.** El acta del SIL pasa a ser la **fuente primaria** del voto
nominal y de la asistencia por sesión al Plenario. Es oficial, completa y de
texto: no necesita OCR ni reconocimiento de voz, y no depende de los términos
de uso de YouTube. La tubería de la transmisión (ADR-018 y ADR-019) queda
como **contraste independiente**, no como fuente: sus totales sirven para
detectar actas incompletas. El paso 3 de esa tubería —leer el tablero en el
video— ya no hace falta.

**Protocolo** (capturado en el navegador, sin autenticación):

1. **Sesión.** `GET /SILConsulta/Monitor/Principal` → `POST /SILConsulta/Monitor/Iniciar`
   → `POST /SILConsulta/SIL_CNSACTAPLENARIO_PRINCIPAL`, que abre la pantalla
   y deja las cookies.
2. **Búsqueda por fechas.** `POST .../SIL_CNSACTAPLENARIO_PRINCIPAL/Procesar`
   con `FormData`; cada campo va como `base64|<valor en base64>`:
   `accion=Buscar`, `marco=ff_CNSACTAPLENARIO_FiltroFechas`, `adjuntos=[]`,
   `datos={"Fecha_Inicio":"dd/mm/aaaa 00:00:00","Fecha_Fin":"…","marco":"ff_CNSACTAPLENARIO_FiltroFechas","accion":"Buscar"}`.
   Después, `POST .../Datos` con `marco=ll_CNSACTAPLENARIO_Actas` devuelve las
   filas: `IdSESION`, `Id_Sesion`, `Id_Orden_Dia`, `Numero_Sesion_1`,
   `Fecha_Sesion`, `Nombre_Tipo`.
3. **Acta.** `POST .../Procesar` con `accion=TextoActaSQL`,
   `marco=ll_CNSACTAPLENARIO_Actas` y
   `datos={"seleccion":[<fila>],"marco":"ll_CNSACTAPLENARIO_Actas","accion":"TextoActaSQL"}`
   responde `{"accion":"archivoAbrir","id":"<hex>"}`. Luego
   `GET /SILConsulta/Utilidades/DescargarArchivo?id=<hex>` entrega
   `TextoActa_<Id_Orden_Dia>.docx`. Variantes de acción:
   `TextoSQLActaResumen` y `TextoSQLActaFirmada`.

**Reglas.**

- Es una aplicación interna sin API documentada y puede cambiar sin aviso. El
  ETL falla ruidosamente si cambia la forma de una respuesta; nunca adivina.
- Ritmo prudente: una sesión a la vez y con pausa. Es un servidor de
  producción de la Asamblea.
- **Nombres.** El acta usa variantes respecto del padrón. En la #58, las
  votaciones dicen «Roberth Junior Barrantes Camacho», y la lista de
  presentes usa formas cortas («Gréthel Ávila Vargas», «Roberth J. Barrantes
  Camacho», «Edgardo Vinicio Araya Sibaja»). Hace falta una tabla de
  equivalencias curada a mano, como la de curules; nunca coincidencia
  aproximada.
- **Validaciones antes de publicar.** En cada sección, total declarado =
  nombres listados. Todo votante figura en presentes. Ningún nombre queda
  fuera de las 57. La suma de votos no supera a los presentes.

**Incidente.** Al capturar el protocolo, un clic en «Texto acta» descargó el
acta de la #58 a la carpeta Descargas del usuario antes de que la
intercepción estuviera bien puesta: se había interceptado la función
equivocada. Se le informó en el momento. Las capturas siguientes se hicieron
interceptando `gaMonitor.archivoAbrir`, sin descargar nada.

**Implementación (2026-10-08).** `etl/lib/sil.py` (cliente), `etl/lib/acta.py`
(lector y validaciones) y `etl/fetch_actas.py` (orquestador). Lo que la
primera captura no mostraba y hubo que descubrir al implementarlo:

- **Todos** los campos de formulario viajan como `base64|…`, no solo los de
  `Procesar`. Y el servidor exige los encabezados `sistema`, `basedatos` y
  `diseno`. Sin eso responde «Error del Sistema #70727574» con código 200.
- Antes de abrir la pantalla hay dos pasos (`ObtenerBundleSistema` y
  `ObtenerContextosVisuales`), y la pantalla se abre con
  `parametros={"sistema":"SIL","basedatos":"SIL","ventanaPrincipal":true}`.
  El rango de fechas se fija con `Contexto`.
- Este servidor sí manda la cadena TLS completa: se verifica normalmente, a
  diferencia del SharePoint (ADR-002).

El formato del acta **cambia a lo largo del período**, y el lector lo
contempla sin adivinar:

- En mayo, la lista de presentes viene **numerada y en dos columnas**
  («1.Nogui Acosta Jaén» / «1. Álvaro Ramírez Bogantes»).
- La fecha del día 1 lleva ordinal («Viernes 1º de mayo de 2026»). La línea
  del rango de la legislatura («Del 1º de mayo de 2026 al 30 de abril de
  2027») no es la fecha de la sesión.
- El nombre de la propuesta puede ocupar dos líneas («MOCION SESION» /
  «EXTRAORDINARIA 27 AGOSTO»).
- Hay títulos en mayúsculas sostenidas («MOCIÓN DE PLAZO CUATRIENAL») que no
  son nombres.

En cada caso, mientras no se ajustó el lector, la votación afectada quedó
marcada como **no publicable**: el diseño falla del lado seguro.

**Resultado de la primera corrida completa (2026-10-09).** 109 sesiones del
Plenario (1 de mayo al 7 de octubre de 2026) y **4.780 votaciones nominales,
todas publicables**: en cada una cuadran los totales con los nombres y todos
los nombres se resuelven contra el padrón. Las listas de presentes tienen
entre 47 y 57 nombres. Hay 19 sesiones sin votaciones nominales.

Reglas que salieron de revisar los datos y que se aplican desde ahora:

- **El resultado (aprobada o rechazada) solo se publica si lo que anunció la
  Presidencia coincide con la lista.** En 98 votaciones no coincide: la frase
  correspondía a otra votación cercana, o la Presidencia se corrigió al
  hablar («Cuarenta y cuatro…, ocho en contra» con 48 en la lista). Esas
  quedan con resultado `None`. No se deduce de los conteos, porque el umbral
  depende de la materia.
- **Que alguien vote sin figurar en la lista de presentes es un hecho del
  acta, no un error de lectura.** Pasa en 5 sesiones, con una persona en
  cada una. Se conservan los dos hechos (`votaron_sin_figurar_en_presentes`)
  y no se corrige ninguno.
- **Las actas tienen erratas en los nombres**, incluida una pérdida de la
  primera letra («attya», «osé»). La tabla curada tiene 16 equivalencias,
  todas con su motivo. Una variante nueva corta la lista y se reporta con la
  línea donde se cortó; no se adivina.

---

## ADR-022 — Cómo se muestran las votaciones y la asistencia en el sitio

**2026-10-09**

- **Dos archivos.** El resumen de asistencia viaja en `datos/asamblea.json`
  (+4 KB). Las 4.780 votaciones van en `datos/votaciones.json`: ~800 KB, que
  comprimidos son ~56 KB. Se pide solo al abrir una ficha, al llegar a la
  sección «Votaciones del Plenario» o al entrar por un enlace a una votación,
  y una sola vez.
- **Solo pasa lo validado.** `publish_web.py` copia únicamente las votaciones
  con `publicable = true`.
- **El color nunca va solo.** En el mapa, cada voto lleva color **y** símbolo
  (✓ a favor, ✕ en contra, – no votó). En el globo y en las listas, además,
  va la etiqueta. Quien no figura en la lista de esa votación queda
  atenuado, igual que con los filtros.
- **Resultado solo verificado.** «Aprobada» o «Rechazada» aparece solo si lo
  que anunció la Presidencia coincide con la lista. Si no, dice «Resultado
  sin verificar», con la explicación en el globo de ayuda (ADR-021).
- **Asistencia = lista de presentes del acta.** La ficha muestra «figura en
  la lista de presentes de X de las Y actas publicadas», con el período. El
  porcentaje se declara como cálculo propio. Si la persona votó en sesiones
  donde no figura en la lista, se dice tal cual, sin corregir a ninguna de
  las dos fuentes.
- **Enlaces compartibles.** `/votacion/{tipo}-{número}-{orden}` (p. ej.
  `/votacion/ordinaria-58-4`) abre el mapa con esa votación, y cambian el
  título y la descripción para compartir.
- **Fuente a la vista.** Cada vista de votación dice de qué acta sale y
  enlaza al SIL, donde cualquiera la puede consultar.
- **Pendiente:** el salón 3D todavía no colorea por voto; la votación se ve
  en la vista de composición.

---

## ADR-023 — Gasto por diputación: remuneración y combustible, tal como se publican

**2026-10-09**

`etl/fetch_gasto.py` lee del portal vigente de datos abiertos (ADR-020) los
Excel mensuales de **remuneración** (`SalarioDiputados`) y **combustible**
(`ConsumoCombustible`) desde mayo de 2026. Los meses anteriores son de la
Asamblea anterior y no se mezclan.

- **Se muestra lo publicado, sin cuentas propias.** Dieta, gastos de
  representación y remuneración bruta por mes, y el monto de combustible por
  mes. Nada se suma ni se promedia en el sitio. La nota oficial («no se
  incluyen los subsidios por incapacidad») va junto a los montos, porque
  explica por qué un mes puede salir más bajo.
- **Vacío no es cero.** Una celda de combustible vacía es «Sin dato
  oficial». El asterisco del archivo es «Renunció a la ayuda técnica», como
  dice su propia nota.
- **Cuadres:** dieta + representación = bruta en cada fila, y la suma de
  combustible = la fila TOTAL de cada mes. Todos cuadran.
- **Columnas por encabezado**, no por posición: cambian entre años («Salario
  Bruto» / «Remuneración Bruta»).
- **Nombres «Apellidos Nombre».** Se comparan rotando las palabras, que es
  comparación exacta del mismo nombre, y también rotando las variantes ya
  curadas. Lo demás va a la tabla curada (5 entradas nuevas, cada una con
  su motivo).
- **Caso Joselyn Sáenz — resuelto por decisión humana (2026-10-09).** Los
  archivos de gasto dicen «Sáenz **Blanco** Joselyn»; el padrón y las actas,
  «Joselyn Sáenz **Núñez**». El segundo apellido no coincide y eso no cumple
  el criterio de la tabla, así que el ETL no lo resolvió solo. La persona
  responsable del proyecto decidió que es la misma diputación (única Joselyn
  Sáenz, Frente Amplio). Quedó en la tabla curada con `decidido_por` y la
  inconsistencia escrita. Las fuentes no se corrigen.
- **Fuera por ahora:** uso de vehículos (un registro por viaje, con la
  diputación dentro de un texto) y viajes al exterior (montos con formatos
  mezclados, «¢382,795.94» y «¢ 811.037,00»). Leerlos mal sería inventar
  cifras: requieren su propio tratamiento.
