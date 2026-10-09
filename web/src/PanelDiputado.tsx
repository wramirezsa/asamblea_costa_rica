import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Asamblea, DatosVotaciones, Diputado, Intervencion } from './tipos'
import { recurso } from './rutas'
import { URL_SIL, VOTO, cargarVotaciones, fechaCorta, fechaLarga, nombreSesion, votoDe } from './votos'

interface Props {
  dip: Diputado
  datos: Asamblea
  color: string
  /** Documentos de intervenciones en plenario publicados por la Asamblea. */
  intervenciones: Intervencion[]
  /** Abre una votacion en el mapa (y cierra la ficha). */
  onVerVotacion: (indice: number) => void
  onCerrar: () => void
}

// La ficha se ordena por lo que la gente viene a buscar: quien es, como
// trabaja en el Plenario, cuanto recibe y que ha dicho. Antes era una sola
// tira larga donde lo mas consultado quedaba en medio.
type Pestana = 'perfil' | 'plenario' | 'remuneracion' | 'intervenciones'
const PESTANAS: Array<[Pestana, string]> = [
  ['perfil', 'Perfil'],
  ['plenario', 'En el Plenario'],
  ['remuneracion', 'Remuneración'],
  ['intervenciones', 'Intervenciones'],
]

const SECCIONES: Array<[keyof Diputado['biografia'], string]> = [
  ['areas_interes', 'Áreas de interés'],
  ['educacion', 'Educación'],
  ['experiencia_laboral', 'Experiencia laboral'],
  ['experiencia_politica', 'Experiencia política'],
  ['participacion_comunal', 'Participación comunal'],
  ['premios', 'Premios y reconocimientos'],
  ['publicaciones', 'Publicaciones'],
  ['ponencias', 'Ponencias'],
]

const REDES: Array<[keyof Diputado['redes'], string]> = [
  ['facebook', 'Facebook'],
  ['twitter', 'X / Twitter'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['blog', 'Sitio web'],
]

export default function PanelDiputado({
  dip,
  datos,
  color,
  intervenciones,
  onVerVotacion,
  onCerrar,
}: Props) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  const [pestana, setPestana] = useState<Pestana>('perfil')
  const edad = calcularEdad(dip.fecha_nacimiento)
  const redes = REDES.filter(([k]) => dip.redes[k])

  return (
    <>
      <div className="velo" onClick={onCerrar} />
      <aside className="panel" role="dialog" aria-modal="true" aria-label={dip.nombre}>
        <div className="panel-cabecera">
          <button className="panel-cerrar" onClick={onCerrar} aria-label="Cerrar ficha">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="panel-perfil">
            {dip.foto ? (
              <img
                className="panel-foto"
                src={`${recurso('assets')}/${dip.foto}`}
                alt={`Fotografía oficial de ${dip.nombre}`}
                style={{ borderColor: color }}
              />
            ) : (
              <div className="panel-foto" style={{ background: color, opacity: 0.4 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <h2 className="panel-nombre">{dip.nombre}</h2>
              <span
                className="insignia"
                style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
              >
                <span
                  style={{ width: 8, height: 8, borderRadius: '50%', background: color }}
                />
                {dip.fraccion ?? dip.partido_codigo ?? 'Sin fracción'}
              </span>
              <span
                className="insignia"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--texto-2)',
                  border: '1px solid var(--borde)',
                }}
              >
                {dip.provincia ?? 'Provincia no indicada'}
              </span>
              {dip.cargo_directorio && (
                <span
                  className="insignia insignia-directorio"
                  title="Cargo en el Directorio Legislativo"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d="m12 2 2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L12 16.3 6.2 19.8l1.6-6.6L2.6 8.8l6.8-.5L12 2Z" />
                  </svg>
                  {dip.cargo_directorio}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="pestanas" role="tablist" aria-label="Secciones de la ficha">
          {PESTANAS.map(([clave, etiqueta]) => (
            <button
              key={clave}
              role="tab"
              aria-selected={pestana === clave}
              className={`pestana${pestana === clave ? ' activa' : ''}`}
              onClick={() => setPestana(clave)}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        <div className="panel-cuerpo" role="tabpanel">
          {pestana === 'perfil' && (
            <>
              <div className="rejilla-datos">
                <Dato etiqueta="Profesión" valor={dip.profesion} />
                <Dato etiqueta="Edad" valor={edad ? `${edad} años` : null} />
                <Dato etiqueta="Lugar de nacimiento" valor={dip.lugar_nacimiento} />
                <Dato etiqueta="Estado civil" valor={dip.estado_civil} />
                <Dato etiqueta="Cédula" valor={dip.cedula} />
                <Dato etiqueta="Nacimiento" valor={formatearFecha(dip.fecha_nacimiento)} />
              </div>

              {(dip.email_oficial || redes.length > 0) && (
                <div className="seccion">
                  <h3>Contacto</h3>
                  <div className="enlaces">
                    {dip.email_oficial && (
                      <a className="enlace" href={`mailto:${dip.email_oficial}`}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <path d="m22 7-10 6L2 7" />
                        </svg>
                        Correo oficial
                      </a>
                    )}
                    {redes.map(([clave, etiqueta]) => (
                      <a
                        key={clave}
                        className="enlace"
                        href={dip.redes[clave] as string}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {etiqueta}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {SECCIONES.map(([clave, titulo]) => {
                const texto = dip.biografia[clave]
                if (!texto) return null
                return (
                  <div className="seccion" key={clave}>
                    <h3>{titulo}</h3>
                    <p>{texto}</p>
                  </div>
                )
              })}

              <div className="nota-fuente">
                Toda la información de esta ficha proviene del padrón oficial de la Asamblea
                Legislativa de Costa Rica ({datos.periodo}), extraído el{' '}
                {new Date(datos.generado).toLocaleDateString('es-CR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                . Los campos vacíos aparecen así porque la Asamblea no los publica: no se
                completan con estimaciones.{' '}
                <a href={dip.foto_oficial_url ?? datos.fuente_oficial} target="_blank" rel="noopener noreferrer">
                  Ver fuente
                </a>
              </div>
            </>
          )}

          {pestana === 'plenario' &&
            (datos.actas ? (
              <>
                <AsistenciaPlenario dip={dip} datos={datos} />
                <HistorialVotos slug={dip.slug} onVer={onVerVotacion} />
              </>
            ) : (
              <SinDato titulo="En el Plenario" />
            ))}

          {pestana === 'remuneracion' &&
            (datos.gasto ? (
              <GastoMensual slug={dip.slug} datos={datos} />
            ) : (
              <SinDato titulo="Remuneración y combustible" />
            ))}

          {pestana === 'intervenciones' &&
            (intervenciones.length > 0 ? (
              <>
              <div className="seccion">
                <h3>Intervenciones en el plenario</h3>
                <p style={{ marginBottom: 10, fontSize: 12, color: 'var(--texto-3)' }}>
                  Documentos oficiales con lo que dijo en cada mes de sesiones.
                </p>
                <div className="enlaces">
                  {intervenciones.map((i) => (
                    <a
                      key={i.archivo}
                      className="enlace"
                      href={i.url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                        <path d="M14 2v6h6M9 13h6M9 17h6" />
                      </svg>
                      {i.periodo ?? i.archivo}
                    </a>
                  ))}
                </div>
              </div>
              </>
            ) : (
              <SinDato titulo="Intervenciones en el plenario" />
            ))}
        </div>
      </aside>
    </>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  return (
    <div className="dato">
      <div className="dato-et">{etiqueta}</div>
      <div className={`dato-v${valor ? '' : ' vacio'}`}>{valor ?? 'Sin dato oficial'}</div>
    </div>
  )
}

function calcularEdad(iso: string | null): number | null {
  if (!iso) return null
  const n = new Date(iso)
  if (Number.isNaN(n.getTime())) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - n.getFullYear()
  const m = hoy.getMonth() - n.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < n.getDate())) edad--
  return edad >= 0 && edad < 130 ? edad : null
}

function formatearFecha(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Asistencia segun la lista «Diputados presentes» de cada acta. El porcentaje
 * es derivado (un calculo nuestro sobre las actas) y se dice en pantalla.
 */
function AsistenciaPlenario({ dip, datos }: { dip: Diputado; datos: Asamblea }) {
  const actas = datos.actas
  if (!actas) return null
  const a = actas.asistencia[dip.slug]
  const total = actas.sesiones_con_lista_de_presentes
  if (!a || !total) {
    return (
      <div className="seccion">
        <h3>Asistencia al Plenario</h3>
        <p className="vacio">Sin dato oficial</p>
      </div>
    )
  }
  const pct = Math.round((a.presente / total) * 100)
  return (
    <div className="seccion">
      <h3>Asistencia al Plenario</h3>
      <div className="asistencia">
        <div className="asistencia-cifra">
          {a.presente}
          <span> de {total} sesiones</span>
        </div>
        <div className="asistencia-barra" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
      </div>
      <p className="fuente-chica">
        Figura en la lista de presentes de {a.presente} de las {total} actas publicadas
        {actas.desde && actas.hasta
          ? ` (del ${fechaLarga(actas.desde)} al ${fechaLarga(actas.hasta)})`
          : ''}
        : {pct} %. El porcentaje es un cálculo sobre las actas.
        {a.voto_sin_figurar > 0 &&
          ` En ${a.voto_sin_figurar} ${a.voto_sin_figurar === 1 ? 'sesión' : 'sesiones'} votó sin figurar en esa lista: así viene en el acta.`}
      </p>
    </div>
  )
}

/** Como voto esta persona. Las votaciones se piden recien al abrir la ficha. */
function HistorialVotos({ slug, onVer }: { slug: string; onVer: (i: number) => void }) {
  const [datos, setDatos] = useState<DatosVotaciones | null>(null)
  const [error, setError] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  useEffect(() => {
    cargarVotaciones()
      .then(setDatos)
      .catch(() => setError(true))
  }, [])

  const resumen = useMemo(() => {
    if (!datos) return null
    const k = datos.orden.indexOf(slug)
    if (k < 0) return null
    const cuenta = { F: 0, C: 0, N: 0, '-': 0 }
    const propias: number[] = []
    datos.votaciones.forEach((v, i) => {
      const c = votoDe(v, k)
      cuenta[c]++
      if (c !== '-') propias.push(i)
    })
    return { cuenta, propias: propias.reverse() }
  }, [datos, slug])

  return (
    <div className="seccion">
      <h3>Votaciones en el Plenario</h3>
      {error && <p className="vacio">No se pudieron cargar las votaciones.</p>}
      {!datos && !error && <p className="fuente-chica">Cargando…</p>}
      {datos && !resumen && <p className="vacio">Sin dato oficial</p>}
      {datos && resumen && (
        <>
          <div className="voto-resumen">
            {(['F', 'C', 'N'] as const).map((c) => (
              <span key={c}>
                <i style={{ background: VOTO[c].color }}>{VOTO[c].simbolo}</i>
                {VOTO[c].etiqueta} <b>{resumen.cuenta[c].toLocaleString('es-CR')}</b>
              </span>
            ))}
          </div>
          <p className="fuente-chica">
            Figura en {resumen.propias.length.toLocaleString('es-CR')} de las{' '}
            {datos.votaciones.length.toLocaleString('es-CR')} votaciones nominales registradas en
            las actas. Tocá una para verla en el mapa.
          </p>
          <ul className="voto-lista">
            {(verTodas ? resumen.propias : resumen.propias.slice(0, 8)).map((i) => {
              const v = datos.votaciones[i]
              const s = datos.sesiones[v.s]
              const c = votoDe(v, datos.orden.indexOf(slug))
              return (
                <li key={i}>
                  <button onClick={() => onVer(i)} title={`${nombreSesion(s)}, votación ${v.n}`}>
                    <i style={{ background: VOTO[c].color }} aria-label={VOTO[c].etiqueta}>
                      {VOTO[c].simbolo}
                    </i>
                    <span className="voto-propuesta">{v.p ?? 'Propuesta sin nombre en el acta'}</span>
                    <span className="voto-fecha">{fechaCorta(s.fecha)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {resumen.propias.length > 8 && (
            <button className="ver-mas" onClick={() => setVerTodas((x) => !x)}>
              {verTodas ? 'Ver menos' : `Ver las ${resumen.propias.length.toLocaleString('es-CR')}`}
            </button>
          )}
          <p className="fuente-chica">
            Fuente: actas oficiales del Plenario, consultables en el{' '}
            <a href={URL_SIL} target="_blank" rel="noopener noreferrer">
              SIL
            </a>
            .
          </p>
        </>
      )}
    </div>
  )
}

const MESES_CR = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'setiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09" -> "setiembre de 2026" (como se escribe en Costa Rica). */
function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES_CR[m - 1]} de ${a}`
}

const colones = new Intl.NumberFormat('es-CR', {
  style: 'currency',
  currency: 'CRC',
  maximumFractionDigits: 2,
})

function Monto({ v }: { v: number | null | undefined }) {
  return v == null ? <span className="vacio">Sin dato oficial</span> : <>{colones.format(v)}</>
}

/**
 * Remuneracion y combustible, mes a mes, tal como los publica la Asamblea en
 * su portal de datos abiertos. Nada se suma ni se promedia aqui.
 */
function GastoMensual({ slug, datos }: { slug: string; datos: Asamblea }) {
  const g = datos.gasto
  if (!g) return null
  const propio = g.por_diputacion[slug]
  const mesesSal = Object.keys(propio?.salarios ?? {}).sort().reverse()
  const mesesComb = Object.keys(propio?.combustible ?? {}).sort().reverse()
  const ultimoSal = mesesSal[0]
  const ultimoComb = mesesComb[0]

  return (
    <div className="seccion">
      <h3>Remuneración y combustible</h3>
      {!ultimoSal && !ultimoComb && <p className="vacio">Sin dato oficial</p>}

      {ultimoSal && (
        <>
          <div className="gasto-titulo">Remuneración de {nombreMes(ultimoSal)}</div>
          <div className="gasto-tabla">
            <span>Dieta</span>
            <span><Monto v={propio.salarios[ultimoSal].dieta} /></span>
            <span>Gastos de representación</span>
            <span><Monto v={propio.salarios[ultimoSal].representacion} /></span>
            <b>Remuneración bruta</b>
            <b><Monto v={propio.salarios[ultimoSal].bruta} /></b>
          </div>
          {mesesSal.length > 1 && (
            <p className="fuente-chica">
              Meses anteriores (bruta):{' '}
              {mesesSal.slice(1).map((m, i) => (
                <span key={m}>
                  {i > 0 && ' · '}
                  {nombreMes(m)} <Monto v={propio.salarios[m].bruta} />
                </span>
              ))}
            </p>
          )}
        </>
      )}

      {ultimoComb && (
        <>
          <div className="gasto-titulo">Combustible (ayuda técnica)</div>
          <div className="gasto-tabla">
            {mesesComb.map((m) => (
              <Fragment key={m}>
                <span>{nombreMes(m)}</span>
                <span>
                  {propio.combustible[m].renuncio ? (
                    <span className="vacio">Renunció a la ayuda técnica</span>
                  ) : (
                    <Monto v={propio.combustible[m].monto} />
                  )}
                </span>
              </Fragment>
            ))}
          </div>
        </>
      )}

      <p className="fuente-chica">
        Montos en colones, tal como los publica la Asamblea en su portal de{' '}
        <a href={g._fuente} target="_blank" rel="noopener noreferrer">
          datos abiertos
        </a>
        {ultimoSal && (
          <>
            {' '}(
            <a href={g.archivos.salarios[ultimoSal]} target="_blank" rel="noopener noreferrer">
              archivo de remuneraciones
            </a>
            {ultimoComb && (
              <>
                {', '}
                <a href={g.archivos.combustible[ultimoComb]} target="_blank" rel="noopener noreferrer">
                  de combustible
                </a>
              </>
            )}
            )
          </>
        )}
        . {g.notas.salarios.map((n) => n.replace(/^Nota:\s*/i, '')).join(' ')}
      </p>
    </div>
  )
}

/** Una pestana sin datos no desaparece: dice que no hay dato oficial. */
function SinDato({ titulo }: { titulo: string }) {
  return (
    <div className="seccion">
      <h3>{titulo}</h3>
      <p className="vacio">Sin dato oficial</p>
    </div>
  )
}
