import { useEffect, useMemo, useRef, useState } from 'react'
import type { DatosVotaciones, ResumenActas } from './tipos'
import { URL_SIL, VOTO, cargarVotaciones, fechaCorta, fechaLarga, nombreSesion } from './votos'

interface Props {
  resumen: ResumenActas
  onVer: (indice: number) => void
}

/**
 * Las votaciones nominales del Plenario, sesion por sesion. Los datos se
 * piden recien cuando la seccion entra en pantalla: quien solo mira el mapa
 * no los descarga.
 */
export default function Votaciones({ resumen, onVer }: Props) {
  const raiz = useRef<HTMLElement | null>(null)
  const [datos, setDatos] = useState<DatosVotaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sesion, setSesion] = useState<number | null>(null)
  const [filtro, setFiltro] = useState('')

  useEffect(() => {
    if (!raiz.current) return
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          obs.disconnect()
          cargarVotaciones()
            .then(setDatos)
            .catch((e) => setError(String(e.message ?? e)))
        }
      },
      { rootMargin: '300px' }
    )
    obs.observe(raiz.current)
    return () => obs.disconnect()
  }, [])

  // Sesiones con al menos una votacion, de la mas reciente a la mas vieja.
  const sesiones = useMemo(() => {
    if (!datos) return []
    const cuenta = new Map<number, number>()
    datos.votaciones.forEach((v) => cuenta.set(v.s, (cuenta.get(v.s) ?? 0) + 1))
    return [...cuenta.keys()]
      .sort((a, b) => datos.sesiones[b].fecha.localeCompare(datos.sesiones[a].fecha) || b - a)
      .map((i) => ({ i, n: cuenta.get(i) ?? 0 }))
  }, [datos])

  useEffect(() => {
    if (sesion === null && sesiones.length) setSesion(sesiones[0].i)
  }, [sesiones, sesion])

  const filas = useMemo(() => {
    if (!datos || sesion === null) return []
    const q = normalizar(filtro.trim())
    return datos.votaciones
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => v.s === sesion)
      .filter(({ v }) => !q || normalizar(`${v.p ?? ''} ${v.e ?? ''}`).includes(q))
  }, [datos, sesion, filtro])

  const sinResultado = useMemo(
    () => (datos ? datos.votaciones.filter((v) => !v.r).length : 0),
    [datos]
  )

  return (
    <section className="actividad votaciones" ref={raiz} id="votaciones">
      <div className="actividad-cabecera">
        <h2>Votaciones del Plenario</h2>
        <p>
          Cómo votó cada diputación en las {resumen.votaciones.toLocaleString('es-CR')}{' '}
          votaciones nominales registradas en las actas oficiales
          {resumen.desde && resumen.hasta
            ? `, del ${fechaLarga(resumen.desde)} al ${fechaLarga(resumen.hasta)}`
            : ''}
          . Elegí una sesión y una votación para verla en el mapa.
        </p>
      </div>

      {error && <p className="vt-aviso">No se pudieron cargar las votaciones: {error}</p>}
      {!datos && !error && <p className="vt-aviso">Cargando las votaciones…</p>}

      {datos && sesion !== null && (
        <div className="vt-cuerpo">
          <div className="vt-controles">
            <label>
              <span>Sesión</span>
              <select value={sesion} onChange={(e) => setSesion(Number(e.target.value))}>
                {sesiones.map(({ i, n }) => (
                  <option key={i} value={i}>
                    {fechaCorta(datos.sesiones[i].fecha)} · {nombreSesion(datos.sesiones[i])} ·{' '}
                    {n} {n === 1 ? 'votación' : 'votaciones'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Buscar en esta sesión</span>
              <input
                type="search"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Propuesta o expediente"
              />
            </label>
          </div>

          <ol className="vt-lista">
            {filas.map(({ v, i }) => (
              <li key={i}>
                <button className="vt-fila" onClick={() => onVer(i)}>
                  <span className="vt-n">{v.n}</span>
                  <span className="vt-propuesta">
                    {v.p ?? 'Propuesta sin nombre en el acta'}
                  </span>
                  <span className="vt-totales">
                    {(['F', 'C', 'N'] as const).map((c, k) => (
                      <span key={c} title={VOTO[c].etiqueta}>
                        <i style={{ background: VOTO[c].color }}>{VOTO[c].simbolo}</i>
                        {v.d[k] ?? '—'}
                      </span>
                    ))}
                  </span>
                  <span className={`vt-resultado ${v.r ?? 'sin-dato'}`}>
                    {v.r === 'aprobada' ? 'Aprobada' : v.r === 'rechazada' ? 'Rechazada' : 'Sin verificar'}
                  </span>
                  <span className="vt-ver">Ver en el mapa</span>
                </button>
              </li>
            ))}
            {filas.length === 0 && <li className="vt-vacio">Ninguna votación coincide.</li>}
          </ol>
        </div>
      )}

      <div className="actividad-pie">
        Fuente: actas oficiales de las sesiones del Plenario, redactadas por el Área de Actas,
        Sonido y Grabación de la Asamblea Legislativa y consultables en el{' '}
        <a href={URL_SIL} target="_blank" rel="noopener noreferrer">
          SIL
        </a>
        . Cada votación se publica solo si en el acta cuadran los totales con los nombres
        listados. El resultado se muestra únicamente cuando lo que anunció la Presidencia
        coincide con esa lista
        {datos ? `; en ${sinResultado} votaciones no coincide y queda «Sin verificar»` : ''}.
        {resumen.sin_documento.length > 0 &&
          ` Todavía sin texto publicado: ${resumen.sin_documento.join(', ')}.`}
      </div>
    </section>
  )
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
