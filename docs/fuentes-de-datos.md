# Fuentes de datos — auditoría

Resultado de la exploración hecha el **2 de septiembre de 2026**. Este
documento evita repetir el trabajo de reconocimiento y, sobre todo, evita
prometer datos que no existen.

## La API abierta de la Asamblea

`www.asamblea.go.cr` corre **SharePoint** y expone su API REST **sin
autenticación**:

```
https://www.asamblea.go.cr/{subsitio}/_api/web/lists/getbytitle('{Lista}')/items
Accept: application/json;odata=nometadata
```

- `/_api/web/webs` (enumerar subsitios) devuelve **401**. Hay que conocer los
  subsitios por nombre.
- Subsitios detectados: `Diputados`, `glcp`, `opendata`, `ca`, `sd`, `pa`,
  `ga`, `ci`.
- Licencia declarada en el portal de datos abiertos: **CC BY 4.0**,
  actualización diaria.

## Lo que SÍ existe y usamos

### Subsitio `Diputados`

| Lista | Registros | Contenido |
|---|---|---|
| `Diputados_y_Diputadas_2026_2030` | 57 | Padrón completo |
| `Fracciones_2026-2030` | 8 (5 activas) | Banderas de bancada |
| `Fracciones` | 6 | Descripciones históricas de partidos |

Campos por diputación (verificados, con su tasa de llenado real sobre 57):

- **Completos (57/57)**: `Title` (nombre), `Cedula`, `Partido`, `Provincia`,
  `FraccionParlamentaria`, `PeriodoLegislativo`, `Foto`, `EmailOficial`,
  `Profesion`, `FechaNacimiento`, `AreasInteresHtml`, `Activo`
- **Parciales**: `LugarNacimiento` 20, `EducacionHtml` 14, `EstadoCivil` 14,
  `ExperienciaLaboralHtml` 12, `ExperienciaPoliticaHtml` 12,
  `EquipoTrabajo` 13, `ParticipacionComunalHtml` 8, `PremiosReconocimientosHtml` 6,
  `PonenciasCongresosHtml` 4, `PublicacionesHtml` 3
- **Redes**: Facebook 14, Instagram 14, TikTok 7, Twitter 4, YouTube 0

`PosicionPantalla` (1–57, único) es el **orden de despliegue web** agrupado
por bancada. **No es el número de curul.** No usarlo como asiento.

### Composición verificada 2026-2030

| Bancada | Escaños |
|---|---|
| PPSO — Pueblo Soberano | 31 |
| PLN — Liberación Nacional | 17 |
| PFA — Frente Amplio | 7 |
| PUSC — Unidad Social Cristiana | 1 |
| CAC — Coalición Agenda Ciudadana | 1 |

Por provincia: San José 18, Alajuela 12, Cartago 6, Puntarenas 6, Heredia 5,
Guanacaste 5, Limón 5. Suma 57 en ambos cortes.

Contrastado de forma independiente con prensa (La Nación, Infobae, Semanario
Universidad) y el comunicado del TSE: coincide.

### Directorio Legislativo

No hay lista de SharePoint: se publica como página en
`Diputados/SitePages/Integración_Directorio_Legislativo.aspx`. Trae los seis
cargos (Presidencia, Vicepresidencia, dos Secretarías y dos Prosecretarías).
Para 2026-2030 los seis son de PPSO.

El extractor cruza los nombres contra el padrón oficial, así que un cambio de
maquetación no produce datos falsos: a lo sumo produce menos datos, y avisa.

### Escudo nacional

`SiteAssets/Asamblea Logo.png` (134×146, con transparencia) es el escudo de
Costa Rica: la Asamblea lo usa como logotipo. Es el único activo del sitio con
el escudo; el resto de las imágenes son íconos y banners. Se usa ampliado y con
acabado de bronce para representar el relieve del salón.

## Lo que NO existe

Esta sección es la más importante del documento. **Leer antes de prometer
cualquier función nueva.**

### 1. Curul asignada por diputación — NO PUBLICADA

No hay dataset ni página con el número de asiento de cada persona.

Lo que sí es público:
- **Reglamento del Ceremonial Protocolar, art. 15**: a la izquierda de la mesa
  del Directorio se ubica la fracción de Gobierno; a la derecha, la oposición
  mayoritaria.
- Prensa (observador.cr, abril 2026): PPSO quedó al lado izquierdo del
  Directorio con 28 de sus diputaciones; PLN, PFA y las fracciones de una
  persona, en el sector derecho.

Ese 28 parecía no cuadrar contra las 31 diputaciones de PPSO. **Cuadra al
descontar las tres que se sientan en la mesa del Directorio**: 31 − 3 = 28. Y
las demás fracciones suman exactamente 26. Total 54, las curules de bancada.
Así que el reparto por sector sí está respaldado.

**Lo que sigue sin ser público es la curul individual.** Agrupamos por bancada
siguiendo el art. 15 y el reporte de prensa, y marcamos la posición de cada
persona dentro de su bancada como ilustrativa, visible en la interfaz.
Ver ADR-003 y ADR-012.

### 2. Asistencia — EXISTE MENSUAL; por sesión, no como dato

> **Corrección 2026-10-08.** Lo de abajo miraba la ubicación vieja. La
> Asamblea publica la asistencia **vigente** en `/pa/datosabiertos/`,
> carpeta `Documentos compartidos/RegistroAsistencia`: un Excel **mensual**
> con una fila por diputación (57) y, por órgano, asistencias, programadas no
> realizadas, ausencias y permisos. Órganos: Plenario, Comisiones Plenas,
> Permanentes, Permanentes Especiales, Especiales, reuniones de Fracción y
> de Jefaturas de Fracción. La leyenda de columnas es oficial: está en la
> página `RegistroAsitencia.aspx` del portal (con esa errata en el nombre).
> Cubre de 2021 a **agosto de 2026** y se publica «la segunda semana del mes
> y medio posterior». No lo encontramos nosotros: lo señaló la propia
> Asamblea en su respuesta a la solicitud de transparencia (ADR-020).
>
> El registro **por sesión** («quién vino hoy») no está en ese portal, pero
> **sí existe en el SIL+** (verificado el 2026-10-08, ADR-021), en dos
> lugares: el bloque «Diputados presentes» al inicio de cada acta, y el
> módulo *Programación de sesiones → Asistencia a Sesiones Legislativas*,
> que devuelve JSON por sesión y diputación ligado por **cédula**, con
> estado PRESENTE o AUSENTE. Falta confirmar si ese módulo cubre el Plenario:
> en la muestra revisada solo había comisiones.
>
> Ojo al cruzar nombres: el archivo usa «Apellidos Nombre», trunca a 20
> caracteres y trae erratas propias («Chavaría»). Hace falta tabla de
> equivalencias curada, igual que con el tablero de votación.


`Diputados/Asistencia_Diputados` tiene 969 registros, **pero solo de 2018
(456) y 2019 (513)**. Nada posterior. Además son **agregados anuales** por
persona (asistencias, ausencias, permisos por tipo de sesión), no un registro
por sesión.

`glcp/Asistencia_Plenario_Diputados` (11 items) está **mal etiquetada**:
contiene PDFs de decretos y nombramientos, no asistencia.

Conclusión: **no hay fuente oficial estructurada de "quién vino hoy"**.

Vías posibles, ninguna verificada aún:
- Las **actas** del plenario (`glcp/Actas`, 7.277 PDFs) listan presentes y
  ausentes por sesión. Requiere extracción de PDF y validación cuidadosa.
- El campo "ausente" de cada votación nominal en Delfino sirve como proxy de
  presencia **en el momento de votar**, no de asistencia a la sesión.

### 3. Votaciones nominales — EXISTEN, EN EL ACTA OFICIAL (texto)

> **Verificado el 2026-10-08 (ADR-021).** El acta de cada sesión del
> Plenario, descargable desde el SIL+ (`produccion.asamblea.go.cr/SILConsulta`,
> *Consulta de actas → Actas - Plenario*), es un `.docx` de texto con el voto
> nominal completo de **cada** votación: «Nombre Propuesta» con número de
> moción y de expediente, «A Favor», «En Contra» y «No-Votación», con nombres
> completos. En la ordinaria #58 trae 171 votaciones sin un solo descuadre
> entre los totales declarados y los nombres listados, y la revisión 497
> coincide nombre por nombre con el tablero verificado a mano. La sesión
> aparece en la lista el mismo día; el texto del acta llega después. No es un
> conjunto de datos: hay que extraerlo del texto, pero es la
> **fuente oficial**, por encima de la transmisión (ADR-018).
>
> Lo de abajo describe lo que se sabía antes. Sigue siendo cierto que no hay
> un *dataset* estructurado de votaciones.


`glcp/votaciones_plenario` (235 items) son **PDFs escaneados** de votaciones
secretas (magistraturas, directorios de comisión). No son las votaciones de
proyectos de ley.

**Delfino.cr** (`delfino.cr/asamblea/votaciones`) sí publica el voto
individual: nombre, partido, provincia, cargo y sentido del voto (a favor /
en contra / ausente). Los identificadores tienen forma `AAAAMMDD` + secuencia,
p. ej. `/asamblea/votaciones/proyecto/20260827021`.

Pendiente por resolver antes de usarlo: es un medio privado, no la fuente
primaria. Habría que (a) atribuirlo explícitamente, (b) confirmar sus
condiciones de uso y (c) idealmente validar una muestra contra las actas
oficiales. Ver `docs/backlog.md`.

**RESUELTO (2026-09-03): la transmisión sí trae el voto nominal.** El canal
oficial de YouTube publica cada sesión con subtítulos automáticos en español, y
durante cada votación muestra en pantalla la *"Lista de Señoras y Señores
Diputados"* con los nombres agrupados en **A favor / Contra / No-Votación**.
Probado de punta a punta con la sesión Ordinaria #58. Ver **ADR-018** para el
método, los números obtenidos y las salvedades.

**Estado al 2026-09-04.** Los dos primeros pasos ya están construidos y
corridos sobre todo el período (**ADR-019**):

| | |
|---|---|
| Índice de sesiones | `etl/fetch_sesiones.py` → 77 sesiones, 80 videos, 276 h |
| Totales de votación | `etl/fetch_votaciones.py` → 3.215 votaciones |
| Instantes de tablero localizados | 3.111 (96 %) |
| Voto por persona | **todavía no**: falta leer el tablero |

Lo extraído hasta aquí sale **solo del subtítulo**: totales cantados por la
Presidencia. Es un dato de trabajo, marcado `_publicable: false`, y no está en
el sitio. El voto por persona exige el fotograma del tablero, que es el único
paso que necesita el video y por eso depende de la vía de acceso.

Dos vacíos nuevos, encontrados al armar el índice y que no se conocían:

- **Seis sesiones del Plenario del período no tienen transmisión archivada**
  en el canal: ordinarias 1, 2, 6 y 20; extraordinarias 8 y 20. Para esas
  sesiones no hay ni totales ni tablero por esta vía. **Pero las seis tienen
  acta en el SIL+** (verificado el 2026-10-08): el SIL+ lista las 110 sesiones
  del período sin un solo hueco, ordinarias 1 a 76 y extraordinarias 1 a 34.
  El acta es la fuente completa; la transmisión, no.
- La pestaña `/videos` del canal **no sirve** para esto: trae notas de prensa
  cortas. Las sesiones están en `/streams`. Y hay que pedir los títulos en
  español explícitamente, o YouTube los devuelve traducidos al inglés y no
  calzan con ningún patrón.

**Pista sin explotar:** la prensa reporta que cada curul del nuevo plenario
tiene *"un moderno sistema de votación electrónica"* además de pantalla táctil
y computadora. Si el voto se registra electrónicamente, existe un registro
digital por diputación en algún sistema interno. Eso convierte "no hay datos"
en "los datos existen pero no se publican", que es una pregunta distinta y
mucho mejor para una solicitud de transparencia.

## El salón de sesiones

Edificio inaugurado en **octubre de 2020**, arquitecto **Javier Salinas**.
El plenario ocupa la parte más baja del edificio, tiene cuatro pisos de altura
y **57 curules con previsión estructural para 114**. El público puede
observarlo desde arriba por la parte trasera, cubierta de vidrio.

**Forma real:** sala **rectangular**, no hemiciclo. Dos bancadas escalonadas
enfrentadas a lo largo de un pasillo central, mesa del Directorio al fondo bajo
el escudo nacional, y podio de oradores al centro. El muro del fondo tiene
listones horizontales, su rasgo más reconocible.

Esto se determinó a partir de fotografías del salón. **El conteo de curules
por grada no está verificado contra un plano oficial**: la reconstrucción 3D
usa **dos gradas por bancada**: 28 curules a la izquierda (todas de PPSO) y 26
a la derecha (PLN, PFA, PUSC y CAC), más 3 puestos en la mesa del Directorio.
Marcado como `sala.confianza = "reconstruido"`.

Ese 28/26 concuerda con el reporte de prensa sobre el acomodo del salón una vez
que se descuentan las tres diputaciones que presiden desde la mesa. Ver
ADR-012.

Objetos del salón identificados en las fotografías y representados en el 3D:
muro del fondo con panel central de listones horizontales, escudo nacional en
relieve, asta con la bandera, estrado elevado, mesa larga del Directorio,
parapeto blanco con dos arreglos claros, podio de oradores al centro,
ventanales del muro izquierdo con parteluces, cabina acristalada del muro
derecho, altavoces negros en ambos muros, cielo raso oscuro con luminarias
lineales, piso claro con franja central, y en cada curul su pantalla táctil y
silla de respaldo alto.

**Sobre imágenes 360:** no se pueden armar desde cuadros de video grabado
caminando por la sala — al moverse la cámara aparece paralaje y las tomas no
empatan. Un panorama real exige girar la cámara sobre un mismo punto. Además,
el material de video disponible es de terceros (YouTube, Habitat Soluciones) y
no puede publicarse sin permiso.

## Auditoría de vigencia (2 de septiembre de 2026)

Se midió el año de última modificación de las listas grandes. **La mayor parte
del catálogo de la Asamblea está abandonado**: aunque las listas existen y
tienen miles de registros, dejaron de alimentarse hace años.

### Vivas — con actividad en 2026

| Lista | Registros | Contenido | Nota |
|---|---|---|---|
| `glcp/mociones_total` | 27.163 | Mociones por expediente, con su resultado | Se actualiza a diario |
| `glcp/res_de_leyes` | 1.617 | Leyes aprobadas, con resumen y título completo | 134 creadas en 2026 |
| `Diputados/intervenciones_2026_2030` | 160 | Intervenciones en plenario, un `.docx` por diputación y mes | 56 de 57 diputaciones |
| `glcp/votaciones_plenario` | 235 | PDFs escaneados de votaciones secretas | No son votaciones de proyectos |

Campos útiles confirmados:

- **mociones_total**: número de moción, expediente, `Calificación`
  (Aprobada / Rechazada / Pendiente / Retirada), asunto, trámite.
  En las últimas 3.000 mociones (todas de 2026, sobre 223 expedientes):
  **2.571 rechazadas, 405 aprobadas, 19 pendientes, 5 retiradas**.
- **res_de_leyes**: nombre de la ley, número, resumen y título completo (HTML).
- **intervenciones_2026_2030**: `DiputadoId` + archivo
  (p. ej. `Zaira Murillo Marin-julio 2026.docx`). Es el **único conjunto
  vigente ligado a cada diputación**.

### Muertas — sin actividad reciente

| Lista | Registros | Último año |
|---|---|---|
| `Órdenes del día` | 8.103 | 2016 |
| `Uso_De_La_Palabra` | 597 | 2018 |
| `Asistencia_Diputados` | 969 | 2019 |
| `Actas` | 7.277 | 2019 |
| `UsoVehiculosYCombustiblesXDiputado` | 639 | 2021 |
| `proyec_dictaminados` | 291 | 2022 |
| `Lista_Mociones` | 17.630 | 2024 |
| `opendata/Uso_Vehiculos` *(archivos)* | 19 | 2021 (reporte de febrero) |
| `opendata/Salarios` *(archivos)* | 86 | 2021 (octubre) |
| `opendata/Viajes` *(archivos)* | 23 | 2021 (marzo) |
| `opendata/Ejecucion_Presupuestaria` *(archivos)* | 57 | 2021 (setiembre) |
| `opendata/Presupuestos` *(archivos)* | 12 | 2020 (enero) |

**Muertas en esta ubicación, vivas en otra.** Las cinco bibliotecas de
`opendata`, `UsoVehiculosYCombustiblesXDiputado` y `Asistencia_Diputados` se
detienen en 2019–2021 **porque la publicación se mudó** al portal vigente,
`/pa/datosabiertos/` (sección siguiente). No es abandono. La auditoría del
2026-09-02 no lo vio porque los subsitios no se pueden enumerar por la API
(`/_api/web/webs` responde 401) y ese subsitio anidado no estaba en la lista.
Ver ADR-020.

### Portal vigente — `/pa/datosabiertos/` (verificado el 2026-10-08)

Biblioteca `Documentos compartidos/` del subsitio `pa/datosabiertos`. Se lee
con la misma API anónima. Todo en `.xlsx`, un archivo por mes:

| Carpeta | Archivos | Último período publicado | Fecha de publicación |
|---|---|---|---|
| `RegistroAsistencia` | 83 | **agosto 2026** | 2026-10-02 |
| `SalarioDiputados` | 91 | **setiembre 2026** | 2026-10-02 |
| `SalarioFuncionarios` | 52 | setiembre 2026 | 2026-09-29 |
| `UsoVehiculos` | 99 | **setiembre 2026** | 2026-10-05 |
| `ConsumoCombustible` | 9 | **setiembre 2026** | 2026-10-07 |
| `GastosViajes` | 84 | **setiembre 2026** | 2026-10-05 |
| `EstadosEjecucion` | 74 | agosto 2026 | 2026-09-23 |
| `EstadosFinancieros` | 40 | anual | 2026-04-21 |
| `PresupuestoAnual` | 18 | anual | 2026-03-18 |
| `PlanAdquisiciones` | 8 | anual | 2026-02-05 |
| `InventarioBienes` | 6 | anual + modificaciones | 2026-10-07 |
| `GastosComunicacion` | 2 | por período constitucional | 2025-08-05 |

La periodicidad que declara la Asamblea en su respuesta calza con lo
publicado. Esto **reabre el gasto por diputación** (salarios, vehículos,
combustible, viajes), que se había descartado por creer muertos esos datos.

**Inconsistencia entre fuentes oficiales (2026-10-09).** Los Excel de
remuneración y combustible escriben «Sáenz **Blanco** Joselyn»; el padrón y
las actas del Plenario, «Joselyn Sáenz **Núñez**». Se reporta y no se corrige
(ADR-023).

Además, varias listas están **mal etiquetadas**: `Listado de iniciativas en
corriente legislativa` y `Lista de iniciativas convertidas en ley` contienen
peticiones ciudadanas con teléfonos y direcciones, con los campos cruzados, y
no se tocan desde 2010-2013. Las bibliotecas de `opendata` son archivos sueltos
(`.xlsx`, `.csv`), no datos tabulares consultables por la API.

**Consecuencia para el proyecto:** el gasto por diputación (vehículos, viajes,
salarios) NO es publicable como dato vigente. Lo que sí se puede sostener hoy
es: leyes aprobadas, mociones y sus resultados, e intervenciones por diputación.

## Cómo lo hace Acontecer (investigado el 2026-09-03)

Su "Última hora legislativa" se alimenta de `/api/asamblea/ultima-hora`, una
API propia de su aplicación Next.js. La respuesta revela la arquitectura:

**Dos fuentes distintas, marcadas en cada evento:**

1. `source: "monitor"` — *"Monitor de votaciones"*. Trae `votos_si`,
   `votos_no`, `votos_abs` y un `id` correlativo. Son **totales agregados**,
   no voto nominal. El patrón sugiere registro humano mientras se sigue la
   sesión, no una extracción automática: no existe fuente oficial estructurada
   de donde salgan esos números.

2. `source: "telegram"`, `source_label: "Telegram oficial"` — trae el mensaje
   **crudo** en `source_text`, con la redacción típica de un boletín de prensa:
   *"Plenario legislativo: discusión en segundo debate del expediente 24.547
   LEY DE RESPONSABILIDAD LABORAL DE LOS CONTRATISTAS CON EL ESTADO"*.

**Sobre el texto crudo corre un modelo de lenguaje.** Cada evento de Telegram
suma campos derivados: `titulo` (titular reescrito), `texto_corto` (resumen),
`people`, `institutions`, `locations`, `dates`, `expediente`, más `event_type`
(debate, rejection, vote), `importance` (1-10) y `confidence` (0.95). Ese
`confidence` delata que la extracción es probabilística, no determinista.

**El canal de Telegram no es público.** No aparece en el linktree oficial de la
Asamblea (`linktr.ee/asambleacrc`), que solo lista YouTube, Instagram, X,
Facebook, TikTok y LinkedIn. Se probaron identificadores candidatos en `t.me`
sin resultado. Lo más probable es que sea un canal de la oficina de prensa para
medios acreditados: una ventaja legítima de un medio, no algo replicable.

**Conclusión:** no hay una API oficial mágica que estemos ignorando. Hay
acceso de prensa más trabajo humano más un modelo que redacta. Consumir su
`/api/` sería tomar su producto, no la fuente.

## Listas mal etiquetadas — segunda tanda

`glcp/Actas de las sesiones del Plenario (faltantes)` está **viva** (272
documentos en 2026, el último del mismo día de la consulta), pero **no contiene
actas**: son videos `.mp4` y presentaciones `.pptx` de apoyo usadas en sesión
(`ApoyoPlenario-Nayuribe-0209.mp4`, `PRESENTACION PUEBLO SOBERANO...pptx`).
Es material audiovisual, no el acta.

`glcp/Órdenes del día Plenario (Faltantes)` sí son órdenes del día, pero se
detiene en 2022.

## Otras listas con potencial (no exploradas a fondo)

Subsitio `glcp`: `mociones_total` (27.163), `Lista_Mociones` (17.630),
`Órdenes del día` (8.103), `Actas` (7.277), `Todas las iniciativas` (1.708),
`res_de_leyes` (1.617), `Uso_De_La_Palabra` (597).

Subsitio `opendata`: `Salarios` (86), `Ejecucion_Presupuestaria` (57),
`Viajes` (23), `Uso_Vehiculos` (19), `Presupuestos` (12).
Subsitio `Diputados`: `UsoVehiculosYCombustiblesXDiputado` (639),
`intervenciones_2026_2030` (160).

## Trampas conocidas

- **Certificado TLS**: cadena incompleta (falta el intermedio). Los
  navegadores lo resuelven con AIA fetching; Python no. Ver ADR-002.
- **URLs con espacios**: hay archivos como `ps_guadamuz_rosales .jpg` (espacio
  antes de la extensión) y URLs ya codificadas. Hay que `unquote` antes de
  `quote` o se producen dobles escapes (`%20` → `%2520`) y da 404.
- **Campos vacíos en `Fracciones_2026-2030`**: PPSO y CAC vienen con
  `Fracción = null`. El nombre se cruza desde `FraccionParlamentaria` del
  padrón, que sí lo trae.
- **Codificación en Windows**: sin `PYTHONIOENCODING=utf-8` la consola falla
  con acentos y caracteres de ancho cero (`​`) que SharePoint inyecta.
