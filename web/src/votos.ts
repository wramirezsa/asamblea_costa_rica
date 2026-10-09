// Votaciones nominales del Plenario, leídas de las actas oficiales (ADR-021).
//
// El archivo pesa ~800 KB sin comprimir (≈60 KB con gzip): se pide solo cuando
// alguien abre una ficha o la sección de votaciones, y una sola vez.

import { recurso } from './rutas'
import type { CodigoVoto, DatosVotaciones, SesionActa, VotacionActa } from './tipos'

let pedido: Promise<DatosVotaciones> | null = null

export function cargarVotaciones(): Promise<DatosVotaciones> {
  if (!pedido) {
    pedido = fetch(recurso('datos/votaciones.json'), { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} al pedir datos/votaciones.json`)
      return r.json()
    })
    // Si falla, que el próximo intento vuelva a pedirlo.
    pedido.catch(() => {
      pedido = null
    })
  }
  return pedido
}

/**
 * Cómo se muestra cada voto. El color nunca va solo: cada voto lleva además
 * un símbolo y una etiqueta (reglas de accesibilidad del frontend).
 */
export const VOTO: Record<CodigoVoto, { etiqueta: string; color: string; simbolo: string }> = {
  F: { etiqueta: 'A favor', color: '#22c55e', simbolo: '✓' },
  C: { etiqueta: 'En contra', color: '#ef4444', simbolo: '✕' },
  N: { etiqueta: 'No votó', color: '#f59e0b', simbolo: '–' },
  '-': { etiqueta: 'No figura en la votación', color: '#475569', simbolo: '' },
}

export function votoDe(v: VotacionActa, indice: number): CodigoVoto {
  const c = v.v[indice]
  return c === 'F' || c === 'C' || c === 'N' ? c : '-'
}

export function nombreSesion(s: SesionActa): string {
  return `Sesión ${s.tipo} N.º ${s.numero}`
}

export function fechaLarga(iso: string): string {
  // La fecha del acta es un día del calendario: se arma a mediodía para que
  // ningún huso horario la corra al día anterior.
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })
}

/** Dónde puede cualquiera consultar el acta original. */
export const URL_SIL =
  'https://www.asamblea.go.cr/Centro_de_informacion/Consultas_SIL/SitePages/SIL.aspx'

/** Identificador estable de una votación, para enlaces: "ordinaria-58-12". */
export function claveVotacion(datos: DatosVotaciones, v: VotacionActa): string {
  const s = datos.sesiones[v.s]
  return `${s.tipo}-${s.numero}-${v.n}`
}

export function buscarVotacion(datos: DatosVotaciones, clave: string): number | null {
  const m = /^(ordinaria|extraordinaria|solemne)-(\d+)-(\d+)$/.exec(clave)
  if (!m) return null
  const i = datos.votaciones.findIndex((v) => {
    const s = datos.sesiones[v.s]
    return s.tipo === m[1] && s.numero === Number(m[2]) && v.n === Number(m[3])
  })
  return i >= 0 ? i : null
}
