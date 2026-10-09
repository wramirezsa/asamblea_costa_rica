import type { DatosVotaciones } from './tipos'
import { URL_SIL, VOTO, fechaLarga, nombreSesion } from './votos'

interface Props {
  datos: DatosVotaciones
  indice: number
  onCambiar: (indice: number) => void
  onCerrar: () => void
}

/**
 * Cabecera de la votacion que se esta viendo en el mapa. Todo lo que muestra
 * sale del acta: nombre de la propuesta, totales y, solo si esta verificado,
 * el resultado.
 */
export default function BarraVotacion({ datos, indice, onCambiar, onCerrar }: Props) {
  const v = datos.votaciones[indice]
  const s = datos.sesiones[v.s]
  const [favor, contra, noVoto] = v.d
  const presentes = [...s.presentes].filter((c) => c === '1').length

  // Votaciones de la misma sesion, para recorrerlas sin volver a la lista.
  const anterior = indice > 0 && datos.votaciones[indice - 1].s === v.s ? indice - 1 : null
  const siguiente =
    indice < datos.votaciones.length - 1 && datos.votaciones[indice + 1].s === v.s
      ? indice + 1
      : null
  const total = datos.votaciones.filter((x) => x.s === v.s).length

  return (
    <section className="barra-votacion" aria-label="Votación que se ve en el mapa">
      <div className="bv-cabecera">
        <div style={{ minWidth: 0 }}>
          <div className="bv-meta">
            {nombreSesion(s)} · {fechaLarga(s.fecha)} · votación {v.n} de {total}
          </div>
          <h2 className="bv-titulo">{v.p ?? 'El acta no indica el nombre de la propuesta'}</h2>
        </div>
        <div className="bv-acciones">
          <button
            onClick={() => anterior !== null && onCambiar(anterior)}
            disabled={anterior === null}
            aria-label="Votación anterior de esta sesión"
          >
            ‹
          </button>
          <button
            onClick={() => siguiente !== null && onCambiar(siguiente)}
            disabled={siguiente === null}
            aria-label="Votación siguiente de esta sesión"
          >
            ›
          </button>
          <button onClick={onCerrar} aria-label="Dejar de ver esta votación">
            ✕
          </button>
        </div>
      </div>

      <div className="bv-totales">
        {(['F', 'C', 'N'] as const).map((c, i) => (
          <span key={c} className="bv-total">
            <span className="bv-simbolo" style={{ background: VOTO[c].color }}>
              {VOTO[c].simbolo}
            </span>
            {VOTO[c].etiqueta}
            <b>{[favor, contra, noVoto][i] ?? '—'}</b>
          </span>
        ))}
        <span className="bv-total bv-gris">
          Presentes en la sesión <b>{presentes}</b>
        </span>
        <span
          className={`bv-resultado ${v.r ?? 'sin-dato'}`}
          title={
            v.r
              ? 'Resultado que anunció la Presidencia, verificado contra la lista nominal del acta.'
              : 'Lo que anunció la Presidencia no coincide con la lista nominal del acta, así que no se publica un resultado.'
          }
        >
          {v.r === 'aprobada' ? 'Aprobada' : v.r === 'rechazada' ? 'Rechazada' : 'Resultado sin verificar'}
        </span>
      </div>

      <p className="bv-fuente">
        Fuente: acta oficial de la {nombreSesion(s).toLowerCase()}, Asamblea Legislativa,
        consultable en el{' '}
        <a href={URL_SIL} target="_blank" rel="noopener noreferrer">
          SIL
        </a>
        . Las curules atenuadas no figuran en la lista de esta votación.
      </p>
    </section>
  )
}
