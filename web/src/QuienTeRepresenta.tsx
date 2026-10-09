import type { Diputado } from './tipos'

/**
 * Puerta de entrada del sitio.
 *
 * Casi nadie llega buscando "datos legislativos", pero mucha gente no sabe
 * quiénes son sus diputaciones, y en Costa Rica se eligen POR PROVINCIA. Esa
 * es la pregunta que la persona sí tiene, y la respuesta ya está completa en
 * el padrón. Antes vivía escondida en un selector entre otros controles.
 */

interface Props {
  diputados: Diputado[]
  provinciaActiva: string
  onElegir: (provincia: string) => void
}

/** Orden fijo, de mayor a menor representación. Es el orden en que la gente
 *  reconoce las provincias y evita que salte al cambiar los datos. */
const ORDEN = [
  'San José',
  'Alajuela',
  'Cartago',
  'Heredia',
  'Guanacaste',
  'Puntarenas',
  'Limón',
]

export default function QuienTeRepresenta({
  diputados,
  provinciaActiva,
  onElegir,
}: Props) {
  const cuenta = new Map<string, number>()
  for (const d of diputados) {
    if (d.provincia) cuenta.set(d.provincia, (cuenta.get(d.provincia) ?? 0) + 1)
  }
  const provincias = [
    ...ORDEN.filter((p) => cuenta.has(p)),
    ...[...cuenta.keys()].filter((p) => !ORDEN.includes(p)).sort(),
  ]

  const elegidos = provinciaActiva
    ? diputados.filter((d) => d.provincia === provinciaActiva)
    : []

  return (
    <section className="representa">
      <div className="representa-fila">
        <h2>¿Quién te representa?</h2>
        <p>
          Las diputaciones se eligen por provincia. Elegí la tuya y vas a ver
          quiénes te representan, dónde se sientan y qué han hecho.
        </p>
      </div>

      <div className="provincias">
        {provincias.map((p) => (
          <button
            key={p}
            className={`provincia${provinciaActiva === p ? ' activa' : ''}`}
            onClick={() => onElegir(provinciaActiva === p ? '' : p)}
            aria-pressed={provinciaActiva === p}
          >
            {p}
            <span className="provincia-n">{cuenta.get(p)}</span>
          </button>
        ))}
      </div>

      {provinciaActiva && elegidos.length > 0 && (
        <div className="representa-resultado">
          <p className="representa-titulo">
            <strong>{elegidos.length}</strong> diputaciones representan a{' '}
            <strong>{provinciaActiva}</strong>
          </p>
          <p className="representa-pista">
            Están resaltadas en el plenario, aquí abajo. Tocá a cualquiera para
            ver su ficha.
          </p>
        </div>
      )}
    </section>
  )
}
