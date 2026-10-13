import { useEffect, useMemo, useRef, useState } from 'react'
import { fechaHora } from './frescura'
import ResumenSemana from './ResumenSemana'
import { ChipsTerminos, GlosarioCompleto } from './Glosario'
import type { DatosVotaciones, Diputado, Glosario, ResumenActas } from './tipos'
import { URL_SIL, VOTO, cargarVotaciones, fechaCorta, fechaLarga, nombreSesion } from './votos'

/** Opciones del selector que no son una sesión. */
const SEMANA = -1
const TODAS = -2
/** Filas que se pintan a la vez: miles de botones traban un celular. */
const TOPE_FILAS = 200

interface Props {
  resumen: ResumenActas
  glosario: Glosario | null
  diputados: Diputado[]
  onVer: (indice: number) => void
}

/**
 * Las votaciones nominales del Plenario, sesion por sesion. Los datos se
 * piden al abrir la seccion: quien solo mira el mapa no los descarga.
 */
export default function Votaciones({ resumen, glosario, diputados, onVer }: Props) {
  const [datos, setDatos] = useState<DatosVotaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sesion, setSesion] = useState<number | null>(null)
  const [filtro, setFiltro] = useState('')

  // Votaciones es una sección propia: si se abrió, se quieren los datos.
  // (Antes se pedían al entrar en pantalla, cuando todo era una sola página.)
  useEffect(() => {
    cargarVotaciones()
      .then(setDatos)
      .catch((e) => setError(String(e.message ?? e)))
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

  // La última semana con actas: la última sesión sola a veces trae una
  // votación y la lista parecía vacía. Mismo corte que el resumen semanal.
  const semana = useMemo(() => {
    if (!datos || !sesiones.length) return new Set<number>()
    const ultima = datos.sesiones[sesiones[0].i].fecha
    const d = new Date(`${ultima}T12:00:00`)
    d.setDate(d.getDate() - 6)
    const inicio = d.toISOString().slice(0, 10)
    return new Set(sesiones.filter(({ i }) => datos.sesiones[i].fecha >= inicio).map(({ i }) => i))
  }, [datos, sesiones])

  useEffect(() => {
    if (sesion === null && sesiones.length) setSesion(SEMANA)
  }, [sesiones, sesion])

  const refLista = useRef<HTMLDivElement | null>(null)
  const verProyecto = (numero: string) => {
    setSesion(TODAS)
    setFiltro(numero)
    requestAnimationFrame(() => refLista.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const q = normalizar(filtro.trim())
  const filas = useMemo(() => {
    if (!datos || sesion === null) return []
    if (sesion === TODAS && !q) return []
    const elegidas = datos.votaciones
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => (sesion === SEMANA ? semana.has(v.s) : sesion === TODAS || v.s === sesion))
      .filter(({ v }) => !q || normalizar(`${v.p ?? ''} ${v.e ?? ''}`).includes(q))
    // Varias sesiones: de la más reciente a la más vieja.
    if (sesion === SEMANA || sesion === TODAS) {
      elegidas.sort(
        (a, b) =>
          datos.sesiones[b.v.s].fecha.localeCompare(datos.sesiones[a.v.s].fecha) ||
          b.v.s - a.v.s ||
          a.v.n - b.v.n
      )
    }
    return elegidas
  }, [datos, sesion, semana, q])
  const variasSesiones = sesion === SEMANA || sesion === TODAS
  const nSemana = datos ? datos.votaciones.filter((v) => semana.has(v.s)).length : 0

  const sinResultado = useMemo(
    () => (datos ? datos.votaciones.filter((v) => !v.r).length : 0),
    [datos]
  )

  return (
    <section className="actividad votaciones" id="votaciones">
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

      {/* Resumen en números: todo conteo directo de las actas, nada estimado. */}
      <div className="cifras">
        <div className="cifra">
          <strong>{resumen.sesiones.toLocaleString('es-CR')}</strong>
          <span>sesiones con acta</span>
          {resumen.desde && resumen.hasta && (
            <small>
              del {fechaCorta(resumen.desde)} al {fechaCorta(resumen.hasta)}
            </small>
          )}
        </div>
        <div className="cifra">
          <strong>{resumen.votaciones.toLocaleString('es-CR')}</strong>
          <span>votaciones nominales</span>
          <small>con el voto de cada diputación</small>
        </div>
        <div className="cifra">
          <strong>{resumen.votaciones_no_publicables.toLocaleString('es-CR')}</strong>
          <span>excluidas por no cuadrar</span>
          <small>
            {datos
              ? `y ${sinResultado.toLocaleString('es-CR')} con resultado sin verificar`
              : 'totales del acta contra nombres'}
          </small>
        </div>
        <div className="cifra">
          <strong>{resumen.sin_documento.length}</strong>
          <span>{resumen.sin_documento.length === 1 ? 'acta sin texto' : 'actas sin texto'} todavía</span>
          <small>revisado el {fechaHora(resumen._extraido)}</small>
        </div>
      </div>

      {datos && <ResumenSemana datos={datos} diputados={diputados} onVer={onVer} />}

      {resumen.proyectos.length > 0 && (
        <div className="proyectos">
          <h3>Los proyectos con más votaciones</h3>
          <p className="proyectos-nota">
            Desde el {fechaCorta(resumen.desde ?? '')}. Cada moción y su revisión es una votación
            aparte, por eso un proyecto muy disputado acumula miles.
          </p>
          <ol>
            {resumen.proyectos.slice(0, 5).map((p) => {
              const ancho = Math.max(2, (p.votaciones / resumen.proyectos[0].votaciones) * 100)
              return (
                <li key={p.numero}>
                  <div className="proyecto-texto">
                    <span className="proyecto-nombre">
                      {p.nombre ?? <span className="vacio">Sin nombre en las actas</span>}
                    </span>
                    <span className="proyecto-meta">
                      Exp. {Number(p.numero).toLocaleString('es-CR')} · {p.votaciones.toLocaleString('es-CR')}{' '}
                      {p.votaciones === 1 ? 'votación' : 'votaciones'} en {p.sesiones}{' '}
                      {p.sesiones === 1 ? 'sesión' : 'sesiones'}
                      {p.desde !== p.hasta
                        ? ` · del ${fechaCorta(p.desde)} al ${fechaCorta(p.hasta)}`
                        : ` · ${fechaCorta(p.desde)}`}
                    </span>
                    <span className="proyecto-barra" aria-hidden="true">
                      <span style={{ width: `${ancho}%` }} />
                    </span>
                  </div>
                  <button onClick={() => verProyecto(p.numero)} disabled={!datos}>
                    Ver sus votaciones
                  </button>
                </li>
              )
            })}
          </ol>
          <p className="proyectos-nota">
            Conteo directo de las votaciones publicadas. El número de expediente sale del título de
            cada votación; el nombre, del acta de la sesión en que se votó.
          </p>
        </div>
      )}

      <GlosarioCompleto glosario={glosario} />

      {error && <p className="vt-aviso">No se pudieron cargar las votaciones: {error}</p>}
      {!datos && !error && <p className="vt-aviso">Cargando las votaciones…</p>}

      {datos && sesion !== null && (
        <div className="vt-cuerpo" ref={refLista}>
          <div className="vt-controles">
            <label>
              <span>Sesión</span>
              <select value={sesion} onChange={(e) => setSesion(Number(e.target.value))}>
                <option value={SEMANA}>
                  Última semana · {nSemana} {nSemana === 1 ? 'votación' : 'votaciones'}
                </option>
                <option value={TODAS}>
                  Todas las sesiones · {datos.votaciones.length.toLocaleString('es-CR')} votaciones
                </option>
                {sesiones.map(({ i, n }) => (
                  <option key={i} value={i}>
                    {fechaCorta(datos.sesiones[i].fecha)} · {nombreSesion(datos.sesiones[i])} ·{' '}
                    {n} {n === 1 ? 'votación' : 'votaciones'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Buscar</span>
              <input
                type="search"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Propuesta o número de expediente"
              />
            </label>
          </div>

          <ol className="vt-lista">
            {filas.slice(0, TOPE_FILAS).map(({ v, i }) => (
              <li key={i}>
                <button className="vt-fila" onClick={() => onVer(i)}>
                  <span className="vt-n">{v.n}</span>
                  <span className="vt-propuesta">
                    {variasSesiones && (
                      <span className="vt-sesion">
                        {fechaCorta(datos.sesiones[v.s].fecha)} · {nombreSesion(datos.sesiones[v.s])}
                      </span>
                    )}
                    {v.p ?? 'Propuesta sin nombre en el acta'}
                    <ChipsTerminos titulo={v.p} glosario={glosario} />
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
            {filas.length > TOPE_FILAS && (
              <li className="vt-vacio">
                Se muestran las {TOPE_FILAS} más recientes de {filas.length.toLocaleString('es-CR')}{' '}
                votaciones. Escribí algo más específico para acotar.
              </li>
            )}
            {filas.length === 0 && (
              <li className="vt-vacio">
                {sesion === TODAS && !q
                  ? `Escribí una propuesta o un número de expediente para buscar entre las ${datos.votaciones.length.toLocaleString('es-CR')} votaciones.`
                  : 'Ninguna votación coincide.'}
              </li>
            )}
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
