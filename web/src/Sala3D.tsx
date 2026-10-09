import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Arquitectura del salon de sesiones, reconstruida a partir de fotografias.
 *
 * Cada pieza de este archivo corresponde a un objeto identificable en las
 * fotos del plenario. Lo que no se ve en una foto, no se modela.
 *
 * Inventario (de fondo hacia la entrada):
 *   - muro del fondo con panel central de listones horizontales
 *   - escudo nacional en relieve, empotrado en ese panel
 *   - asta con la bandera de Costa Rica, detras del Directorio
 *   - estrado elevado y mesa larga del Directorio
 *   - parapeto blanco que recorre el frente del estrado
 *   - podio de oradores, al centro del piso
 *   - ventanales del muro izquierdo
 *   - cabina acristalada del muro derecho
 *   - altavoces negros montados en ambos muros
 *   - cielo raso con luminarias lineales
 *   - piso claro con franja central
 */

// Tonos leidos de las fotografias.
export const MADERA = '#7c5a3f' // paneles de los muros laterales
export const MADERA_OSCURA = '#4a3527' // mobiliario
export const MURO_FONDO = '#3a2a1c' // muro del fondo, en penumbra
export const LISTON = '#6b4e34' // listones horizontales del panel central
export const PISO = '#c4b394'
export const FRANJA = '#b08d4f'
export const CUERO = '#3d2b20'
export const CREMA = '#e8e2d6' // estrado y parapeto

/** Profundidad de la mesa del Directorio. Coincide con Z_DIRECTORIO en etl/curules.py. */
export const Z_DIRECTORIO = -11

export const SALA = {
  ancho: 26, // eje X
  largo: 34, // eje Z
  alto: 13,
  zFondo: -15, // muro detras del Directorio
  zEntrada: 17,
}

/** Muro del fondo: panel de listones, escudo y madera maciza alrededor. */
function MuroFondo({ zDirectorio }: { zDirectorio: number }) {
  const z = SALA.zFondo
  // El panel de listones no cubre todo el muro: es un rectangulo central,
  // flanqueado por madera lisa, tal como se ve en las fotografias.
  const listones = useMemo(() => {
    const filas: number[] = []
    for (let y = 3.4; y <= 11.2; y += 0.42) filas.push(y)
    return filas
  }, [])

  return (
    <group>
      <mesh position={[0, SALA.alto / 2, z]}>
        <planeGeometry args={[SALA.ancho, SALA.alto]} />
        <meshStandardMaterial color={MADERA} roughness={0.9} />
      </mesh>

      {/* Fondo oscuro del panel de listones */}
      <mesh position={[0, 7.3, z + 0.08]}>
        <planeGeometry args={[16, 8.2]} />
        <meshStandardMaterial color={MURO_FONDO} roughness={0.95} />
      </mesh>

      {listones.map((y) => (
        <mesh key={y} position={[0, y, z + 0.16]}>
          <boxGeometry args={[15.6, 0.2, 0.14]} />
          <meshStandardMaterial color={LISTON} roughness={0.85} />
        </mesh>
      ))}

      {/* Zocalo de madera bajo el panel, hasta el estrado */}
      <mesh position={[0, 1.6, z + 0.1]}>
        <planeGeometry args={[SALA.ancho, 3.2]} />
        <meshStandardMaterial color={MADERA} roughness={0.85} />
      </mesh>

      {/* Asta con la bandera nacional, detras del Directorio */}
      <Bandera x={-0.2} z={zDirectorio - 2.6} />
    </group>
  )
}

/** Bandera de Costa Rica: azul, blanco, rojo, blanco, azul. */
function Bandera({ x, z }: { x: number; z: number }) {
  const franjas: Array<[string, number, number]> = [
    ['#002b7f', 0.16, 2.72],
    ['#ffffff', 0.10, 2.56],
    ['#ce1126', 0.24, 2.36],
    ['#ffffff', 0.10, 2.16],
    ['#002b7f', 0.16, 2.02],
  ]
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 3.2, 10]} />
        <meshStandardMaterial color="#c9b27a" metalness={0.5} roughness={0.5} />
      </mesh>
      {franjas.map(([color, alto, y], i) => (
        <mesh key={i} position={[0.42, y, 0]}>
          <boxGeometry args={[0.8, alto, 0.03]} />
          <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  )
}

/** Estrado elevado, mesa larga del Directorio y parapeto blanco del frente. */
function Directorio({ zDirectorio }: { zDirectorio: number }) {
  return (
    <group>
      {/* Estrado */}
      <mesh position={[0, 0.3, zDirectorio + 0.4]}>
        <boxGeometry args={[17, 0.6, 5.2]} />
        <meshStandardMaterial color={CREMA} roughness={0.92} />
      </mesh>

      {/* Mesa larga del Directorio */}
      <mesh position={[0, 1.08, zDirectorio]}>
        <boxGeometry args={[9.6, 0.96, 1.4]} />
        <meshStandardMaterial color={MADERA_OSCURA} roughness={0.65} />
      </mesh>
      {/* Sobre de la mesa, algo mas claro */}
      <mesh position={[0, 1.58, zDirectorio]}>
        <boxGeometry args={[9.8, 0.08, 1.55]} />
        <meshStandardMaterial color="#6b4e34" roughness={0.5} />
      </mesh>

      {/* Parapeto blanco que recorre el frente del estrado */}
      <mesh position={[0, 0.85, zDirectorio + 3.1]}>
        <boxGeometry args={[19, 1.7, 0.55]} />
        <meshStandardMaterial color={CREMA} roughness={0.9} />
      </mesh>
      {/* Los dos arreglos claros que se ven sobre el parapeto */}
      {[-4.6, 4.6].map((x) => (
        <mesh key={x} position={[x, 1.85, zDirectorio + 3.1]}>
          <sphereGeometry args={[0.36, 16, 12]} />
          <meshStandardMaterial color="#f2ece0" roughness={0.85} />
        </mesh>
      ))}

      {/* Podio de oradores, al centro del piso */}
      <group position={[0, 0, zDirectorio + 5.6]}>
        <mesh position={[0, 0.72, 0]}>
          <boxGeometry args={[1.05, 1.44, 0.75]} />
          <meshStandardMaterial color={MADERA_OSCURA} roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.47, 0.06]} rotation={[-0.32, 0, 0]}>
          <boxGeometry args={[0.95, 0.06, 0.6]} />
          <meshStandardMaterial color="#5c4432" roughness={0.5} />
        </mesh>
      </group>
    </group>
  )
}

/** Muros laterales: ventanales a la izquierda, cabina acristalada a la derecha. */
function MurosLaterales() {
  const x = SALA.ancho / 2
  return (
    <group>
      {[-1, 1].map((lado) => (
        <mesh
          key={lado}
          position={[lado * x, SALA.alto / 2, 0]}
          rotation={[0, (-lado * Math.PI) / 2, 0]}
        >
          <planeGeometry args={[SALA.largo, SALA.alto]} />
          <meshStandardMaterial color={MADERA} roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
      ))}

      {/* Ventanales del muro izquierdo: entra luz de dia */}
      <mesh position={[-x + 0.12, 8, 1]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[19, 7]} />
        <meshBasicMaterial color="#cfe4f5" toneMapped={false} />
      </mesh>
      {/* Parteluces verticales de los ventanales */}
      {Array.from({ length: 13 }, (_, i) => -8.4 + i * 1.55).map((z) => (
        <mesh key={z} position={[-x + 0.2, 8, z]}>
          <boxGeometry args={[0.1, 7, 0.16]} />
          <meshStandardMaterial color="#6f5f4d" roughness={0.8} />
        </mesh>
      ))}

      {/* Cabina acristalada del muro derecho (prensa / control) */}
      <mesh position={[x - 0.12, 8.4, -3]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[7.5, 3.6]} />
        <meshBasicMaterial color="#dfe7ee" toneMapped={false} />
      </mesh>
      <mesh position={[x - 0.2, 6.5, -3]}>
        <boxGeometry args={[0.14, 0.18, 7.6]} />
        <meshStandardMaterial color={MADERA_OSCURA} roughness={0.7} />
      </mesh>

      {/* Altavoces negros montados en ambos muros */}
      {[-1, 1].flatMap((lado) =>
        [-6, 0, 6, 11].map((z) => (
          <mesh key={`${lado}-${z}`} position={[lado * (x - 0.35), 5.6, z]}>
            <boxGeometry args={[0.34, 0.9, 0.44]} />
            <meshStandardMaterial color="#1c1c1e" roughness={0.75} />
          </mesh>
        ))
      )}
    </group>
  )
}

/** Cielo raso oscuro con luminarias lineales. */
function CieloRaso() {
  const lineas = useMemo(
    () => Array.from({ length: 9 }, (_, i) => -13 + i * 3.4),
    []
  )
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, SALA.alto, 0]}>
        <planeGeometry args={[SALA.ancho, SALA.largo]} />
        <meshStandardMaterial color="#241a12" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      {lineas.map((z) => (
        <mesh key={z} position={[0, SALA.alto - 0.18, z]}>
          <boxGeometry args={[18, 0.12, 0.34]} />
          <meshBasicMaterial color="#fff6e2" toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Muro de la entrada: lo que mira la Presidencia desde el Directorio.
 *
 * Leido de fotografias de Television Legislativa. De abajo hacia arriba:
 * plataforma elevada del fondo, muro de madera, pantalla grande iluminada,
 * ventana hacia un pasillo posterior, reloj LED, salida de emergencia y
 * altavoces.
 */
function MuroEntrada() {
  const z = SALA.zEntrada
  const ancho = SALA.ancho

  return (
    <group>
      {/* Muro de fondo */}
      <mesh position={[0, SALA.alto / 2, z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[ancho, SALA.alto]} />
        <meshStandardMaterial color={MADERA} roughness={0.92} />
      </mesh>

      {/* Plataforma elevada del fondo */}
      <mesh position={[0, 0.45, z - 1.6]}>
        <boxGeometry args={[ancho - 3, 0.9, 2.8]} />
        <meshStandardMaterial color={CREMA} roughness={0.92} />
      </mesh>

      {/* Antes habia aqui escritorios de apoyo con sus rotulos y una escalera.
          Se quitaron: cargaban la vista sin aportar a lo que importa, que son
          las curules. Queda solo la plataforma elevada del fondo. */}

      {/* Pantalla grande iluminada, en lo alto.
          El bisel va DETRAS del vidrio: si se pone delante como caja solida,
          tapa la parte iluminada y la pantalla se ve negra. */}
      <mesh position={[-5.2, 9.6, z - 0.1]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[7.8, 3.8]} />
        <meshStandardMaterial color="#15171a" roughness={0.7} />
      </mesh>
      <mesh position={[-5.2, 9.6, z - 0.18]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[7.4, 3.4]} />
        <meshBasicMaterial color="#eaf1f7" toneMapped={false} />
      </mesh>

      {/* Ventana hacia el pasillo posterior: se ve luz del otro lado */}
      <group position={[6.4, 8.2, z]}>
        {/* Vidrio: luz del pasillo del otro lado */}
        <mesh position={[0, 0, -0.16]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[6.2, 2.9]} />
          <meshBasicMaterial color="#c8d6e0" toneMapped={false} />
        </mesh>
        {/* Marco: cuatro barras al borde, NO una caja solida (taparia el vidrio) */}
        {[
          { p: [0, 1.53, -0.22], g: [6.6, 0.22, 0.16] },
          { p: [0, -1.53, -0.22], g: [6.6, 0.22, 0.16] },
          { p: [-3.19, 0, -0.22], g: [0.22, 3.3, 0.16] },
          { p: [3.19, 0, -0.22], g: [0.22, 3.3, 0.16] },
        ].map((b, i) => (
          <mesh key={i} position={b.p as [number, number, number]}>
            <boxGeometry args={b.g as [number, number, number]} />
            <meshStandardMaterial color={MADERA_OSCURA} roughness={0.7} />
          </mesh>
        ))}
        {/* Parteluces verticales */}
        {[-2, 0, 2].map((x) => (
          <mesh key={x} position={[x, 0, -0.2]}>
            <boxGeometry args={[0.09, 2.9, 0.1]} />
            <meshStandardMaterial color={MADERA_OSCURA} roughness={0.7} />
          </mesh>
        ))}
        {/* Baranda del pasillo, insinuada detras del vidrio */}
        <mesh position={[0, -0.95, -0.1]}>
          <boxGeometry args={[6, 0.09, 0.06]} />
          <meshStandardMaterial color="#8d8f92" roughness={0.5} metalness={0.4} />
        </mesh>
      </group>

      {/* Reloj LED azul */}
      <mesh position={[-9.8, 10.4, z - 0.16]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.5, 0.5]} />
        <meshBasicMaterial color="#1fa8d8" toneMapped={false} />
      </mesh>

      {/* Salida de emergencia */}
      <mesh position={[2.2, 10.2, z - 0.16]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.85, 0.34]} />
        <meshBasicMaterial color="#25c06a" toneMapped={false} />
      </mesh>

      {/* Altavoces del muro */}
      {[-7.5, -2.5, 2.5].map((x) => (
        <mesh key={x} position={[x, 11.2, z - 0.35]}>
          <boxGeometry args={[0.42, 0.9, 0.34]} />
          <meshStandardMaterial color="#1c1c1e" roughness={0.75} />
        </mesh>
      ))}
    </group>
  )
}

/** Piso claro con la franja central del pasillo. */
function Piso() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[SALA.ancho, SALA.largo]} />
        <meshStandardMaterial color={PISO} roughness={0.96} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.85, 0, 2]}>
        <planeGeometry args={[0.45, SALA.largo - 10]} />
        <meshStandardMaterial color={FRANJA} roughness={0.88} />
      </mesh>
      <MuroEntrada />
    </group>
  )
}

export default function Sala({ zDirectorio = Z_DIRECTORIO }: { zDirectorio?: number }) {
  return (
    <group>
      <Piso />
      <MuroFondo zDirectorio={zDirectorio} />
      <MurosLaterales />
      <CieloRaso />
      <Directorio zDirectorio={zDirectorio} />
    </group>
  )
}
