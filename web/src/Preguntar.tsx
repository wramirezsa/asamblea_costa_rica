import { useRef, useState } from 'react'

/**
 * Preguntá: un asistente que responde con los datos del sitio (ADR-030).
 *
 * La IA solo entiende la pregunta y elige qué consultar; las cifras las
 * calculan herramientas sobre los mismos datos publicados. Cada respuesta
 * muestra qué se consultó y enlaza a donde verificarlo.
 */

const URL_ASISTENTE = import.meta.env.VITE_ASISTENTE_URL as string | undefined

const SUGERENCIAS = [
  '¿Quién no figura entre los presentes esta semana?',
  '¿Cómo vota José María Villalta?',
  '¿Cuál proyecto tiene más votaciones?',
  '¿Qué es una moción de fondo?',
  '¿Cuántas curules tiene cada partido?',
  '¿Quién recibió más combustible el último mes?',
]

const NOMBRE_HERRAMIENTA: Record<string, string> = {
  buscar_diputacion: 'Ficha de la diputación',
  ranking: 'Comparación entre diputaciones',
  composicion: 'Composición del Plenario',
  semana: 'La última semana',
  proyectos_mas_votados: 'Proyectos con más votaciones',
  buscar_votaciones: 'Búsqueda de votaciones',
  glosario: 'Glosario del Reglamento',
  sobre_los_datos: 'Fuentes y fechas',
}

interface Turno {
  pregunta: string
  respuesta?: string
  error?: string
  consultas?: { herramienta: string; argumentos: Record<string, unknown> }[]
  enlaces?: { texto: string; url: string }[]
}

export default function Preguntar() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [esperando, setEsperando] = useState(false)
  const fin = useRef<HTMLDivElement | null>(null)

  const preguntar = async (pregunta: string) => {
    const q = pregunta.trim()
    if (!q || esperando || !URL_ASISTENTE) return
    setTexto('')
    setEsperando(true)
    setTurnos((t) => [...t, { pregunta: q }])
    let turno: Turno
    try {
      const pedir = () =>
        fetch(`${URL_ASISTENTE.replace(/\/$/, '')}/preguntar`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // La memoria de la conversación vive aquí, en el navegador: se
          // mandan los últimos turnos para que se entiendan las repreguntas.
          body: JSON.stringify({
            pregunta: q,
            historial: turnos
              .filter((x) => x.respuesta)
              .slice(-4)
              .map((x) => ({ pregunta: x.pregunta, respuesta: x.respuesta })),
          }),
        })
      let r = await pedir()
      // Un tropiezo pasajero de la IA (502) se reintenta una vez; los límites
      // (429, 503) no, porque reintentar no los resuelve.
      if (r.status === 502) {
        await new Promise((ok) => setTimeout(ok, 1200))
        r = await pedir()
      }
      const j = await r.json()
      turno = r.ok ? { pregunta: q, ...j } : { pregunta: q, error: j.error ?? 'No se pudo responder.' }
    } catch {
      turno = { pregunta: q, error: 'No se pudo contactar al asistente. Revisá tu conexión.' }
    }
    setTurnos((t) => [...t.slice(0, -1), turno])
    setEsperando(false)
    requestAnimationFrame(() => fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }))
  }

  return (
    <section className="actividad preguntar" id="preguntar">
      <div className="actividad-cabecera">
        <h2>Preguntá</h2>
        <p>
          Hacé una pregunta concreta sobre el Plenario: asistencia, votaciones, proyectos, gasto o
          cómo se reparten las curules. Podés repreguntar («¿y cuántas veces votó en contra?»): el
          asistente recuerda la conversación hasta que la borrés o recargués la página. Las cifras salen de los mismos datos oficiales del sitio, y
          cada respuesta dice qué consultó y dónde verificarlo.
        </p>
      </div>

      {!URL_ASISTENTE ? (
        <p className="vacio">El asistente todavía no está activo.</p>
      ) : (
        <>
          <div className="pq-conversacion" aria-live="polite">
            {turnos.length === 0 && (
              <div className="pq-sugerencias">
                {SUGERENCIAS.map((s) => (
                  <button key={s} onClick={() => preguntar(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {turnos.map((t, i) => (
              <div key={i} className="pq-turno">
                <p className="pq-pregunta">{t.pregunta}</p>
                {t.respuesta === undefined && !t.error && <p className="pq-esperando">Consultando los datos…</p>}
                {t.error && <p className="pq-error">{t.error}</p>}
                {t.respuesta && (
                  <div className="pq-respuesta">
                    {t.respuesta.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/(^|\s)_([^_\n]+)_/g, '$1$2').split('\n').filter(Boolean).map((l, k) => (
                      <p key={k}>{l}</p>
                    ))}
                    {!!t.consultas?.length && (
                      <p className="pq-consultas">
                        Consultó:{' '}
                        {[...new Set(t.consultas.map((c) => NOMBRE_HERRAMIENTA[c.herramienta] ?? c.herramienta))].join(
                          ' · '
                        )}
                      </p>
                    )}
                    {!t.consultas?.length && (
                      <p className="pq-consultas">No consultó ningún dato: tomalo como orientación, no como cifra.</p>
                    )}
                    {!!t.enlaces?.length && (
                      <p className="pq-enlaces">
                        Verificalo en:{' '}
                        {t.enlaces.map((e) => (
                          <a key={e.url} href={e.url}>
                            {e.texto}
                          </a>
                        ))}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={fin} />
          </div>

          {turnos.length > 0 && (
            <button
              className="pq-nueva"
              onClick={() => setTurnos([])}
              disabled={esperando}
              title="Borra la memoria de esta conversación"
            >
              Nueva conversación
            </button>
          )}

          <form
            className="pq-formulario"
            onSubmit={(e) => {
              e.preventDefault()
              preguntar(texto)
            }}
          >
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Por ejemplo: ¿cuántas veces votó a favor…?"
              maxLength={400}
              aria-label="Tu pregunta"
              disabled={esperando}
            />
            <button type="submit" disabled={esperando || !texto.trim()}>
              {esperando ? 'Consultando…' : 'Preguntar'}
            </button>
          </form>
        </>
      )}

      <div className="actividad-pie">
        Asistente experimental. Una inteligencia artificial (Groq o, de respaldo, Cloudflare)
        interpreta tu pregunta y redacta la respuesta; las cifras las calculan herramientas sobre los
        datos oficiales publicados en este sitio, no la IA. Puede equivocarse al entender la pregunta:
        verificá siempre en los enlaces. No escribas datos personales: la pregunta se envía a esos
        servicios para interpretarla.
      </div>
    </section>
  )
}
