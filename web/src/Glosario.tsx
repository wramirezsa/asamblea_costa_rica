import type { Glosario, TerminoGlosario } from './tipos'

/**
 * Qué significa cada tipo de votación, según el Reglamento de la Asamblea.
 *
 * Los títulos de las actas son jerga («REVISION MOCION FONDO EXP 23948»). La
 * explicación es un resumen propio; cada término lleva su artículo y una cita
 * literal verificada contra el texto vigente (data/curated/glosario.json).
 */

const cache = new Map<string, RegExp>()

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

export function terminosDe(titulo: string | null, glosario: Glosario | null): TerminoGlosario[] {
  if (!titulo || !glosario) return []
  const t = sinTildes(titulo)
  return glosario.terminos.filter((g) => {
    let re = cache.get(g.patron)
    if (!re) {
      re = new RegExp(`\\b(?:${g.patron})\\b`)
      cache.set(g.patron, re)
    }
    return re.test(t)
  })
}

/** Etiquetas cortas para una fila de la lista; la explicación va en el título. */
export function ChipsTerminos({ titulo, glosario }: { titulo: string | null; glosario: Glosario | null }) {
  const ts = terminosDe(titulo, glosario)
  if (!ts.length) return null
  return (
    <span className="gl-chips">
      {ts.map((t) => (
        <span key={t.clave} className="gl-chip" title={`${t.explicacion} (Reglamento, art. ${t.articulo})`}>
          {t.nombre}
        </span>
      ))}
    </span>
  )
}

/** Explicación en línea, para la votación que se está viendo. */
export function ExplicacionTerminos({ titulo, glosario }: { titulo: string | null; glosario: Glosario | null }) {
  const ts = terminosDe(titulo, glosario)
  if (!ts.length) return null
  return (
    <div className="gl-explicacion">
      {ts.map((t) => (
        <p key={t.clave}>
          <strong>{t.nombre}:</strong> {t.explicacion}{' '}
          <span className="gl-art">Reglamento, art. {t.articulo}.</span>
        </p>
      ))}
    </div>
  )
}

/** El glosario completo, plegado, con cita literal y enlace a la norma. */
export function GlosarioCompleto({ glosario }: { glosario: Glosario | null }) {
  if (!glosario) return null
  return (
    <details className="gl-completo">
      <summary>¿Qué significa cada tipo de votación?</summary>
      <dl>
        {glosario.terminos.map((t) => (
          <div key={t.clave}>
            <dt>
              {t.nombre} <span className="gl-art">art. {t.articulo}</span>
            </dt>
            <dd>
              {t.explicacion}
              <q>{t.cita}</q>
            </dd>
          </div>
        ))}
      </dl>
      <p className="gl-fuente">
        Resúmenes propios del{' '}
        <a href={glosario._fuente} target="_blank" rel="noopener noreferrer">
          Reglamento de la Asamblea Legislativa
        </a>{' '}
        (texto vigente en SINALEVI, consultado el {glosario._consultado}); las citas son literales.
        Si una votación no tiene explicación es porque su título no corresponde con claridad a un
        solo artículo, y preferimos no adivinar.
      </p>
    </details>
  )
}
