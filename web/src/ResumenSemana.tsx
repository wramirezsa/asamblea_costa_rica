import { useMemo } from 'react'
import { rutaAUrl } from './rutas'
import type { DatosVotaciones, Diputado } from './tipos'
import { fechaCorta } from './votos'

interface Props {
  datos: DatosVotaciones
  diputados: Diputado[]
  onVer: (indice: number) => void
}

/** Fracciones con menos votos emitidos no tienen una mayoría que comparar. */
const MINIMO_BANCADA = 3

/**
 * La última semana con actas, en pocas líneas: qué se votó, quién no figura
 * entre los presentes y quién votó distinto a su bancada.
 *
 * La semana se cuenta hacia atrás desde la última sesión con acta, no desde
 * hoy: las actas tardan días en publicarse y una semana vacía no informa.
 */
export default function ResumenSemana({ datos, diputados, onVer }: Props) {
  const r = useMemo(() => {
    const porSlug = new Map(diputados.map((d) => [d.slug, d]))
    const ultima = datos.sesiones.reduce((m, s) => (s.fecha > m ? s.fecha : m), '')
    if (!ultima) return null
    const desde = new Date(`${ultima}T12:00:00`)
    desde.setDate(desde.getDate() - 6)
    const inicio = desde.toISOString().slice(0, 10)
    const sesiones = datos.sesiones
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.fecha >= inicio && s.fecha <= ultima)
    const enSemana = new Set(sesiones.map(({ i }) => i))
    const votaciones = datos.votaciones
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => enSemana.has(v.s))

    // No figura entre los presentes: conteo directo de la lista del acta.
    const conLista = sesiones.filter(({ s }) => s.presentes.length === datos.orden.length)
    const ausencias = datos.orden
      .map((slug, k) => ({
        slug,
        veces: conLista.filter(({ s }) => s.presentes[k] !== '1').length,
      }))
      .filter((a) => a.veces > 0)
      .sort((a, b) => b.veces - a.veces)

    // Distinto a su bancada: calculo propio, declarado en pantalla.
    const distinto = new Map<string, { veces: number; ejemplo: number }>()
    for (const { v, i } of votaciones) {
      const porFraccion = new Map<string, { F: string[]; C: string[] }>()
      datos.orden.forEach((slug, k) => {
        const voto = v.v[k]
        const partido = porSlug.get(slug)?.partido_codigo
        if (!partido || (voto !== 'F' && voto !== 'C')) return
        const g = porFraccion.get(partido) ?? { F: [], C: [] }
        g[voto].push(slug)
        porFraccion.set(partido, g)
      })
      for (const g of porFraccion.values()) {
        if (g.F.length + g.C.length < MINIMO_BANCADA || g.F.length === g.C.length) continue
        const minoria = g.F.length > g.C.length ? g.C : g.F
        for (const slug of minoria) {
          const prev = distinto.get(slug)
          distinto.set(slug, { veces: (prev?.veces ?? 0) + 1, ejemplo: prev?.ejemplo ?? i })
        }
      }
    }
    return {
      inicio,
      ultima,
      sesiones: sesiones.length,
      conLista: conLista.length,
      votaciones: votaciones.length,
      aprobadas: votaciones.filter(({ v }) => v.r === 'aprobada').length,
      rechazadas: votaciones.filter(({ v }) => v.r === 'rechazada').length,
      ausencias,
      distinto: [...distinto.entries()]
        .map(([slug, d]) => ({ slug, ...d }))
        .sort((a, b) => b.veces - a.veces),
      nombre: (slug: string) => porSlug.get(slug)?.nombre ?? slug,
      partido: (slug: string) => porSlug.get(slug)?.partido_codigo ?? '',
    }
  }, [datos, diputados])

  if (!r || r.sesiones === 0) return null

  const sinVerificar = r.votaciones - r.aprobadas - r.rechazadas
  const enlace = `${window.location.origin}${rutaAUrl({ tipo: 'seccion', seccion: 'votaciones' })}`
  const texto = [
    `Esta semana en el Plenario (${fechaCorta(r.inicio)} al ${fechaCorta(r.ultima)}), según las actas oficiales:`,
    `${r.sesiones} ${r.sesiones === 1 ? 'sesión' : 'sesiones'} y ${r.votaciones} votaciones (${r.aprobadas} aprobadas, ${r.rechazadas} rechazadas).`,
    r.ausencias.length
      ? `No figuran entre los presentes: ${r.ausencias.slice(0, 5).map((a) => `${r.nombre(a.slug)} (${a.veces})`).join(', ')}${r.ausencias.length > 5 ? '…' : ''}.`
      : 'Todas las diputaciones figuran entre los presentes.',
    enlace,
  ].join('\n')

  return (
    <div className="semana">
      <div className="semana-cabecera">
        <div>
          <h3>La última semana en el Plenario</h3>
          <p>
            Del {fechaCorta(r.inicio)} al {fechaCorta(r.ultima)}: {r.sesiones}{' '}
            {r.sesiones === 1 ? 'sesión' : 'sesiones'} con acta y {r.votaciones} votaciones (
            {r.aprobadas} aprobadas, {r.rechazadas} rechazadas
            {sinVerificar > 0 ? `, ${sinVerificar} sin resultado verificado` : ''}).
          </p>
        </div>
        <a
          className="semana-compartir"
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Compartir por WhatsApp
        </a>
      </div>

      <div className="semana-columnas">
        <div>
          <h4>No figuran entre los presentes</h4>
          {r.ausencias.length === 0 ? (
            <p className="vacio">Todas las diputaciones figuran en las {r.conLista} listas.</p>
          ) : (
            <ul>
              {r.ausencias.map((a) => (
                <li key={a.slug}>
                  <span>
                    {r.nombre(a.slug)} <small>{r.partido(a.slug)}</small>
                  </span>
                  <strong>
                    {a.veces} de {r.conLista}
                  </strong>
                </li>
              ))}
            </ul>
          )}
          <p className="semana-nota">
            Conteo directo de la lista de presentes de cada acta. El acta no dice si la ausencia
            tuvo permiso o justificación.
          </p>
        </div>
        <div>
          <h4>Votaron distinto a su bancada</h4>
          {r.distinto.length === 0 ? (
            <p className="vacio">Nadie votó distinto a la mayoría de su bancada.</p>
          ) : (
            <ul>
              {r.distinto.map((d) => (
                <li key={d.slug}>
                  <span>
                    {r.nombre(d.slug)} <small>{r.partido(d.slug)}</small>
                  </span>
                  <button onClick={() => onVer(d.ejemplo)} title="Ver una de esas votaciones en el mapa">
                    {d.veces} {d.veces === 1 ? 'vez' : 'veces'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="semana-nota">
            Cálculo propio: en cada votación se compara el voto (a favor o en contra) con el de la
            mayoría de su fracción. Solo fracciones con {MINIMO_BANCADA} o más votos emitidos; un
            empate no cuenta.
          </p>
        </div>
      </div>
    </div>
  )
}
