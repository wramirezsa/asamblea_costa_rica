import type { Extraido } from './tipos'

/** Nombre visible de cada fuente, en el orden en que se listan. */
export const FUENTES: [keyof Extraido, string][] = [
  ['padron', 'Padrón'],
  ['directorio', 'Directorio'],
  ['actividad', 'Leyes, mociones e intervenciones'],
  ['gasto', 'Remuneración y combustible'],
  ['actas', 'Actas del Plenario'],
]

/**
 * La extracción más vieja de todas: lo menos fresco que muestra el sitio.
 * Es la fecha que va en la cabecera, para no aparentar frescura que no hay
 * (las fuentes se actualizan en momentos distintos, ADR-024).
 */
export function extraccionMasVieja(e: Extraido): string | null {
  // Todas vienen en ISO 8601 UTC: el orden de texto es el orden de fecha.
  const fechas = Object.values(e).filter((f): f is string => !!f).sort()
  return fechas[0] ?? null
}

export function fechaHora(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('es-CR') : 'Sin dato'
}
