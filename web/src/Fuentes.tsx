import type { ReactNode } from 'react'
import { extraccionMasVieja, fechaHora } from './frescura'
import type { Asamblea } from './tipos'
import { URL_SIL } from './votos'

/** Donde viven el codigo y el historial de cada dato extraido. */
const REPOSITORIO = 'https://github.com/wramirezsa/asamblea_costa_rica'

interface Conjunto {
  nombre: string
  contenido: string
  fuentes: { texto: string; url: string }[]
  extraido: string | null
  /** El SIL+ responde desde cualquier lado; el SharePoint, solo desde Costa Rica. */
  automatico: boolean
}

/**
 * De dónde sale cada dato, qué tan fresco está y qué no mostramos.
 *
 * Reúne en un solo lugar lo que antes estaba disperso entre el pie y las
 * notas de cada bloque. Las URL y las notas vienen del payload (las escribe
 * el ETL junto con los datos): esta página no afirma nada por su cuenta.
 */
export default function Fuentes({ datos }: { datos: Asamblea }) {
  const act = datos.actividad
  const conjuntos: Conjunto[] = [
    {
      nombre: 'Padrón de diputaciones',
      contenido: `Las ${datos.total} diputaciones, sus fotografías oficiales, datos personales y biografías; las fracciones y sus banderas.`,
      fuentes: [
        { texto: 'Lista Diputados y Diputadas 2026-2030', url: datos.fuente_oficial },
        ...(datos.fuente_fracciones
          ? [{ texto: 'Lista Fracciones 2026-2030', url: datos.fuente_fracciones }]
          : []),
      ],
      extraido: datos.extraido.padron,
      automatico: false,
    },
    {
      nombre: 'Directorio Legislativo',
      contenido: datos.directorio.nota,
      fuentes: [{ texto: 'Integración del Directorio Legislativo', url: datos.directorio._fuente }],
      extraido: datos.extraido.directorio,
      automatico: false,
    },
    {
      nombre: 'Leyes, mociones e intervenciones',
      contenido:
        'Leyes aprobadas, mociones y documentos de intervenciones por diputación. Cada bloque de Actividad muestra además cuándo lo tocó la Asamblea por última vez.',
      fuentes: act
        ? [
            { texto: 'Leyes', url: act.leyes._fuente },
            { texto: 'Mociones', url: act.mociones._fuente },
            { texto: 'Intervenciones', url: act.intervenciones._fuente },
          ]
        : [],
      extraido: datos.extraido.actividad,
      automatico: false,
    },
    {
      nombre: 'Remuneración y combustible',
      contenido:
        'Excel mensuales del portal de datos abiertos de la Asamblea, desde mayo de 2026. Se muestran tal como se publican, sin sumas ni promedios.',
      fuentes: datos.gasto ? [{ texto: 'Portal de datos abiertos', url: datos.gasto._fuente }] : [],
      extraido: datos.extraido.gasto,
      automatico: false,
    },
    {
      nombre: 'Asistencia y votaciones del Plenario',
      contenido:
        'Actas oficiales de cada sesión, redactadas por el Área de Actas, Sonido y Grabación: la lista de presentes y el voto nominal de cada votación.',
      fuentes: [{ texto: 'Sistema de Información Legislativa (SIL)', url: URL_SIL }],
      extraido: datos.extraido.actas,
      automatico: true,
    },
  ]

  const actas = datos.actas
  const noMostramos: [string, ReactNode][] = [
    [
      'Comisiones',
      'Cubrimos solo el Plenario: las actas que leemos son las de sus sesiones. No mostramos asistencia ni votaciones de comisiones.',
    ],
    [
      'Uso de vehículos y viajes al exterior',
      'La Asamblea los publica, pero con formatos mezclados: montos escritos de varias formas y la diputación dentro de un texto libre. Leerlos mal sería inventar cifras, así que todavía no los mostramos.',
    ],
    [
      'Votaciones que no cuadran',
      <>
        Si en el acta los totales no coinciden con los nombres listados, la votación no se publica
        {actas ? ` (hoy: ${actas.votaciones_no_publicables})` : ''}. Si lo que anunció la
        Presidencia no coincide con la lista, la votación se muestra sin resultado, como «Sin
        verificar».
      </>,
    ],
    [
      'Votaciones leídas de la transmisión',
      'Las extraemos del video de las sesiones solo para contrastarlas con las actas. No se publican: son totales transcritos por una máquina, no el registro oficial.',
    ],
    [
      'Actas que todavía no tienen texto',
      actas && actas.sin_documento.length > 0
        ? `El SIL lista algunas sesiones antes de publicar su acta; entran al sitio cuando aparece el texto. Pendientes hoy: ${actas.sin_documento.join(', ')}.`
        : 'El SIL lista algunas sesiones antes de publicar su acta; entran al sitio cuando aparece el texto. Hoy no hay ninguna pendiente.',
    ],
    [
      'Lo que la Asamblea no publica',
      'En las fichas aparece como «Sin dato oficial». No se completa con estimaciones: que falte el dato también es información.',
    ],
  ]

  const reconstruido: [string, string][] = [
    [
      'Diagrama de composición',
      `Es una convención para mostrar el reparto de curules: el plenario real no es un hemiciclo, sino una sala rectangular. ${datos.hemiciclo.nota}`,
    ],
    ['Salón 3D', datos.sala.nota],
    ['Colores de las bancadas', datos.metodo_colores],
    [
      'Nombres en las actas',
      'Las actas a veces escriben distinto a una misma persona («Roberth» y «Robert»). Se resuelve solo por coincidencia exacta o con una tabla de equivalencias revisada a mano, una por una y con su motivo; nunca por parecido.',
    ],
    ...(datos.escudo ? [['Escudo', datos.escudo.nota] as [string, string]] : []),
  ]

  return (
    <section className="actividad fuentes" id="fuentes">
      <div className="actividad-cabecera">
        <h2>Fuentes</h2>
        <p>
          Todo lo que muestra este sitio sale de fuentes oficiales de la Asamblea Legislativa
          de Costa Rica. Acá está de dónde sale cada conjunto, cuándo se leyó por última vez y
          qué no mostramos.
        </p>
      </div>

      <div className="fu-tabla" role="table" aria-label="Fuentes de cada conjunto de datos">
        <div className="fu-fila fu-encabezado" role="row">
          <span role="columnheader">Conjunto</span>
          <span role="columnheader">Fuente oficial</span>
          <span role="columnheader">Última extracción</span>
        </div>
        {conjuntos.map((c) => (
          <div className="fu-fila" role="row" key={c.nombre}>
            <div role="cell">
              <strong>{c.nombre}</strong>
              <p>{c.contenido}</p>
            </div>
            <div role="cell" className="fu-enlaces">
              {c.fuentes.length ? (
                c.fuentes.map((f) => (
                  <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">
                    {f.texto}
                  </a>
                ))
              ) : (
                <span className="vacio">Sin dato oficial</span>
              )}
            </div>
            <div role="cell">
              <span className="fu-fecha">{fechaHora(c.extraido)}</span>
              <small>{c.automatico ? 'Se revisa sola, a diario' : 'Se extrae desde Costa Rica'}</small>
            </div>
          </div>
        ))}
      </div>
      <p className="fu-nota">
        Las fechas pueden no coincidir. Las actas se revisan solas todos los días. El resto se
        extrae desde una computadora en Costa Rica, porque el sitio de la Asamblea no acepta
        conexiones desde fuera del país. Por eso la cabecera muestra siempre la extracción más
        vieja: hoy, {fechaHora(extraccionMasVieja(datos.extraido))}.
      </p>

      <div className="fu-bloques">
        <div>
          <h3>Qué no mostramos y por qué</h3>
          <dl className="fu-lista">
            {noMostramos.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <h3>Qué es reconstrucción o cálculo propio</h3>
          <dl className="fu-lista">
            {reconstruido.map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="actividad-pie">
        {datos.licencia}. Proyecto ciudadano independiente, sin vínculo con la Asamblea
        Legislativa. El código y el historial de cada dato extraído, con la respuesta cruda de
        la fuente, son públicos en{' '}
        <a href={REPOSITORIO} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        . Sitio armado el {fechaHora(datos.generado)}.
      </div>
    </section>
  )
}
