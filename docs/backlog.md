# Backlog

## Gestión de transparencia — respondida y evaluada

- **Solicitud del 2026-09-02: respondida el 2026-10-01** dentro de la
  prórroga, y evaluada el 2026-10-08. En lo esencial es correcta: los
  conjuntos que dimos por abandonados están vigentes en `/pa/datosabiertos/`
  (ADR-020). Evaluación punto por punto en `docs/solicitud-transparencia.md`.
- **Enviar el acuse de recibo** que pidió la Asamblea. Texto listo en esa
  misma bitácora.
- ~~Revisar el SIL+ con un navegador~~ — **hecho**: las actas traen el voto
  nominal y la asistencia por sesión (ADR-021).
- ~~Solicitud nueva de entrega~~ — **no hace falta**: está publicado.
- **Memoria Legislativa 2025-2026** (noviembre o diciembre de 2026): ahí
  debe aparecer el plan de actualización del art. 17 d). Verificarlo cuando
  se publique.

## Próximo

- **Ordenar la información del sitio (prioridad 1, pedido 2026-10-09).** Ver
  `docs/arquitectura-informacion.md`. El 3D no se toca.

- ~~**ETL de actas del Plenario desde el SIL+**~~ — **hecho el 2026-10-08**
  (ADR-021): `etl/lib/sil.py` (cliente), `etl/lib/acta.py` (lector y
  validaciones), `etl/fetch_actas.py` (orquestador) y
  `data/curated/equivalencias_nombres.json` (7 variantes curadas).
- ~~**Llevar las actas al sitio**~~ — **hecho el 2026-10-09** (ADR-022).
  Queda: colorear por voto también el salón 3D.
- **Refresco diario de las actas.** La sesión aparece en el SIL+ el mismo
  día, pero el texto llega después: correr a diario
  `fetch_actas.py --desde <hace una semana>`, que reintenta las que quedaron
  «sin documento». Encaja en el
  refresco automático del ETL.
- **Confirmar si *Asistencia a Sesiones Legislativas* cubre el Plenario.**
  Devuelve JSON por cédula; si cubre el Plenario, es más limpio que extraer
  presentes del acta.

- **Tubería de voto nominal desde la transmisión — degradada a contraste
  (ADR-021).** El paso 3 (tablero) ya no hace falta: el acta trae los
  nombres. Lo hecho (ADR-018, ADR-019):
  1. ~~`etl/fetch_sesiones.py` — índice de sesiones desde el canal~~ —
     **hecho**: 77 sesiones, 80 videos, 276 h, período 2026-2030.
  2. ~~Análisis del subtítulo: votaciones, totales, presentes y número de
     moción~~ — **hecho**: `etl/fetch_votaciones.py`, 3.215 votaciones.
  3. **Extracción del fotograma del tablero y lectura de los nombres.**
     Es el paso que da el voto por persona, y el único que toca el video.
     Hay 3.111 instantes de tablero ya localizados (96 % de las votaciones).
     Falta decidir el OCR: tesseract no está instalado; evaluar si hace falta
     o si basta con recorte por columnas y comparación contra el padrón.
  4. **Validación cruzada** antes de publicar: totales del tablero contra los
     del subtítulo, nombres contra el padrón de 57, y número de moción contra
     `mociones_total`. Si algo no cuadra, se reporta y no se publica.

  **Bloqueo abierto:** la vía de acceso al video. El paso 3 es el único que lo
  necesita; los pasos 1 y 2 solo leen metadatos y subtítulos. Alternativa
  limpia: la lista «Solicitud de Audios» del subsitio `/ca/`.

- ~~**Resolver los nombres truncados del tablero contra el padrón.**~~ —
  **hecho, sin riesgo**: bastan 9 caracteres para distinguir a las 57 y el
  tablero trunca cerca de 20. Ver ADR-019.

- **Variantes de nombre entre el tablero y el padrón: confirmado que existen.**
  El tablero escribe «**Roberth** Junior Barrant…» y el padrón oficial
  «**Robert** Junior Barrantes Camacho». A 9 caracteres el prefijo **no**
  calza («roberth j» ≠ «robert ju»). El paso 3 necesita una tabla de
  equivalencias curada a mano —como la de curules— y no adivinar por
  parecido. Revisar las 57 contra varios tableros antes de automatizar.
  Además es una inconsistencia entre dos fuentes oficiales de la Asamblea: se
  reporta, no se corrige.

- **Cruzar el número de revisión contra `mociones_total`.** 948 de 3.215
  votaciones traen número legible. El cruce contra las 26.923 mociones diría
  cuántos son correctos y cuántos los inventó el reconocimiento de voz.

- **ETL del portal vigente `/pa/datosabiertos/`: asistencia mensual.** Un
  Excel por mes, una fila por diputación, asistencias, programadas no
  realizadas, ausencias y permisos por órgano (leyenda oficial en la página
  del portal). Es dato **oficial y vigente** (hasta agosto de 2026): puede
  entrar a la ficha de cada diputación con su mes y su granularidad
  declarados. Requiere tabla de equivalencias de nombres curada a mano: el
  archivo usa «Apellidos Nombre», trunca a 20 caracteres y trae erratas.
- **Extracción de asistencia por sesión desde las actas.** Depende de revisar
  las actas en el SIL (ver arriba); `glcp/Actas` es la ubicación vieja,
  congelada en 2019.
- **Vista de lista/tabla.** Alternativa al mapa: ordenable por nombre,
  bancada, provincia, edad, profesión. Necesaria para accesibilidad y para
  quien llega desde el buscador.
- **Refresco automático del ETL.** Tarea programada que corre los 4 scripts y
  reporta si el conteo se sale de 57 o si aparecen advertencias.
- **Navegación por teclado en el mapa.** Hoy las curules tienen
  `tabIndex={-1}`: se puede llegar por buscador pero no tabulando el
  hemiciclo. Definir un orden y activarlo.

## Después

- **Panorama 360 real del plenario.** Requiere captura propia: cámara 360 o
  modo panorama del teléfono, girando sobre un punto fijo en el centro de la
  sala. Con eso se monta una foto-esfera con puntos calientes sobre cada curul.
  No se puede lograr desde video de terceros grabado caminando (ver
  `docs/fuentes-de-datos.md`).
- **Plano oficial del salón** para fijar el conteo real de curules por grada y
  pasar `sala.confianza` de `reconstruido` a `oficial`.
- **Miniaturas para el 3D.** Hoy las 57 texturas son las fotos a tamaño
  completo (4,3 MB). Generar versiones de ~256 px en el ETL bajaría bastante
  la memoria de video y el tiempo de carga.
- **Vincular mociones con diputaciones.** Hoy las mociones traen expediente y
  resultado, pero no quién las presentó. Revisar si algún campo o lista
  relacionada permite ese cruce; sería el puente entre actividad legislativa y
  el eje del sitio, que son las personas.
- **Extraer el texto de las intervenciones.** Son `.docx`; hoy solo se
  enlazan. Con `python-docx` se podría mostrar un extracto y hacerlas
  buscables.
- **Ficha de bancada.** Al hacer clic en un chip: integrantes, provincias,
  distribución por edad y sexo, jefatura.
- **Comparador de diputaciones** lado a lado.
- **Perfil compartible por URL** (`/diputado/{slug}`) para que se pueda
  enlazar desde redes.
- ~~**Gasto por diputación: remuneración y combustible**~~ — **hecho el
  2026-10-09** (ADR-023). Falta:
  - ~~Decidir el caso de Joselyn Sáenz~~ — resuelto: misma persona, por
    decisión humana; la inconsistencia queda documentada.
  - **Uso de vehículos**: un registro por viaje; la diputación viene dentro
    del campo de texto «DEPARTAMENTO» («DIP. MARCO BADILLA CHA…»).
  - **Viajes al exterior**: montos con formatos mezclados; hay que leerlos
    sin adivinar qué es separador de miles y qué de decimales.
- **Línea de tiempo legislativa** con `Todas las iniciativas` y
  `res_de_leyes`.
- **Certificado intermedio empaquetado** para restaurar verificación TLS
  completa (ADR-002).
- **Diseño móvil.** Hoy responde, pero el mapa no está pensado para pantalla
  chica; probablemente necesite la vista de lista como modo por defecto.

## Pendiente de definir — preguntas abiertas

1. ~~**Votaciones nominales.**~~ — **resuelto**: la fuente es el acta oficial
   del SIL+ (ADR-021). Delfino.cr ya no hace falta.
2. **Asistencia.** Resuelto en parte: existe la mensual oficial (ver
   «Próximo»). Queda abierta solo la asistencia **por sesión**, que depende
   de las actas.
3. **Curules reales.** ¿Vale la pena pedir por transparencia el mapa de
   asiento por diputación? Convertiría el hemiciclo de `derivado` a
   `oficial` (ADR-003).
4. **Donaciones.** Definir medio de pago real. Hasta entonces el botón queda
   deshabilitado a propósito.
5. **Dominio y despliegue.** Pendiente hasta validar el sitio en local.

## Deuda técnica

- `publish_web.py` mezcla geometría y armado del payload; conviene separarlo
  cuando entren más conjuntos de datos.
- No hay pruebas automatizadas. Como mínimo hacen falta pruebas del ETL
  (cuadres) y una prueba de humo del render.
- `biografia_html` viaja en `data/processed/` pero no se usa en el sitio: el
  frontend consume solo la versión en texto plano. Decidir si se sanea y se
  muestra el HTML con formato o si se deja de exportar.
- El payload (108 KB) crecerá con nuevos conjuntos. Habrá que separar el
  índice de las fichas y cargar el detalle bajo demanda.
- Los umbrales de nivel de detalle del mapa están fijos en el componente;
  moverlos a configuración si se ajustan seguido.
