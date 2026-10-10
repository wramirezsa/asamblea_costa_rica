/**
 * Ruteo mínimo, sin dependencias.
 *
 * Hasta ahora el sitio vivía en una sola dirección: no se podía enlazar a una
 * diputación ni a una provincia. Eso impedía compartir —nadie manda un enlace
 * que no apunta a nada— y dejaba al sitio invisible para los buscadores.
 *
 * Rutas:
 *   /                        el plenario completo
 *   /diputado/{slug}         con la ficha de esa persona abierta
 *   /provincia/{provincia}   filtrado por provincia
 *   /votacion/{clave}        el mapa con una votacion del acta ("ordinaria-58-12")
 *   /votaciones              resumen y lista de votaciones del Plenario
 *   /actividad               leyes, mociones e intervenciones
 *   /fuentes                 de donde sale cada dato, fechas y lo que no mostramos
 *
 * Se usa la History API en vez de un router completo: son pocas rutas y no
 * justifica una dependencia. Vite y la mayoría de alojamientos estáticos
 * sirven index.html para rutas desconocidas, que es lo que esto necesita.
 */

/** Las secciones de la navegacion. 'plenario' es la portada (el mapa). */
export type Seccion = 'plenario' | 'votaciones' | 'actividad' | 'fuentes'

const SECCIONES_CON_RUTA: Seccion[] = ['votaciones', 'actividad', 'fuentes']

export type Ruta =
  | { tipo: 'inicio' }
  | { tipo: 'seccion'; seccion: Seccion }
  | { tipo: 'diputado'; slug: string }
  | { tipo: 'provincia'; provincia: string }
  | { tipo: 'votacion'; clave: string }

/** "San José" -> "san-jose". Para que la dirección sea legible y estable. */
export function aSlug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Subdireccion donde vive el sitio ('/' en local, '/asamblea_costa_rica/' en
 * GitHub Pages). Las rutas se leen y escriben relativas a ella.
 */
const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

function rutaRelativa(): string {
  const p = window.location.pathname
  return BASE && p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p
}

export function leerRuta(): Ruta {
  const partes = rutaRelativa().split('/').filter(Boolean)
  if (partes[0] === 'diputado' && partes[1]) {
    return { tipo: 'diputado', slug: decodeURIComponent(partes[1]) }
  }
  if (partes[0] === 'provincia' && partes[1]) {
    return { tipo: 'provincia', provincia: decodeURIComponent(partes[1]) }
  }
  if (partes[0] === 'votacion' && partes[1]) {
    return { tipo: 'votacion', clave: decodeURIComponent(partes[1]) }
  }
  const seccion = SECCIONES_CON_RUTA.find((s) => s === partes[0])
  if (seccion && !partes[1]) return { tipo: 'seccion', seccion }
  return { tipo: 'inicio' }
}

export function rutaAUrl(r: Ruta): string {
  if (r.tipo === 'diputado') return `${BASE}/diputado/${encodeURIComponent(r.slug)}`
  if (r.tipo === 'provincia') return `${BASE}/provincia/${encodeURIComponent(r.provincia)}`
  if (r.tipo === 'votacion') return `${BASE}/votacion/${encodeURIComponent(r.clave)}`
  if (r.tipo === 'seccion' && r.seccion !== 'plenario') return `${BASE}/${r.seccion}`
  return `${BASE}/`
}

/** Cambia la dirección sin recargar. `reemplazar` evita ensuciar el historial. */
export function irA(r: Ruta, reemplazar = false) {
  const url = rutaAUrl(r)
  if (url === window.location.pathname) return
  if (reemplazar) window.history.replaceState({}, '', url)
  else window.history.pushState({}, '', url)
}

/**
 * Ajusta título y descripción según lo que se está viendo.
 *
 * Importa para dos cosas: lo que se ve al compartir el enlace, y lo que
 * indexan los buscadores. Sin esto, las 57 fichas comparten un solo título.
 */
export function ponerTitulo(titulo: string, descripcion: string) {
  document.title = titulo
  for (const sel of ['meta[name="description"]', 'meta[property="og:description"]']) {
    const el = document.head.querySelector(sel)
    if (el) el.setAttribute('content', descripcion)
  }
  const og = document.head.querySelector('meta[property="og:title"]')
  if (og) og.setAttribute('content', titulo)
}

/**
 * Ruta absoluta a un archivo servido junto al sitio.
 *
 * Las rutas relativas se rompen en cuanto hay ruteo: desde
 * `/diputado/villalta`, "datos/asamblea.json" resuelve a
 * "/diputado/datos/asamblea.json" y da 404. Se respeta `BASE_URL` por si el
 * sitio se publica bajo un subdirectorio.
 */
export function recurso(ruta: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return `${base}/${ruta.replace(/^\//, '')}`
}
