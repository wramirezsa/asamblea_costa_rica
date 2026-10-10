# Estado vivo del proyecto

> Actualizar al cerrar cada sesión. Es lo primero que se relee al retomar.

**Última actualización:** 2026-10-09

## Objetivo actual

Mapa interactivo del plenario 2026-2030 con las 57 diputaciones, más la
actividad legislativa que la Asamblea mantiene al día. Todo con fuente
verificable.

## Estado

**Funcionando de punta a punta, en local y en la nube.** ETL → datos → sitio.
En producción, GitHub Actions actualiza `data/` y publica el sitio cada día
(ADR-024).

### Lo que ya funciona

**Padrón y salón**
- 57 diputaciones desde la API oficial, con foto, cédula, provincia, bancada,
  profesión, biografía, contacto y redes.
- Directorio Legislativo (6 cargos), extraído de la página oficial y validado
  contra el padrón.
- **Mapa de curules completo: las 57 personas ubicadas.** 54 en bancada, 3 en
  la mesa del Directorio, 2 curules vacías declaradas.
- Dos vistas: **Composición** (diagrama SVG con zoom y niveles de detalle) y
  **Salón 3D** (reconstrucción del salón real en Three.js, carga diferida).
- Colores de bancada derivados de las banderas oficiales.

**Actividad legislativa** *(nuevo en esta sesión)*
- **1.617 leyes aprobadas** con resumen — última actualización en la fuente:
  2026-08-27.
- **26.923 mociones** con su resultado — actualizada el mismo día de la
  consulta. **85 % se rechaza** (22.898 vs 3.514 aprobadas) en 1.201
  expedientes.
- **160 documentos de intervenciones** en plenario, de 56 de las 57
  diputaciones, enlazados desde cada ficha.
- Cada bloque muestra **cuándo la Asamblea tocó el dato**, no cuándo corrimos
  el ETL. Esa distinción hace visible el abandono de un conjunto.

**Difusión** *(nuevo)*
- **URL por diputación y por provincia**: `/diputado/{slug}` y
  `/provincia/{provincia}`, con título y descripción propios para compartir.
- **"¿Quién te representa?"** como puerta de entrada, con las siete provincias.
- Orden reacomodado en móvil: el mapa se ve sin scroll.

**Votaciones y asistencia por sesión** *(nuevo, ADR-021)*
- **109 sesiones del Plenario y 4.780 votaciones nominales**, todas validadas
  y publicables, leídas de las actas oficiales del SIL+ (1 de mayo al 7 de
  octubre de 2026). Asistencia por sesión: entre 47 y 57 presentes.
- **Ya están en el sitio** (ADR-022): asistencia e historial de votos en cada
  ficha, mapa coloreado por voto con símbolo, sección «Votaciones del
  Plenario» y enlaces compartibles `/votacion/ordinaria-58-4`.

**Gasto por diputación** *(nuevo, ADR-023)*
- Remuneración (dieta, representación, bruta) y combustible, mes a mes desde
  mayo de 2026, en la ficha de cada diputación, con enlace al Excel oficial.
- Pendiente: los conjuntos de vehículos y viajes. El caso de Joselyn Sáenz
  (segundo apellido distinto entre fuentes) se resolvió por decisión humana.

**Gestión de transparencia**
- Solicitud formal **enviada** el 2026-09-02, fundada en la Ley 10554. Ver
  `docs/solicitud-transparencia.md`.
- **Respondida dentro del plazo y evaluada.** La Asamblea pidió una prórroga
  de 15 días el 16 de setiembre, se le concedió, y respondió el **1 de
  octubre**. El correo cayó en Spam y se reenvió el 8. Adjunto de 17 páginas,
  leído y evaluado punto por punto.
- **En lo esencial la respuesta es correcta, y corrige nuestra auditoría**: los
  conjuntos que dimos por abandonados están vigentes en `/pa/datosabiertos/`
  (asistencia mensual hasta agosto de 2026; salarios, vehículos, combustible
  y viajes hasta setiembre). Ver ADR-020.
- **Lo más valioso, verificado el mismo día (ADR-021):** el acta oficial de
  cada sesión del Plenario, publicada en el SIL+, trae la **lista de
  presentes y el voto nominal completo**. En la ordinaria #58: 50 presentes y
  171 votaciones, sin un solo descuadre, y la revisión 497 coincide nombre
  por nombre con el tablero.
- Hallazgo legal al releer la ley: el art. 16 **no** obliga a publicar
  asistencia ni votaciones. Para esos datos la vía firme es pedir su
  **entrega** (art. 11), no su publicación.

### Votaciones desde la transmisión — degradadas a contraste (ADR-021)

Pasos 1 y 2 de la tubería de ADR-018, terminados y corridos sobre todo el
período. **Estos datos NO están en el sitio y no deben publicarse todavía**
(`_publicable: false` en el JSON): falta leer el tablero y contrastar.

- **Índice de sesiones** (`etl/fetch_sesiones.py`): **77 sesiones del Plenario
  en 80 videos, 276 horas**, del 2026-05-05 al 2026-09-03. Solo metadatos
  públicos del canal; no descarga video ni audio.
- **Totales de votación** (`etl/fetch_votaciones.py`): **3.215 votaciones**
  leídas del subtítulo automático. 154 aprobadas, 2.821 rechazadas — **88 % de
  rechazo**, consistente con el 85 % que ya sabíamos de `mociones_total`.
- **3.111 instantes de tablero localizados** (96 % de las votaciones): el
  segundo exacto del video donde está el voto por persona.
- Presentes al momento de votar: rango **39 a 53 de 57**, mediana **45**.
- Prueba de regresión contra la sesión #58 verificada a mano: coincide al
  segundo.

**Dos hallazgos que valen por sí solos**, aun sin el tablero:
1. **Seis sesiones del Plenario del período no tienen transmisión archivada**
   (ordinarias 1, 2, 6 y 20; extraordinarias 8 y 20).
2. **Diez sesiones no tuvieron ninguna votación.** Y la carga se concentra: la
   ordinaria #59 sola acumuló 197.

## Módulos

| Ruta | Qué hace |
|---|---|
| `etl/lib/sharepoint.py` | Cliente de la API REST, paginación, TLS, utilidades de texto |
| `etl/fetch_diputados.py` | Padrón + fracciones |
| `etl/fetch_directorio.py` | Directorio Legislativo, validado contra el padrón |
| `etl/fetch_assets.py` | Fotos, banderas y escudo nacional |
| `etl/derive_colores.py` | Color por bancada desde la bandera |
| `etl/fetch_actividad.py` | Leyes, mociones e intervenciones |
| `etl/curules.py` | Numeración de asientos, curaduría manual y reparto |
| `etl/fetch_sesiones.py` | Índice de sesiones del Plenario desde el canal oficial |
| `etl/fetch_votaciones.py` | Totales de votación leídos del subtítulo *(solo contraste)* |
| `etl/lib/sil.py` | Cliente del SIL+ (sesión anónima, búsqueda y descarga de actas) |
| `etl/lib/acta.py` | Lector del acta: presentes, votaciones nominales y validaciones |
| `etl/lib/numeros.py` | Números cantados en español («cuarenta y dos») |
| `etl/fetch_actas.py` | Actas del Plenario: fuente primaria del voto nominal y la asistencia por sesión |
| `etl/publish_web.py` | Geometría y payload del sitio |
| `web/src/Hemiciclo.tsx` | Diagrama de composición en SVG |
| `web/src/Plenario3D.tsx` | Salón de sesiones en 3D |
| `web/src/Sala3D.tsx` | Arquitectura del salón |
| `web/src/Actividad.tsx` | Actividad legislativa con fecha de actualización |
| `web/src/PanelDiputado.tsx` | Ficha lateral |

## Pruebas ejecutadas

- ETL completo contra la fuente real: **57/57, sin advertencias**.
- Cuadres por partido (31/17/7/1/1) y provincia (18/12/6/6/5/5/5): coinciden
  con TSE y prensa.
- Mapa de curules: **54 de 54 curadas**, verificadas una por una contra el
  payload publicado, cero discrepancias.
- **4 de 7 pistas observacionales se cumplen** contra la lista definitiva; 3
  quedaron archivadas con su motivo.
- `npm run build` sin errores. Bundle principal 83 KB gz; Three.js en
  fragmento aparte de 242 KB gz.

## Riesgos y bloqueos

1. **El SIL+ es una aplicación interna sin API documentada**: puede cambiar
   sin aviso, y de él salen la asistencia por sesión y el voto nominal
   (ADR-021). Si cambia, `fetch_actas.py` falla ruidosamente y la corrida
   diaria queda en rojo. Las 3.215 votaciones de la transmisión quedan como
   contraste, no como fuente.
2. **Las ubicaciones viejas del catálogo están congeladas** (órdenes del día
   2016, uso de la palabra 2018, asistencia y actas 2019, vehículos 2021),
   **pero varios conjuntos se mudaron** al portal vigente `/pa/datosabiertos/`
   o al SIL. Antes de declarar muerto un conjunto, buscar su sucesor
   (ADR-020). Detalle en `docs/fuentes-de-datos.md`.
3. ~~Decisión sobre Delfino.cr~~ — ya no aplica: el voto nominal sale del acta oficial (ADR-021).
4. **Verificación TLS relajada en el SharePoint** (ADR-002). El SIL+ ya
   verifica con el intermedio guardado (ADR-024); el mismo archivo serviría
   para el SharePoint.
5. **El SharePoint solo responde desde Costa Rica** (ADR-024). La nube
   actualiza las actas; el padrón, la actividad y el gasto dependen de una
   computadora en el país. Si pasan más de 7 días sin refrescarse, la
   corrida diaria lo avisa en un issue. Además, dependencia de GitHub para
   programar y publicar; el ETL no depende de GitHub.
6. **El mapa de curules es curaduría propia**, no dato oficial. Declarado en
   la interfaz.

## Siguientes pasos

1. ~~Ordenar la información del sitio~~ — hecho el 2026-10-09: navegación
   fija con secciones de ruta propia (Plenario · Votaciones · Actividad ·
   Fuentes), controles agrupados, resumen en números y sección Fuentes. El
   salón 3D no se tocó. Detalle en `docs/arquitectura-informacion.md`.
   Siguiente: que el usuario lo recorra y diga qué sigue sin hallarse.
2. **Enviar el acuse de recibo** a la Asamblea (texto listo en
   `docs/solicitud-transparencia.md`).
3. Gasto: uso de vehículos y viajes al exterior (ADR-023).
4. Confirmar si «Asistencia a Sesiones Legislativas» del SIL+ cubre el
   Plenario (JSON por cédula; sumaría comisiones).
5. Definir medio de pago para las donaciones; dominio y despliegue.

**Ya funcionando y programado:** las actas (`--fuentes sil`) se actualizan
solas todos los días a las 06:17 en GitHub Actions, y el sitio se publica en
`https://wramirezsa.github.io/asamblea_costa_rica/` (ADR-024). La tarea
«Asamblea Abierta - actualizar» del Programador de tareas de Windows (creada
el 2026-10-09) corre `--fuentes sharepoint --completo --subir` en la copia dedicada
`%USERPROFILE%\AsambleaAbierta\repo`: extrae el padrón, la actividad y el
gasto, los sube y el push publica. Si la computadora pasa más de 7 días sin
correrla, la corrida diaria de la nube abre un issue.
