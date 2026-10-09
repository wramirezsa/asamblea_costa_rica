// Tipos que reflejan exactamente el payload que produce etl/publish_web.py.
// Si cambia el ETL, este archivo debe cambiar con el.

export interface Redes {
  facebook: string | null
  twitter: string | null
  instagram: string | null
  youtube: string | null
  tiktok: string | null
  blog: string | null
}

export interface Biografia {
  educacion: string | null
  experiencia_laboral: string | null
  experiencia_politica: string | null
  premios: string | null
  participacion_comunal: string | null
  ponencias: string | null
  publicaciones: string | null
  areas_interes: string | null
}

export interface Diputado {
  slug: string
  nombre: string
  cedula: string | null
  partido_codigo: string | null
  fraccion: string | null
  provincia: string | null
  profesion: string | null
  fecha_nacimiento: string | null
  lugar_nacimiento: string | null
  estado_civil: string | null
  email_oficial: string | null
  redes: Redes
  biografia: Biografia
  foto: string | null
  foto_oficial_url: string | null
  /** Cargo en el Directorio Legislativo, si ocupa alguno. */
  cargo_directorio: string | null
}

export interface Fraccion {
  codigo: string
  nombre: string | null
  nombre_tomado_de: string | null
  sitio: string | null
  estado: string
  escanos: number
  color: string | null
  color_derivado_de_bandera: string | null
  bandera: string | null
}

export interface Curul {
  curul: number
  slug: string
  partido: string | null
  fila: number
  angulo: number
  x: number
  y: number
}

export interface Hemiciclo {
  confianza: 'derivado' | 'oficial'
  nota: string
  filas: number
  curules: Curul[]
}

/**
 * Curul de la sala real. El `id` sigue la numeracion S{seccion}-F{fila}-A{asiento}:
 * seccion 1 = oficialismo, 2 = oposicion; fila 1 = pegada al pasillo;
 * asiento 1 = el mas cercano al Directorio.
 *
 * `origen` distingue lo verificado a mano de lo colocado por regla automatica.
 */
export interface CurulSala {
  id: string
  seccion: number
  fila: number
  asiento: number
  slug: string
  partido: string | null
  lado: 'izquierda' | 'derecha'
  grada: number
  origen: 'curado' | 'derivado'
  x: number
  y: number
  z: number
  rot_y: number
}

/** Asiento en la mesa del Directorio, de cara al resto del plenario. */
export interface PuestoMesa {
  id: string
  slug: string
  partido: string | null
  cargo: string
  etiqueta: string
  seccion: 'mesa'
  origen: 'oficial'
  x: number
  y: number
  z: number
  rot_y: number
}

/** Curul que existe en la sala pero no la ocupa nadie. */
export interface CurulVacia {
  id: string
  seccion: number
  fila: number
  asiento: number
  lado: 'izquierda' | 'derecha'
  x: number
  y: number
  z: number
  rot_y: number
}

export interface Sala {
  confianza: 'reconstruido' | 'oficial'
  nota: string
  curules: CurulSala[]
  mesa: PuestoMesa[]
  vacias: CurulVacia[]
  /** Cuántas curules están verificadas a mano y cuántas siguen por revisar. */
  curadas: number
  por_curar: number
  avisos: string[]
}

export interface MiembroDirectorio {
  cargo: string
  etiqueta: string
  slug: string
  nombre: string
  partido_codigo: string | null
}

export interface Directorio {
  _fuente: string
  nota: string
  miembros: MiembroDirectorio[]
}

export interface Escudo {
  oficial: string
  bronce: string | null
  origen: string
  nota: string
}

export interface LeyAprobada {
  numero: string | null
  titulo: string | null
  resumen: string | null
  publicada: string | null
}

export interface MocionReciente {
  numero: string | null
  expediente: string | null
  resultado: string | null
  asunto: string | null
  tramite: string | null
  fecha: string | null
}

/** Un archivo de intervenciones de una diputación en un mes dado. */
export interface Intervencion {
  archivo: string
  periodo: string | null
  url: string | null
  modificado: string | null
}

/**
 * Actividad legislativa. Cada bloque trae `ultima_actualizacion`, que es la
 * fecha en que la ASAMBLEA tocó el dato, no cuándo corrimos el ETL.
 */
export interface Actividad {
  leyes: {
    total: number
    ultima_actualizacion: string | null
    por_anio: Record<string, number>
    recientes: LeyAprobada[]
  }
  mociones: {
    total: number
    ultima_actualizacion: string | null
    por_resultado: Record<string, number>
    por_anio: Record<string, number>
    expedientes_distintos: number
    recientes: MocionReciente[]
  }
  intervenciones: {
    total: number
    ultima_actualizacion: string | null
    diputaciones_con_registro: number
    sin_registro: string[]
    por_diputacion: Record<string, Intervencion[]>
  }
}

/** Cuántas veces figura cada diputación en la lista de presentes de las actas. */
export interface AsistenciaActas {
  presente: number
  /** Sesiones en que votó sin figurar en la lista de presentes del acta. */
  voto_sin_figurar: number
}

/** Resumen de las actas del Plenario (SIL+, ADR-021). */
export interface ResumenActas {
  _fuente: string
  _extraido: string
  desde: string | null
  hasta: string | null
  sesiones: number
  sesiones_con_lista_de_presentes: number
  votaciones: number
  /** Sesiones listadas en el SIL+ cuyo texto todavía no está publicado. */
  sin_documento: string[]
  asistencia: Record<string, AsistenciaActas>
}

/**
 * Voto de una diputación en una votación del acta:
 * F a favor, C en contra, N no votó (figura en "No-Votación"),
 * '-' no figura en la lista de esa votación.
 */
export type CodigoVoto = 'F' | 'C' | 'N' | '-'

/** Lo que publica `datos/votaciones.json`, que se pide aparte. */
export interface SesionActa {
  tipo: string
  numero: number
  fecha: string
  /** Una marca por diputación ('1' presente), en el orden de `orden`. */
  presentes: string
}

export interface VotacionActa {
  /** Índice de la sesión en `sesiones`. */
  s: number
  /** Orden de la votación dentro del acta. */
  n: number
  /** Nombre de la propuesta tal como lo escribe el acta. */
  p: string | null
  m: number | null
  e: string | null
  /** Totales declarados por el acta: [a favor, en contra, no votación]. */
  d: [number | null, number | null, number | null]
  /** Un CodigoVoto por diputación, en el orden de `orden`. */
  v: string
  /** Solo si lo cantado por la Presidencia coincide con la lista; si no, null. */
  r: 'aprobada' | 'rechazada' | null
}

export interface DatosVotaciones {
  _fuente: string
  _extraido: string
  orden: string[]
  sesiones: SesionActa[]
  votaciones: VotacionActa[]
}

/** Remuneración de un mes, tal como la publica la Asamblea (colones). */
export interface Remuneracion {
  dieta: number | null
  representacion: number | null
  bruta: number | null
}

/** Combustible de un mes. `monto` null = celda vacía en el archivo oficial. */
export interface Combustible {
  monto: number | null
  /** El archivo marca con asterisco a quien renunció a la ayuda técnica. */
  renuncio: boolean
}

/** Gasto por diputación desde el portal de datos abiertos (ADR-023). */
export interface Gasto {
  _fuente: string
  _extraido: string
  /** URL del Excel oficial de cada mes ("2026-09" -> url). */
  archivos: { salarios: Record<string, string>; combustible: Record<string, string> }
  notas: { salarios: string[]; combustible: string[] }
  por_diputacion: Record<
    string,
    { salarios: Record<string, Remuneracion>; combustible: Record<string, Combustible> }
  >
}

export interface Asamblea {
  generado: string
  gasto: Gasto | null
  periodo: string
  fuente_oficial: string
  licencia: string
  total: number
  conteo_por_partido: Record<string, number>
  fracciones: Fraccion[]
  metodo_colores: string
  actividad: Actividad | null
  actas: ResumenActas | null
  escudo: Escudo | null
  hemiciclo: Hemiciclo
  sala: Sala
  directorio: Directorio
  diputados: Diputado[]
}
