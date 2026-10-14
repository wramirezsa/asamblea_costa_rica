/**
 * Asistente de preguntas de Asamblea Abierta (ADR-030).
 *
 * Recibe una pregunta, deja que el modelo elija herramientas (herramientas.ts)
 * y devuelve la respuesta con lo que se consultó y enlaces para verificar.
 * El modelo no calcula ni recuerda cifras: solo redacta con lo que devuelven
 * las herramientas, que leen los datos publicados del sitio. Lo que no puede
 * fallar (notas oficiales, artículo del Reglamento) lo agrega el código.
 */

import { DEFINICIONES, ejecutar, type Contexto, type Datos, type Enlace, type FilaVotacion } from './herramientas'
import { respuestaDirecta, respuestaSaludo } from './directas'
import { groq, MODELOS_GROQ, SinCupo, workersAI, type Mensaje, type Respuesta } from './modelo'

interface Env {
  AI: Ai
  LIMITE: RateLimit
  GROQ_API_KEY?: string
  DATOS_URL: string
  SITIO_URL: string
  ORIGENES: string
  /** Opcional: cadena de modelos de Groq separada por comas (para probar uno sin tocar código). */
  MODELOS_GROQ?: string
}

const MAX_PREGUNTA = 400
/** Turnos previos de la conversación que se tienen en cuenta, y cuánto de cada respuesta. */
const MAX_TURNOS = 4
const MAX_RESPUESTA_PREVIA = 700
const MAX_PASOS = 4
const VIGENCIA_MS = 10 * 60 * 1000
// Se sube cuando cambia la forma de los datos: la URL nueva no puede
// devolver la copia vieja que guardó la caché de Cloudflare.
const VERSION_DATOS = '3'
/** Se sube en cada cambio de comportamiento: invalida la caché de respuestas. */
const VERSION_WORKER = '2026-10-14i'

// Corto a propósito: viaja en cada paso y el cupo gratis se mide en tokens.
const SISTEMA_BASE = `Sos el asistente de Asamblea Abierta, sitio ciudadano independiente sobre el Plenario de la Asamblea Legislativa de Costa Rica (2026-2030). Respondé en español de Costa Rica, con voseo, breve y en texto plano (sin asteriscos ni markdown).

Reglas:
1. Toda cifra, nombre o fecha sale de una herramienta, nunca de memoria ni del historial. No calcules ni redondees. Antes de decir "No tengo ese dato oficial", probá las herramientas. Nunca afirmes qué registra o no una fuente.
2. Un día concreto (hoy, ayer, una fecha): usá asistencia_sesion con esa fecha. Si no hay acta, decilo y da la última fecha con acta.
3. No opinás ni calificás personas, partidos o proyectos; ofrecé datos. Solo temas de la Asamblea Legislativa de Costa Rica.
4. De una ausencia decí "no figura en la lista de presentes", nunca "faltó".
5. Respetá las "_nota" y las "notas_oficiales" (mencionalas). Si hay empates en un ranking, decilo.
6. En listados, nombrá a TODOS los que devolvió la herramienta y empezá con el total ("Son 7:").
7. Colones con separador de miles (₡4 000 715); fechas como "8 de octubre de 2026". No escribas enlaces.
8. El historial sirve solo para entender a quién o qué se refiere la pregunta.
9. Nombrá a las personas por su nombre o como "la diputación": no supongas el género.`

let cacheDatos: { datos: Datos; hasta: number } | null = null
let cacheVotaciones: { filas: FilaVotacion[]; hasta: number } | null = null
/** Modelo agotado -> hasta cuándo no se intenta (ms). */
const agotados = new Map<string, number>()
/** Preguntas idénticas sin conversación previa (por ejemplo, las sugeridas). */
const cacheRespuestas = new Map<string, { cuerpo: unknown; hasta: number }>()

async function cargar<T>(url: string): Promise<T> {
  const r = await fetch(url, { cf: { cacheTtl: 600, cacheEverything: true } })
  if (!r.ok) throw new Error(`No se pudieron leer los datos (${r.status})`)
  return (await r.json()) as T
}

function cors(origen: string | null, env: Env): Record<string, string> {
  const permitidos = env.ORIGENES.split(',').map((s) => s.trim())
  return {
    'access-control-allow-origin': origen && permitidos.includes(origen) ? origen : permitidos[0],
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    vary: 'origin',
  }
}

function json(cuerpo: unknown, estado: number, cabeceras: Record<string, string>): Response {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', ...cabeceras },
  })
}

function plano(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Notas oficiales que vienen en los resultados de las herramientas, por persona. */
function notasEn(datos: unknown, salida: Map<string, string[]>): void {
  if (Array.isArray(datos)) {
    for (const x of datos) notasEn(x, salida)
  } else if (datos && typeof datos === 'object') {
    const o = datos as Record<string, unknown>
    if (typeof o.nombre === 'string' && Array.isArray(o.notas_oficiales) && o.notas_oficiales.length) {
      salida.set(o.nombre, o.notas_oficiales as string[])
    }
    for (const v of Object.values(o)) notasEn(v, salida)
  }
}

/**
 * Lo que no se deja a la obediencia del modelo:
 * - si nombra a una persona que tiene notas oficiales y no las menciona, se
 *   agregan textuales (por ejemplo, la licencia que explica su asistencia);
 * - si explicó un término del glosario sin citar el artículo, se cita.
 */
function completar(texto: string, notas: Map<string, string[]>, articulos: string[]): string {
  let t = texto.trim()
  const p = plano(t)
  for (const [nombre, lista] of notas) {
    const partes = nombre.split(' ')
    const apellido = plano(partes.length >= 3 ? partes[partes.length - 2] : partes[partes.length - 1])
    if (!p.includes(apellido)) continue
    for (const nota of lista) {
      const claves = plano(nota)
        .split(/[^a-zñ]+/)
        .filter((w) => w.length >= 8)
      const yaEsta = claves.filter((w) => p.includes(w)).length >= 2
      if (!yaEsta) t += `\n\nNota oficial de la Asamblea: ${nota}`
    }
  }
  if (articulos.length && !/\bart(\.|ículo|iculo)/i.test(t)) {
    t += `\n\n(Reglamento de la Asamblea Legislativa, art. ${articulos.join(', ')}.)`
  }
  return t
}

/** Cifras de un texto, sin separadores de miles ni decimales: "₡4 000 714,75" -> "4000714". */
function cifras(texto: string): string[] {
  const salida: string[] = []
  // Los números de una lista numerada ("1. ", "2) ") ordenan, no afirman.
  texto = texto.replace(/^(\s*)\d{1,2}[.)](?=\s)/gm, '$1')
  for (const m of texto.matchAll(/\d[\d\s  .,]*\d|\d/g)) {
    const limpio = m[0].replace(/[\s  ]/g, '')
    // "4.237" o "4,237" con grupos de 3 son miles; ",75" final son decimales.
    const entero = limpio.replace(/[.,](?=\d{3}(\D|$))/g, '').split(/[.,]/)[0]
    if (entero) salida.push(String(Number(entero)))
  }
  return salida
}

/** Cifras que la respuesta puede usar: las de los datos consultados, la pregunta y la fecha. */
function cifrasPermitidas(resultados: unknown[], pregunta: string, hoy: string): Set<string> {
  // En los datos (fechas "2026-09", textos) cada grupo de dígitos cuenta solo:
  // "2026-09" son 2026 y 9, no 202609. Además se aceptan como cifras normales.
  const grupos = (s: string) =>
    s
      .split(/\D+/)
      .filter(Boolean)
      .map((n) => String(Number(n)))
  const permitidas = new Set<string>([...cifras(pregunta), ...grupos(pregunta), ...grupos(hoy)])
  const recorrer = (x: unknown) => {
    if (Array.isArray(x)) {
      permitidas.add(String(x.length))
      x.forEach(recorrer)
    } else if (x && typeof x === 'object') {
      Object.values(x).forEach(recorrer)
    } else if (typeof x === 'number') {
      permitidas.add(String(Math.trunc(x)))
      permitidas.add(String(Math.round(x)))
    } else if (typeof x === 'string') {
      for (const c of [...grupos(x), ...cifras(x)]) permitidas.add(c)
    }
  }
  resultados.forEach(recorrer)
  return permitidas
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const c = cors(request.headers.get('origin'), env)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: c })
    const ruta = new URL(request.url).pathname
    if (request.method !== 'POST' || ruta !== '/preguntar') return json({ error: 'Usá POST /preguntar' }, 404, c)

    const ip = request.headers.get('cf-connecting-ip') ?? 'anonimo'
    const { success } = await env.LIMITE.limit({ key: ip })
    if (!success) {
      return json({ error: 'Hiciste muchas preguntas seguidas. Esperá un minuto y volvé a intentar.' }, 429, c)
    }

    let pregunta = ''
    // La conversación previa la guarda el navegador, no el Worker. Sirve solo
    // para entender a quién o a qué se refiere una repregunta ("¿y cuántas
    // veces votó en contra?"); las cifras igual salen de las herramientas.
    const historial: Mensaje[] = []
    try {
      const cuerpo = (await request.json()) as { pregunta?: unknown; historial?: unknown }
      pregunta = typeof cuerpo.pregunta === 'string' ? cuerpo.pregunta.trim() : ''
      if (Array.isArray(cuerpo.historial)) {
        for (const t of cuerpo.historial.slice(-MAX_TURNOS)) {
          const p = (t as { pregunta?: unknown })?.pregunta
          const r = (t as { respuesta?: unknown })?.respuesta
          if (typeof p !== 'string' || typeof r !== 'string') continue
          historial.push({ role: 'user', content: p.slice(0, MAX_PREGUNTA) })
          historial.push({ role: 'assistant', content: r.slice(0, MAX_RESPUESTA_PREVIA) })
        }
      }
    } catch {
      /* cuerpo inválido */
    }
    if (!pregunta) return json({ error: 'Falta la pregunta.' }, 400, c)
    if (pregunta.length > MAX_PREGUNTA) return json({ error: `La pregunta pasa de ${MAX_PREGUNTA} caracteres.` }, 400, c)

    if (!cacheDatos || cacheDatos.hasta < Date.now()) {
      cacheDatos = { datos: await cargar<Datos>(`${env.DATOS_URL}asistente.json?v=${VERSION_DATOS}`), hasta: Date.now() + VIGENCIA_MS }
    }
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date())
    // La versión del Worker va en la clave: un despliegue nuevo no reusa
    // respuestas guardadas por el anterior.
    const claveCache = historial.length
      ? null
      : `${VERSION_WORKER}|${hoy}|${plano(pregunta).replace(/[^a-z0-9ñ]+/g, ' ').trim()}`
    const guardada = claveCache ? cacheRespuestas.get(claveCache) : undefined
    if (guardada && guardada.hasta > Date.now()) return json(guardada.cuerpo, 200, c)

    const ctx: Contexto = {
      datos: cacheDatos.datos,
      sitio: env.SITIO_URL.replace(/\/$/, ''),
      votaciones: async () => {
        if (!cacheVotaciones || cacheVotaciones.hasta < Date.now()) {
          const v = await cargar<{ filas: FilaVotacion[] }>(`${env.DATOS_URL}asistente-votaciones.json?v=${VERSION_DATOS}`)
          cacheVotaciones = { filas: v.filas, hasta: Date.now() + VIGENCIA_MS }
        }
        return cacheVotaciones.filas
      },
    }

    // Preguntas comunes e inequívocas: plantilla sobre los datos, sin IA.
    // No gastan cupo y no pueden inventar. Solo sin conversación previa: una
    // repregunta necesita entender el contexto.
    const saludo = respuestaSaludo(pregunta)
    if (saludo) return json({ ...saludo, modelo: 'directo' }, 200, c)
    if (!historial.length) {
      const directa = await respuestaDirecta(pregunta, ctx)
      if (directa) return json({ ...directa, modelo: 'directo' }, 200, c)
    }

    const mensajes: Mensaje[] = [
      {
        role: 'system',
        content: `${SISTEMA_BASE}\n\nHoy es ${hoy} (hora de Costa Rica). Las actas se publican días después de cada sesión.`,
      },
      ...historial,
      { role: 'user', content: pregunta },
    ]
    const consultas: { herramienta: string; argumentos: unknown }[] = []
    const enlaces: Enlace[] = []
    const notas = new Map<string, string[]>()
    const articulos: string[] = []
    let modelo = ''

    // Cada proveedor gratuito en orden. Un modelo que dijo "sin cupo" no se
    // vuelve a intentar hasta que pase la espera que pidió.
    const modelosGroq = env.GROQ_API_KEY ? (env.MODELOS_GROQ ? env.MODELOS_GROQ.split(',').map((s) => s.trim()) : MODELOS_GROQ) : []
    /** Milisegundos hasta que el primer modelo de Groq vuelva a tener cupo. */
    const esperaGroq = () => Math.min(...modelosGroq.map((m) => (agotados.get(m) ?? 0) - Date.now()))
    const pedirUnaVez = async (): Promise<Respuesta> => {
      const candidatos = [...modelosGroq.filter((m) => (agotados.get(m) ?? 0) < Date.now()), 'workers-ai', 'workers-ai']
      let ultimo: unknown = null
      let sinCupo: SinCupo | null = null
      for (const m of candidatos) {
        try {
          modelo = m
          return m === 'workers-ai'
            ? await workersAI(env.AI, mensajes, DEFINICIONES)
            : await groq(env.GROQ_API_KEY!, m, mensajes, DEFINICIONES)
        } catch (e) {
          ultimo = e
          if (e instanceof SinCupo) {
            sinCupo = e
            agotados.set(m, Date.now() + e.segundos * 1000)
            if (m === 'workers-ai') break
          }
          console.log(`${m} falló: ${String(e).slice(0, 160)}`)
        }
      }
      // Si alguno estaba sin cupo, eso es lo que hay que decirle a la persona.
      throw sinCupo ?? ultimo
    }
    // El cupo de Groq se mide por minuto: si el primero en liberarse está a
    // pocos segundos, se espera aquí (no gasta CPU del Worker) antes que
    // devolver un error.
    const pedir = async (): Promise<Respuesta> => {
      try {
        return await pedirUnaVez()
      } catch (e) {
        const espera = esperaGroq()
        if (!(e instanceof SinCupo) || espera > 20_000) throw e
        console.log(`Esperando ${Math.ceil(espera / 1000)} s al cupo de Groq`)
        await new Promise((ok) => setTimeout(ok, Math.max(espera, 0) + 500))
        return await pedirUnaVez()
      }
    }

    const resultados: unknown[] = []
    let corregida = false
    try {
      for (let paso = 0; paso < MAX_PASOS + 1; paso++) {
        const r = await pedir()
        if (!r.llamadas.length) {
          // Verificador de cifras: toda cifra de la respuesta tiene que estar
          // en lo que devolvieron las herramientas (o en la pregunta o la
          // fecha). Si no, una corrección; si insiste, no se publica.
          const permitidas = cifrasPermitidas(resultados, pregunta, hoy)
          const sueltas = [...new Set(cifras(r.texto ?? '').filter((n) => !permitidas.has(n)))]
          if (sueltas.length) {
            console.log(`Cifras sin respaldo (${modelo}): ${sueltas.join(', ')}`)
            if (!corregida) {
              corregida = true
              mensajes.push({ role: 'assistant', content: r.texto ?? '' })
              mensajes.push({
                role: 'user',
                content: `Revisión automática: tu respuesta tiene cifras que no aparecen en los datos consultados (${sueltas.join(', ')}). Reescribila usando solo cifras de los datos que devolvieron las herramientas, o consultá la herramienta que corresponde. Si no tenés el dato, decí "No tengo ese dato oficial".`,
              })
              continue
            }
            return json(
              {
                respuesta:
                  'No pude verificar esa respuesta con los datos oficiales del sitio, así que prefiero no darla. Probá preguntarlo de otra forma o revisá la sección correspondiente.',
                consultas,
                enlaces: [],
                modelo,
              },
              200,
              c
            )
          }
          const unicos = enlaces.filter((e, i) => enlaces.findIndex((x) => x.url === e.url) === i).slice(0, 4)
          const cuerpo = {
            respuesta: completar(r.texto?.trim() || 'No tengo ese dato oficial.', notas, articulos),
            consultas,
            enlaces: unicos,
            modelo,
          }
          if (claveCache && consultas.length) {
            if (cacheRespuestas.size > 200) cacheRespuestas.clear()
            cacheRespuestas.set(claveCache, { cuerpo, hasta: Date.now() + VIGENCIA_MS })
          }
          return json(cuerpo, 200, c)
        }
        mensajes.push({
          role: 'assistant',
          content: r.texto,
          tool_calls: r.llamadas.map((l) => ({ id: l.id, type: 'function', function: { name: l.nombre, arguments: l.argumentos } })),
        })
        for (const l of r.llamadas) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(l.argumentos || '{}')
          } catch {
            /* argumentos inválidos: la herramienta lo dirá */
          }
          const res = await ejecutar(ctx, l.nombre, args)
          consultas.push({ herramienta: l.nombre, argumentos: args })
          enlaces.push(...res.enlaces)
          notasEn(res.datos, notas)
          resultados.push(res.datos)
          if (l.nombre === 'glosario') {
            for (const g of ((res.datos as { terminos?: { articulo: string }[] }).terminos ?? [])) articulos.push(g.articulo)
          }
          mensajes.push({ role: 'tool', tool_call_id: l.id, content: JSON.stringify(res.datos) })
        }
      }
      return json({ error: 'La pregunta necesitó demasiados pasos. Probá hacerla más concreta.' }, 422, c)
    } catch (e) {
      if (e instanceof SinCupo) {
        // Groq devuelve cupo de a poco: si algún modelo vuelve en minutos, es
        // demanda del momento, no el límite del día.
        const minutos = Math.ceil(esperaGroq() / 60_000)
        return json(
          {
            error:
              minutos <= 15
                ? `Hay muchas preguntas en este momento y el cupo gratuito está lleno. Probá de nuevo en ${minutos <= 1 ? 'un minuto' : `${minutos} minutos`}.`
                : 'El asistente llegó a su límite gratuito de hoy. Probá de nuevo más tarde o mañana.',
          },
          503,
          c
        )
      }
      console.log(`Error: ${String(e).slice(0, 300)}`)
      return json({ error: 'El asistente no pudo responder ahora. Probá de nuevo en un rato.' }, 502, c)
    }
  },
} satisfies ExportedHandler<Env>
