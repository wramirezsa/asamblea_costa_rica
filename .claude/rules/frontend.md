# Reglas del frontend (`web/`)

Complementan `CLAUDE.md`; no lo repiten.

## Honestidad en pantalla

- Un campo vacío se muestra como *"Sin dato oficial"* con estilo apagado.
  Nunca se oculta la fila: que falte el dato **es** información.
- Todo lo derivado se declara en la interfaz donde se usa, no solo en la
  documentación. El aviso del hemiciclo es el ejemplo a seguir.
- La fecha de extracción va siempre visible en la cabecera. El usuario tiene
  que poder saber qué tan fresco es lo que está viendo.
- El pie declara explícitamente **qué no mostramos y por qué**.

## Datos

- Solo se lee `datos/asamblea.json` y `assets/`. Cero llamadas a fuentes
  externas desde el navegador (ADR-005).
- `src/tipos.ts` refleja el payload de `publish_web.py`. Si cambia el ETL,
  cambia ese archivo en el mismo commit.
- Si el JSON no carga, el error explica **cómo generarlo**, con los comandos.
  Nunca una pantalla en blanco.

## Mapa

- Los filtros **atenúan**, no ocultan. Perder la silueta del plenario es
  perder el sentido del mapa.
- Niveles de detalle por zoom: color → aro → foto → apellido. Al alejarse
  tiene que leerse como distribución política; al acercarse, como personas.
- Trazos en coordenadas del mundo: multiplicar por `1/k` para que no
  engorden al acercarse.
- Distinguir clic de arrastre por distancia del puntero (<5 px), o mover el
  mapa abre fichas sin querer.
- Volar a una curul solo si la selección **no** vino de un clic en el mapa.

## Rendimiento y composición

- Nada de `backdrop-filter` sobre el lienzo del mapa (ADR-006).
- No animar propiedades que fuercen repintado en las 57 figuras a la vez
  (`stroke-width`, `r`). Animar `opacity` y `transform`.
- Un solo `clipPath` con `clipPathUnits="objectBoundingBox"` sirve para las
  57 fotos. No crear uno por curul.

## Idioma y accesibilidad

- Todo el texto visible en español de Costa Rica. Los identificadores del
  código también van en español, para que el vocabulario del dominio sea uno
  solo.
- Contraste mínimo AA sobre el fondo oscuro.
- Color nunca como único portador de significado: acompañar con texto
  (código de bancada, nombre) o forma.
