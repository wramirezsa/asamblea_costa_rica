import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { select } from 'd3-selection'
import { recurso } from './rutas'
// Se importa por su efecto: agrega .transition() a Selection y sus tipos.
// Llega igual como dependencia de d3-zoom, pero sin este import TypeScript
// no lo sabe y `tsc -b` falla.
import 'd3-transition'
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import type { Asamblea, CodigoVoto, Curul, Diputado } from './tipos'
import { VOTO } from './votos'

// El area util del SVG. Las curules viven en x [-9.4, 9.4], y [-9.4, 0].
const VISTA = { x: -10.7, y: -10.7, ancho: 21.4, alto: 12.6 }
const RADIO_CURUL = 0.52

// Umbrales de detalle. Al acercarse, cada curul revela mas informacion:
// color -> anillo de bancada -> foto -> nombre. Es el efecto "Google Earth".
// Se revelan temprano a proposito: si la foto exige mucho zoom, se ven pocas
// caras a la vez y se pierde la lectura de conjunto del plenario.
const ZOOM_ANILLO = 1.25
const ZOOM_FOTO = 1.8
const ZOOM_NOMBRE = 3.4

interface Props {
  datos: Asamblea
  porSlug: Map<string, Diputado>
  colorDe: (partido: string | null) => string
  visibles: Set<string>
  seleccionado: string | null
  /** 'caras' muestra la fotografia oficial en cada curul; 'colores' deja solo
   *  el color de bancada, util para leer la composicion politica de un vistazo. */
  modo: 'caras' | 'colores'
  /** Si hay una votacion activa, el voto de cada diputacion; si no, null. */
  votoDe: ((slug: string) => CodigoVoto) | null
  onSeleccionar: (slug: string | null) => void
  onSobrevolar: (info: { dip: Diputado; x: number; y: number } | null) => void
}

export default function Hemiciclo({
  datos,
  porSlug,
  colorDe,
  visibles,
  seleccionado,
  modo,
  votoDe,
  onSeleccionar,
  onSobrevolar,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const comportamiento = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [t, setT] = useState<ZoomTransform>(zoomIdentity)
  const [arrastrando, setArrastrando] = useState(false)

  // Distingue un clic real de un arrastre: si el puntero se movio, no se
  // considera seleccion. Sin esto, mover el mapa abriria fichas por error.
  const inicioPuntero = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!svgRef.current) return
    const svg = select(svgRef.current)
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.85, 14])
      .on('start', () => setArrastrando(true))
      .on('zoom', (e) => setT(e.transform))
      .on('end', () => setArrastrando(false))

    comportamiento.current = z
    svg.call(z).on('dblclick.zoom', null)
    return () => {
      svg.on('.zoom', null)
    }
  }, [])

  const escalar = useCallback((factor: number) => {
    if (!svgRef.current || !comportamiento.current) return
    select(svgRef.current).transition().duration(260).call(comportamiento.current.scaleBy, factor)
  }, [])

  const reiniciar = useCallback(() => {
    if (!svgRef.current || !comportamiento.current) return
    select(svgRef.current)
      .transition()
      .duration(420)
      .call(comportamiento.current.transform, zoomIdentity)
  }, [])

  // Al elegir una diputacion desde la lista o el buscador, el mapa vuela
  // hasta su curul, como en un mapa geografico.
  const volarA = useCallback((c: Curul) => {
    if (!svgRef.current || !comportamiento.current) return
    // Para centrar un punto hay que llevarlo al centro del viewBox, no al
    // origen: aqui el origen (0,0) cae abajo al centro, junto al Directorio.
    // Se corre hacia la izquierda porque la ficha ocupa la derecha de la
    // pantalla; si no, la curul elegida queda escondida detras del panel.
    const cx = VISTA.x + VISTA.ancho * 0.32
    const cy = VISTA.y + VISTA.alto / 2
    const destino = zoomIdentity.translate(cx, cy).scale(3.2).translate(-c.x, -c.y)
    select(svgRef.current)
      .transition()
      .duration(620)
      .call(comportamiento.current.transform, destino)
  }, [])

  const curules = datos.hemiciclo.curules
  const curulPorSlug = useMemo(() => {
    const m = new Map<string, Curul>()
    for (const c of curules) m.set(c.slug, c)
    return m
  }, [curules])

  // Si la curul se eligio con un clic en el mapa, ya esta a la vista: volar
  // hasta ella solo desorienta y la deja detras de la ficha. El vuelo se
  // reserva para cuando la seleccion viene de fuera (buscador, teclado).
  const clicEnMapa = useRef(false)
  const anteriorSeleccion = useRef<string | null>(null)
  useEffect(() => {
    if (seleccionado && seleccionado !== anteriorSeleccion.current && !clicEnMapa.current) {
      const c = curulPorSlug.get(seleccionado)
      if (c) volarA(c)
    }
    clicEnMapa.current = false
    anteriorSeleccion.current = seleccionado
  }, [seleccionado, curulPorSlug, volarA])

  const k = t.k
  // En modo 'caras' la fotografia esta siempre presente: a 1x cada curul mide
  // unos 55 px, suficiente para reconocer a la persona. En modo 'colores' se
  // revela solo al acercarse, para que el conjunto se lea como mapa politico.
  const verFoto = modo === 'caras' || k >= ZOOM_FOTO
  const verAnillo = k >= ZOOM_ANILLO
  const verNombre = k >= ZOOM_NOMBRE
  // Los trazos se dibujan en coordenadas del mundo: al acercarse hay que
  // adelgazarlos para que no se vean gruesos.
  const trazo = 1 / k

  return (
    <div className="lienzo">
      <svg
        ref={svgRef}
        viewBox={`${VISTA.x} ${VISTA.y} ${VISTA.ancho} ${VISTA.alto}`}
        className={arrastrando ? 'arrastrando' : undefined}
        role="application"
        aria-label="Mapa interactivo del plenario legislativo"
      >
        <defs>
          {/* objectBoundingBox permite reusar un solo recorte circular
              para las 57 fotos, sin crear un clipPath por curul. */}
          <clipPath id="recorte-curul" clipPathUnits="objectBoundingBox">
            <circle cx="0.5" cy="0.5" r="0.5" />
          </clipPath>
          <radialGradient id="brillo-piso" cx="50%" cy="100%" r="75%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Decoracion fija: va FUERA del grupo con zoom. Dentro, al acercarse
            se agrandaba hasta cubrir la pantalla con un halo gigante. */}
        <ellipse cx="0" cy="0" rx="11" ry="6.2" fill="url(#brillo-piso)" pointerEvents="none" />

        <g transform={t.toString()}>
          {/* Mesa del Directorio: es la referencia para leer el mapa,
              porque la norma ubica a las bancadas respecto a ella. */}
          <g>
            <rect
              className="estrado"
              x="-2.5"
              y="0.55"
              width="5"
              height="1.05"
              rx="0.22"
              strokeWidth={0.04 * trazo * k}
            />
            <text className="estrado-texto" x="0" y="1.2">
              DIRECTORIO
            </text>
          </g>

          {curules.map((c) => {
            const dip = porSlug.get(c.slug)
            if (!dip) return null
            // Con una votacion activa, el color pasa a ser el del voto. Quien
            // no figura en esa votacion queda atenuado, como con los filtros.
            const voto = votoDe ? votoDe(c.slug) : null
            const color = voto ? VOTO[voto].color : colorDe(c.partido)
            const atenuado = !visibles.has(c.slug) || voto === '-'
            const activo = seleccionado === c.slug

            return (
              <g
                key={c.slug}
                className={[
                  'curul',
                  atenuado ? 'atenuado' : '',
                  activo ? 'activo' : '',
                ].filter(Boolean).join(' ')}
                onPointerDown={(e) => {
                  inicioPuntero.current = { x: e.clientX, y: e.clientY }
                }}
                onPointerUp={(e) => {
                  const p = inicioPuntero.current
                  inicioPuntero.current = null
                  if (!p) return
                  const movido = Math.hypot(e.clientX - p.x, e.clientY - p.y)
                  if (movido < 5) {
                    clicEnMapa.current = true
                    onSeleccionar(activo ? null : c.slug)
                  }
                }}
                onPointerEnter={(e) => onSobrevolar({ dip, x: e.clientX, y: e.clientY })}
                onPointerMove={(e) => onSobrevolar({ dip, x: e.clientX, y: e.clientY })}
                onPointerLeave={() => onSobrevolar(null)}
                role="button"
                tabIndex={-1}
                aria-label={`${dip.nombre}, ${dip.fraccion ?? 'sin fraccion'}, ${dip.provincia ?? ''}${
                  voto ? `, ${VOTO[voto].etiqueta}` : ''
                }`}
              >
                {/* Base de color: siempre visible, es la lectura a distancia. */}
                <circle
                  className="curul-forma"
                  cx={c.x}
                  cy={c.y}
                  r={RADIO_CURUL}
                  fill={color}
                  strokeWidth={(activo ? 0.1 : 0.035) * trazo * k}
                />

                {verFoto && dip.foto && (
                  <>
                    <image
                      className="curul-foto"
                      href={`${recurso('assets')}/${dip.foto}`}
                      x={c.x - RADIO_CURUL * 0.9}
                      y={c.y - RADIO_CURUL * 0.9}
                      width={RADIO_CURUL * 1.8}
                      height={RADIO_CURUL * 1.8}
                      clipPath="url(#recorte-curul)"
                      preserveAspectRatio="xMidYMin slice"
                      pointerEvents="none"
                    />
                    {/* Aro con el color de la bancada por encima de la foto,
                        para no perder la lectura partidaria al acercarse. */}
                    <circle
                      cx={c.x}
                      cy={c.y}
                      r={RADIO_CURUL * 0.93}
                      fill="none"
                      stroke={color}
                      strokeWidth={0.11}
                      pointerEvents="none"
                      opacity={atenuado ? 0.13 : 1}
                    />
                  </>
                )}

                {verAnillo && !verFoto && (
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r={RADIO_CURUL * 0.42}
                    fill="rgba(255,255,255,0.55)"
                    pointerEvents="none"
                  />
                )}

                {/* Distintivo del voto: el simbolo acompana al color, que
                    nunca va solo. */}
                {voto && voto !== '-' && (
                  <g pointerEvents="none">
                    <circle
                      cx={c.x + RADIO_CURUL * 0.68}
                      cy={c.y + RADIO_CURUL * 0.68}
                      r={RADIO_CURUL * 0.38}
                      fill={VOTO[voto].color}
                      stroke="#0b1120"
                      strokeWidth={0.05}
                    />
                    <text
                      x={c.x + RADIO_CURUL * 0.68}
                      y={c.y + RADIO_CURUL * 0.68}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={RADIO_CURUL * 0.5}
                      fontWeight={800}
                      fill="#0b1120"
                    >
                      {VOTO[voto].simbolo}
                    </text>
                  </g>
                )}

                {verNombre && (
                  <text
                    x={c.x}
                    y={c.y + RADIO_CURUL + 0.26}
                    textAnchor="middle"
                    fill="rgba(232,238,252,0.92)"
                    fontSize={0.19}
                    fontWeight={600}
                    pointerEvents="none"
                    opacity={atenuado ? 0.15 : 1}
                  >
                    {primerApellido(dip.nombre)}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      {/* Colapsado por defecto para no tapar curules; el texto completo
          aparece al pasar el puntero o al enfocarlo con el teclado. */}
      <div className="aviso-curules" tabIndex={0} role="note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <span className="aviso-corto">Ubicación por bancada</span>
        <span className="aviso-largo">
          Las curules se agrupan por bancada siguiendo el Reglamento del Ceremonial
          Protocolar (art.&nbsp;15). La Asamblea <strong>no publica</strong> el asiento
          asignado a cada diputación, así que la posición individual dentro de cada
          bancada es ilustrativa.
        </span>
      </div>

      <div className="pista">
        <span>Rueda para acercar · arrastrá para mover · clic en una curul</span>
        <span style={{ color: 'var(--texto-2)', fontVariantNumeric: 'tabular-nums' }}>
          {k.toFixed(1)}×
        </span>
      </div>

      <div className="zoom-cajon">
        <button onClick={() => escalar(1.5)} title="Acercar" aria-label="Acercar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button onClick={() => escalar(1 / 1.5)} title="Alejar" aria-label="Alejar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M5 12h14" />
          </svg>
        </button>
        <button onClick={reiniciar} title="Vista completa" aria-label="Vista completa">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 9V5a2 2 0 0 1 2-2h4M21 9V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4M21 15v4a2 2 0 0 1-2 2h-4" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function primerApellido(nombre: string): string {
  // Los nombres vienen como "Nombre(s) Apellido1 Apellido2"; a alto zoom
  // mostramos solo el primer apellido para que quepa junto a la curul.
  const partes = nombre.trim().split(/\s+/)
  return partes.length >= 3 ? partes[partes.length - 2] : partes[partes.length - 1]
}
