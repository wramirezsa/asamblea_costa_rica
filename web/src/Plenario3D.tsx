import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useLoader, type ThreeEvent } from '@react-three/fiber'
import { Billboard, OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import type { Asamblea, CodigoVoto, CurulSala, CurulVacia, Diputado, PuestoMesa } from './tipos'
import { VOTO } from './votos'
import Sala, { CUERO, MADERA, SALA } from './Sala3D'
import { recurso } from './rutas'

/**
 * Reconstruccion 3D del salon de sesiones.
 *
 * El plenario de Costa Rica es una sala rectangular con dos bancadas
 * escalonadas enfrentadas y la mesa del Directorio al fondo. NO es un
 * hemiciclo. La geometria viene de `datos.sala`, generada por el ETL, y
 * esta declarada como reconstruccion: ver `sala.nota`.
 */


interface Props {
  datos: Asamblea
  porSlug: Map<string, Diputado>
  colorDe: (partido: string | null) => string
  visibles: Set<string>
  seleccionado: string | null
  /** Persona a la que enfocar sin abrir su ficha (cuando el buscador deja una sola). */
  enfocado?: string | null
  /** Si hay una votacion activa, el voto de cada diputacion; si no, null. */
  votoDe?: ((slug: string) => CodigoVoto) | null
  onSeleccionar: (slug: string | null) => void
  onSobrevolar: (info: { dip: Diputado; x: number; y: number } | null) => void
}

const MARGEN_MURO = 1.3 // holgura para no pegar la camara al muro
const TOPE_DISTANCIA = 22

/**
 * Hasta donde puede llegar el punto de mira. Es una caja, no una esfera:
 * la sala es larga y con una esfera las curules del fondo quedan fuera de
 * alcance. Se deja mas angosta que la caja de la camara para que siempre
 * quede aire entre el objetivo y el muro que tiene detras.
 */
const MIRA = { x: 8.5, yMin: 0.4, yMax: 4.5, zMin: -9, zMax: 13 }

/** Encuadres de referencia del salon. */
const VISTAS: Array<{
  nombre: string
  titulo: string
  camara: [number, number, number]
  mira: [number, number, number]
}> = [
  {
    nombre: 'Sala',
    titulo: 'Vista general del plenario',
    camara: [0, 10, 15.5],
    mira: [0, 1, -1],
  },
  {
    nombre: 'Directorio',
    titulo: 'Mirando hacia la mesa del Directorio y el escudo',
    camara: [0, 4.5, 3],
    mira: [0, 3.5, -9],
  },
  {
    nombre: 'Entrada',
    titulo: 'Mirando hacia el muro de la entrada, como lo ve la Presidencia',
    camara: [0, 5, -4],
    mira: [0, 4.5, 13],
  },
]

export default function Plenario3D(props: Props) {
  const controles = useRef<OrbitControlsImpl>(null)

  /**
   * Encierra a quien mira dentro del salon.
   *
   * No se recorta la posicion de la camara: OrbitControls la recalcula a
   * partir de ella misma en cada cuadro, asi que recortarla genera una
   * realimentacion que termina dejando la pantalla vacia.
   *
   * En vez de eso se mide, en la direccion en que esta mirando, cuanto puede
   * alejarse antes de tocar un muro, y se le pasa a `maxDistance`. El limite
   * lo aplica OrbitControls, que es quien manda sobre la camara.
   */
  const ajustarLimite = useCallback(() => {
    const c = controles.current
    if (!c) return

    // 1) El punto de mira se mantiene dentro del piso util. Recortarlo SI es
    //    seguro: OrbitControls guarda el objetivo tal cual, no lo deriva de
    //    la camara, asi que no hay realimentacion (a diferencia de recortar
    //    la posicion de la camara, ver ADR-011).
    const t = c.target
    t.x = Math.min(Math.max(t.x, -MIRA.x), MIRA.x)
    t.y = Math.min(Math.max(t.y, MIRA.yMin), MIRA.yMax)
    t.z = Math.min(Math.max(t.z, MIRA.zMin), MIRA.zMax)

    // 2) Y la camara no puede pasar de los muros.
    const camara = c.object
    const d = camara.position.clone().sub(c.target)
    const largo = d.length()
    if (largo < 1e-4) return
    d.divideScalar(largo)

    // Cuanto se puede avanzar por cada eje antes de salir de la caja.
    const alcance = (origen: number, paso: number, min: number, max: number) => {
      if (Math.abs(paso) < 1e-6) return Infinity
      const t = paso > 0 ? (max - origen) / paso : (min - origen) / paso
      return t > 0 ? t : Infinity
    }

    const m = MARGEN_MURO
    const mx = SALA.ancho / 2 - m
    const tope = Math.min(
      alcance(c.target.x, d.x, -mx, mx),
      alcance(c.target.y, d.y, 1.2, SALA.alto - m),
      alcance(c.target.z, d.z, SALA.zFondo + m, SALA.zEntrada - m),
      TOPE_DISTANCIA
    )
    if (!Number.isFinite(tope)) return
    c.maxDistance = Math.max(c.minDistance + 0.5, tope)
  }, [])

  /**
   * Lleva la camara a un par (posicion, objetivo) con una animacion suave.
   * Se mueven LOS DOS juntos y se llama `update()`: ese es el par coherente
   * que OrbitControls espera. Mover solo la posicion rompe la vista (ADR-011).
   */
  const volar = useCallback(
    (haciaCam: THREE.Vector3, haciaMira: THREE.Vector3, duracion = 620) => {
      const c = controles.current
      if (!c) return () => {}
      const desdeMira = c.target.clone()
      const desdeCam = c.object.position.clone()
      let cuadro = 0
      let inicio: number | null = null
      const paso = (t: number) => {
        if (inicio === null) inicio = t
        const k = Math.min(1, (t - inicio) / duracion)
        const suave = k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2
        c.target.lerpVectors(desdeMira, haciaMira, suave)
        c.object.position.lerpVectors(desdeCam, haciaCam, suave)
        c.update()
        if (k < 1) cuadro = requestAnimationFrame(paso)
      }
      cuadro = requestAnimationFrame(paso)
      return () => cancelAnimationFrame(cuadro)
    },
    []
  )

  // Donde esta sentada cada persona, para poder volar hasta ella.
  const sitioPorSlug = useMemo(() => {
    const m = new Map<string, { x: number; y: number; z: number; lado: string }>()
    props.datos.sala.curules.forEach((c) =>
      m.set(c.slug, { x: c.x, y: c.y, z: c.z, lado: c.lado })
    )
    props.datos.sala.mesa.forEach((p) =>
      m.set(p.slug, { x: p.x, y: p.y, z: p.z, lado: 'mesa' })
    )
    return m
  }, [props.datos])

  /**
   * Vuela hasta la curul de quien se seleccione.
   *
   * La sala es larga y llegar al fondo desplazando a mano es incomodo,
   * sobre todo mientras se cura el mapa curul por curul. Buscando un nombre,
   * la camara va sola.
   *
   * Se animan JUNTOS el punto de mira y la posicion de la camara, y se llama
   * `update()`: ese es el par coherente que OrbitControls espera. Mover solo
   * la posicion es lo que rompia la vista (ADR-011).
   */
  const objetivo = props.seleccionado ?? props.enfocado ?? null
  useEffect(() => {
    const c = controles.current
    if (!c || !objetivo) return
    const sitio = sitioPorSlug.get(objetivo)
    if (!sitio) return

    const haciaMira = new THREE.Vector3(sitio.x, sitio.y + 1.5, sitio.z)
    // Se mira desde el pasillo, un poco en alto, para no quedar dentro del
    // escritorio ni de la persona de al lado.
    const desvio = new THREE.Vector3(
      sitio.lado === 'izquierda' ? 1 : sitio.lado === 'derecha' ? -1 : 0,
      0.6,
      sitio.lado === 'mesa' ? 1 : 0.45
    ).normalize()
    const haciaCam = haciaMira.clone().add(desvio.multiplyScalar(6.5))

    return volar(haciaCam, haciaMira)
  }, [objetivo, sitioPorSlug, volar])

  // Antes se usaba `maxTargetRadius`, que limita el punto de mira a una
  // ESFERA alrededor del centro. En una sala larga eso deja fuera de alcance
  // las curules del fondo y las de la entrada. Se reemplaza por una caja que
  // cubre todo el piso util, aplicada mas abajo en `ajustarLimite`.
  useEffect(() => {
    const c = controles.current
    if (c && 'maxTargetRadius' in c) {
      ;(c as unknown as { maxTargetRadius: number }).maxTargetRadius = Infinity
    }
  }, [])

  return (
    <div className="lienzo lienzo-3d">
      <Canvas
        shadows={false}
        dpr={[1, 2]}
        camera={{ position: [0, 10, 20.5], fov: 46 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#0b1120']} />

        <ambientLight intensity={1.15} />
        <hemisphereLight args={['#fff4e2', '#3a2c22', 0.7]} />
        <directionalLight position={[8, 18, 10]} intensity={1.1} />
        <directionalLight position={[-10, 12, -6]} intensity={0.45} color="#ffd9a8" />

        {/* La sala se dibuja de una vez. Solo los retratos esperan a que
            bajen las 57 fotografias, para que no quede la pantalla vacia. */}
        <Sala />
        {props.datos.escudo?.bronce && (
          <Suspense fallback={null}>
            <Escudo
              ruta={`${recurso('assets')}/${props.datos.escudo.bronce}`}
              z={SALA.zFondo + 0.55}
            />
          </Suspense>
        )}
        <Suspense fallback={null}>
          <Curules {...props} />
        </Suspense>
        <OrbitControls
          makeDefault
          target={[0, 1, -1]}
          minDistance={2.5}
          // Valor inicial; `ajustarLimite` lo recalcula segun cuanto espacio
          // hay hasta el muro en la direccion en que se esta mirando.
          maxDistance={TOPE_DISTANCIA}
          ref={controles}
          onChange={ajustarLimite}
          // No se deja bajar bajo el piso ni mirar desde arriba en cenital.
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.15}
          enablePan
          screenSpacePanning={false}
          panSpeed={0.9}
          rotateSpeed={0.55}
          zoomSpeed={0.8}
        />
      </Canvas>

      <div className="aviso-curules" tabIndex={0} role="note">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
        <span className="aviso-corto">Cómo se armó este salón</span>
        <span className="aviso-largo">
          La Asamblea <strong>no publica</strong> la curul de cada diputación. Las{' '}
          <strong>{props.datos.sala.curules.length}</strong> ubicaciones se levantaron
          una por una observando transmisiones del plenario, y las{' '}
          <strong>{props.datos.sala.vacias.length}</strong> curules sin ocupante están
          declaradas como tales. La forma de la sala se reconstruyó a partir de
          fotografías, no de un plano oficial.
        </span>
      </div>

      {/* Vistas fijas: sin esto es facil desorientarse girando y no encontrar
          el camino de vuelta. */}
      <div className="zoom-cajon vistas-fijas">
        {VISTAS.map((v) => (
          <button
            key={v.nombre}
            onClick={() =>
              volar(
                new THREE.Vector3(...v.camara),
                new THREE.Vector3(...v.mira),
                700
              )
            }
            title={v.titulo}
          >
            {v.nombre}
          </button>
        ))}
      </div>

      <div className="pista">
        <span>Arrastrá para girar · rueda para acercar · clic derecho (o dos dedos) para recorrer la sala</span>
      </div>
    </div>
  )
}

function Curules({
  datos,
  porSlug,
  colorDe,
  visibles,
  seleccionado,
  votoDe,
  onSeleccionar,
  onSobrevolar,
}: Props) {
  const { curules, mesa, vacias } = datos.sala
  // Con una votacion activa, el color es el del voto y quien no figura en
  // ella queda atenuado, igual que en el mapa de composicion.
  const votoEn = (slug: string): CodigoVoto | null => (votoDe ? votoDe(slug) : null)
  const colorEn = (slug: string, partido: string | null) => {
    const v = votoEn(slug)
    return v ? VOTO[v].color : colorDe(partido)
  }

  // Una sola carga para las 57 fotografias: primero las bancadas, despues
  // la mesa del Directorio, para que los indices calcen con cada lista.
  const rutas = useMemo(
    () =>
      [...curules, ...mesa].map((c) => `${recurso('assets')}/${porSlug.get(c.slug)?.foto ?? ''}`),
    [curules, mesa, porSlug]
  )
  const texturas = useLoader(THREE.TextureLoader, rutas) as THREE.Texture[]

  useMemo(() => {
    for (const t of texturas) {
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 4
    }
  }, [texturas])

  return (
    <>
      {curules.map((c, i) => {
        const dip = porSlug.get(c.slug)
        if (!dip) return null
        return (
          <Curul
            key={c.slug}
            curul={c}
            dip={dip}
            textura={texturas[i]}
            color={colorEn(c.slug, c.partido)}
            voto={votoEn(c.slug)}
            atenuado={!visibles.has(c.slug) || votoEn(c.slug) === '-'}
            activo={seleccionado === c.slug}
            onSeleccionar={onSeleccionar}
            onSobrevolar={onSobrevolar}
          />
        )
      })}

      {/* Curules sin ocupante: el mueble esta en la sala igual que los
          demas, solo que nadie lo usa. */}
      {vacias.map((v) => (
        <CurulVaciaMueble key={v.id} curul={v} />
      ))}

      {mesa.map((p, i) => {
        const dip = porSlug.get(p.slug)
        if (!dip) return null
        return (
          <PuestoDirectorio
            key={p.slug}
            puesto={p}
            dip={dip}
            textura={texturas[curules.length + i]}
            color={colorEn(p.slug, p.partido)}
            voto={votoEn(p.slug)}
            atenuado={!visibles.has(p.slug) || votoEn(p.slug) === '-'}
            activo={seleccionado === p.slug}
            onSeleccionar={onSeleccionar}
            onSobrevolar={onSobrevolar}
          />
        )
      })}
    </>
  )
}

/**
 * Curul existente pero desocupada: se dibuja el mismo mobiliario que en las
 * demas, sin retrato ni aro de bancada. Que el escritorio este ahi es parte
 * de como se ve el salon; omitirlo dejaria un hueco que no existe.
 */
function CurulVaciaMueble({ curul }: { curul: CurulVacia }) {
  const haciaPasillo = curul.lado === 'izquierda' ? 1 : -1
  return (
    <group position={[curul.x, curul.y, curul.z]}>
      <mesh position={[0, -0.31, 0]}>
        <boxGeometry args={[2.6, 0.62, 1.8]} />
        <meshStandardMaterial color="#d8cdb6" roughness={0.95} />
      </mesh>
      <mesh position={[0.62 * haciaPasillo, 0.42, 0]}>
        <boxGeometry args={[0.75, 0.85, 1.55]} />
        <meshStandardMaterial color={MADERA} roughness={0.65} />
      </mesh>
      <mesh position={[0.62 * haciaPasillo, 0.86, 0]}>
        <boxGeometry args={[0.8, 0.06, 1.6]} />
        <meshStandardMaterial color="#6b4e34" roughness={0.5} />
      </mesh>
      <mesh position={[0.5 * haciaPasillo, 1.05, 0.18]} rotation={[0, 0, 0.22 * haciaPasillo]}>
        <boxGeometry args={[0.05, 0.34, 0.46]} />
        <meshStandardMaterial color="#12202e" roughness={0.35} />
      </mesh>
      <mesh position={[-0.4 * haciaPasillo, 0.3, 0]}>
        <boxGeometry args={[0.66, 0.14, 0.64]} />
        <meshStandardMaterial color={CUERO} roughness={0.6} />
      </mesh>
      <mesh position={[-0.68 * haciaPasillo, 0.86, 0]} rotation={[0, 0, 0.07 * haciaPasillo]}>
        <boxGeometry args={[0.1, 1.06, 0.6]} />
        <meshStandardMaterial color={CUERO} roughness={0.6} />
      </mesh>
      <mesh position={[-0.4 * haciaPasillo, 0.12, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.24, 8]} />
        <meshStandardMaterial color="#2b2b2e" roughness={0.6} />
      </mesh>
    </group>
  )
}

/**
 * Asiento en la mesa del Directorio. A diferencia de una curul, mira hacia el
 * resto del plenario y no tiene escritorio propio: comparte la mesa larga que
 * dibuja `Sala`.
 */
function PuestoDirectorio({
  puesto,
  dip,
  textura,
  color,
  voto,
  atenuado,
  activo,
  onSeleccionar,
  onSobrevolar,
}: {
  puesto: PuestoMesa
  dip: Diputado
  textura: THREE.Texture | undefined
  color: string
  voto: CodigoVoto | null
  atenuado: boolean
  activo: boolean
  onSeleccionar: (slug: string | null) => void
  onSobrevolar: (info: { dip: Diputado; x: number; y: number } | null) => void
}) {
  const [encima, setEncima] = useState(false)
  const opacidad = atenuado ? 0.16 : 1
  // La presidencia va al centro: se le da un poco mas de presencia.
  const preside = puesto.cargo === 'presidencia'
  const radio = preside ? 0.62 : 0.54

  const manejadores = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      setEncima(true)
      onSobrevolar({ dip, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onSobrevolar({ dip, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
    },
    onPointerOut: () => {
      setEncima(false)
      onSobrevolar(null)
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      onSeleccionar(activo ? null : dip.slug)
    },
  }

  return (
    <group position={[puesto.x, puesto.y, puesto.z]}>
      {/* Silla del Directorio, de espaldas al muro */}
      <mesh position={[0, 0.3, -0.1]} {...manejadores}>
        <boxGeometry args={[0.66, 0.14, 0.62]} />
        <meshStandardMaterial color={CUERO} roughness={0.6} transparent opacity={opacidad} />
      </mesh>
      <mesh position={[0, 0.82, -0.38]}>
        <boxGeometry args={[0.64, preside ? 1.0 : 0.82, 0.1]} />
        <meshStandardMaterial color={CUERO} roughness={0.6} transparent opacity={opacidad} />
      </mesh>

      <Billboard position={[0, 1.62, 0.1]}>
        <mesh {...manejadores}>
          <circleGeometry args={[radio, 40]} />
          {textura ? (
            <meshBasicMaterial map={textura} toneMapped={false} transparent opacity={opacidad} />
          ) : (
            <meshBasicMaterial color={color} transparent opacity={opacidad} />
          )}
        </mesh>
        <mesh position={[0, 0, -0.005]}>
          <ringGeometry args={[radio, radio + 0.1, 40]} />
          <meshBasicMaterial
            color={color}
            toneMapped={false}
            transparent
            opacity={opacidad}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Aro dorado extra: distingue a quienes presiden la sesion. */}
        <mesh position={[0, 0, -0.01]}>
          <ringGeometry args={[radio + 0.1, radio + (encima || activo ? 0.2 : 0.15), 40]} />
          <meshBasicMaterial
            color="#d8b45f"
            toneMapped={false}
            transparent
            opacity={opacidad}
            side={THREE.DoubleSide}
          />
        </mesh>
        {voto && voto !== '-' && <DistintivoVoto codigo={voto} radio={radio} />}
      </Billboard>
    </group>
  )
}

/**
 * Escudo nacional empotrado en el muro de listones, detras del Directorio.
 * Es el elemento que identifica de inmediato al salon costarricense.
 */
function Escudo({ ruta, z }: { ruta: string; z: number }) {
  const textura = useLoader(THREE.TextureLoader, ruta) as THREE.Texture
  textura.colorSpace = THREE.SRGBColorSpace
  textura.anisotropy = 8

  const alto = 4.3
  const img = textura.image as { width?: number; height?: number } | undefined
  const proporcion = img?.width && img?.height ? img.width / img.height : 0.92

  return (
    <mesh position={[0, 6.4, z]}>
      <planeGeometry args={[alto * proporcion, alto]} />
      <meshBasicMaterial map={textura} transparent toneMapped={false} />
    </mesh>
  )
}

interface CurulProps {
  curul: CurulSala
  dip: Diputado
  textura: THREE.Texture | undefined
  color: string
  voto: CodigoVoto | null
  atenuado: boolean
  activo: boolean
  onSeleccionar: (slug: string | null) => void
  onSobrevolar: (info: { dip: Diputado; x: number; y: number } | null) => void
}

function Curul({
  curul,
  dip,
  textura,
  color,
  voto,
  atenuado,
  activo,
  onSeleccionar,
  onSobrevolar,
}: CurulProps) {
  const [encima, setEncima] = useState(false)
  const retrato = useRef<THREE.Group>(null)

  // El retrato de la curul enfocada sube apenas y late: ayuda a ubicarla
  // sin necesidad de leer texto.
  useFrame((estado) => {
    if (!retrato.current) return
    const objetivo = activo ? 0.32 : encima ? 0.16 : 0
    retrato.current.position.y += (objetivo - retrato.current.position.y) * 0.16
    if (activo) {
      retrato.current.position.y += Math.sin(estado.clock.elapsedTime * 2.6) * 0.012
    }
  })

  const opacidad = atenuado ? 0.16 : 1
  // Hacia donde queda el pasillo central desde esta curul. La bancada
  // izquierda mira a +X y la derecha a -X, asi ambas se enfrentan.
  const haciaPasillo = curul.lado === 'izquierda' ? 1 : -1

  return (
    <group position={[curul.x, curul.y, curul.z]}>
      {/* Tarima de la grada */}
      <mesh position={[0, -0.31, 0]}>
        <boxGeometry args={[2.6, 0.62, 1.8]} />
        <meshStandardMaterial color="#d8cdb6" roughness={0.95} transparent opacity={opacidad} />
      </mesh>

      {/* Escritorio */}
      <mesh
        position={[0.62 * haciaPasillo, 0.42, 0]}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setEncima(true)
          onSobrevolar({ dip, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
        }}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          onSobrevolar({ dip, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
        }}
        onPointerOut={() => {
          setEncima(false)
          onSobrevolar(null)
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onSeleccionar(activo ? null : dip.slug)
        }}
      >
        <boxGeometry args={[0.75, 0.85, 1.55]} />
        <meshStandardMaterial
          color={encima || activo ? '#8d6949' : MADERA}
          roughness={0.65}
          transparent
          opacity={opacidad}
        />
      </mesh>

      {/* Franja con el color de la bancada, en el frente del escritorio */}
      <mesh position={[1.005 * haciaPasillo, 0.16, 0]}>
        <boxGeometry args={[0.04, 0.16, 1.5]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={activo ? 0.85 : 0.35}
          transparent
          opacity={opacidad}
        />
      </mesh>

      {/* Sobre del escritorio, mas claro que el frente */}
      <mesh position={[0.62 * haciaPasillo, 0.86, 0]}>
        <boxGeometry args={[0.8, 0.06, 1.6]} />
        <meshStandardMaterial color="#6b4e34" roughness={0.5} transparent opacity={opacidad} />
      </mesh>

      {/* Pantalla tactil de la curul: cada una tiene la suya */}
      <mesh position={[0.5 * haciaPasillo, 1.05, 0.18]} rotation={[0, 0, 0.22 * haciaPasillo]}>
        <boxGeometry args={[0.05, 0.34, 0.46]} />
        <meshStandardMaterial
          color="#12202e"
          emissive="#1d3a52"
          emissiveIntensity={0.5}
          roughness={0.35}
          transparent
          opacity={opacidad}
        />
      </mesh>

      {/* Silla de respaldo alto */}
      <mesh position={[-0.4 * haciaPasillo, 0.3, 0]}>
        <boxGeometry args={[0.66, 0.14, 0.64]} />
        <meshStandardMaterial color={CUERO} roughness={0.6} transparent opacity={opacidad} />
      </mesh>
      <mesh position={[-0.68 * haciaPasillo, 0.86, 0]} rotation={[0, 0, 0.07 * haciaPasillo]}>
        <boxGeometry args={[0.1, 1.06, 0.6]} />
        <meshStandardMaterial color={CUERO} roughness={0.6} transparent opacity={opacidad} />
      </mesh>
      {/* Pie de la silla */}
      <mesh position={[-0.4 * haciaPasillo, 0.12, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 0.24, 8]} />
        <meshStandardMaterial color="#2b2b2e" roughness={0.6} transparent opacity={opacidad} />
      </mesh>

      {/* Retrato oficial sobre la curul. Va en Billboard para que la cara
          siempre mire a la camara: girando la sala, media bancada quedaria
          de espaldas y solo se veria el aro. */}
      <group ref={retrato}>
        <Billboard position={[0.66 * haciaPasillo, 1.55, 0]}>
          {/* El retrato tambien responde: es lo primero que la gente
              intenta tocar, mas que el escritorio. */}
          <mesh
            onPointerOver={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              setEncima(true)
              onSobrevolar({ dip, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
            }}
            onPointerMove={(e: ThreeEvent<PointerEvent>) => {
              e.stopPropagation()
              onSobrevolar({ dip, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY })
            }}
            onPointerOut={() => {
              setEncima(false)
              onSobrevolar(null)
            }}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onSeleccionar(activo ? null : dip.slug)
            }}
          >
            <circleGeometry args={[0.46, 40]} />
            {textura ? (
              <meshBasicMaterial map={textura} toneMapped={false} transparent opacity={opacidad} />
            ) : (
              <meshBasicMaterial color={color} transparent opacity={opacidad} />
            )}
          </mesh>
          <mesh position={[0, 0, -0.005]}>
            <ringGeometry args={[0.46, 0.56, 40]} />
            <meshBasicMaterial
              color={color}
              toneMapped={false}
              transparent
              opacity={opacidad}
              side={THREE.DoubleSide}
            />
          </mesh>
          {voto && voto !== '-' && <DistintivoVoto codigo={voto} radio={0.46} />}
        </Billboard>
      </group>
    </group>
  )
}

/**
 * Distintivo del voto sobre el retrato: un circulo del color del voto con el
 * simbolo dibujado con geometria (✓, ✕ o –). No se usa texto 3D porque el de
 * drei descarga una fuente de un CDN, y el sitio no llama a nada externo.
 */
function DistintivoVoto({ codigo, radio }: { codigo: Exclude<CodigoVoto, '-'>; radio: number }) {
  const r = radio * 0.36
  const trazos: Array<{ x: number; y: number; largo: number; giro: number }> =
    codigo === 'F'
      ? [
          { x: -0.22, y: -0.08, largo: 0.42, giro: -Math.PI / 4 },
          { x: 0.12, y: 0.06, largo: 0.78, giro: Math.PI / 3.2 },
        ]
      : codigo === 'C'
        ? [
            { x: 0, y: 0, largo: 0.95, giro: Math.PI / 4 },
            { x: 0, y: 0, largo: 0.95, giro: -Math.PI / 4 },
          ]
        : [{ x: 0, y: 0, largo: 0.9, giro: 0 }]
  return (
    <group position={[radio * 0.76, -radio * 0.76, 0.02]}>
      <mesh>
        <circleGeometry args={[r, 32]} />
        <meshBasicMaterial color={VOTO[codigo].color} toneMapped={false} />
      </mesh>
      {trazos.map((s, i) => (
        <mesh key={i} position={[s.x * r, s.y * r, 0.005]} rotation={[0, 0, s.giro]}>
          <planeGeometry args={[s.largo * r, 0.2 * r]} />
          <meshBasicMaterial color="#0b1120" toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}
