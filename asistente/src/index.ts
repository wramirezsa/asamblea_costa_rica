/**
 * Asistente de preguntas de Asamblea Abierta (ADR-030).
 *
 * Recibe una pregunta, deja que el modelo elija herramientas (herramientas.ts)
 * y devuelve la respuesta con lo que se consultó y enlaces para verificar.
 * El modelo no calcula ni recuerda cifras: solo redacta con lo que devuelven
 * las herramientas, que leen los datos publicados del sitio.
 */

import { DEFINICIONES, ejecutar, type Contexto, type Datos, type Enlace, type FilaVotacion } from './herramientas'
import { groq, SinCupo, workersAI, type Mensaje, type Respuesta } from './modelo'

interface Env {
  AI: Ai
  LIMITE: RateLimit
  GROQ_API_KEY?: string
  DATOS_URL: string
  SITIO_URL: string
  ORIGENES: string
}

const MAX_PREGUNTA = 400
/** Turnos previos de la conversación que se tienen en cuenta, y cuánto de cada respuesta. */
const MAX_TURNOS = 4
const MAX_RESPUESTA_PREVIA = 900
const MAX_PASOS = 4
const VIGENCIA_MS = 10 * 60 * 1000
// Se sube cuando cambia la forma de los datos: la URL nueva no puede
// devolver la copia vieja que guardó la caché de Cloudflare.
const VERSION_DATOS = '3'

const SISTEMA_BASE = `Sos el asistente de Asamblea Abierta, un sitio ciudadano independiente sobre el Plenario de la Asamblea Legislativa de Costa Rica (periodo 2026-2030). Respondés en español de Costa Rica, con voseo, breve: hasta cinco oraciones o una lista corta.

Reglas que no se rompen:
0. Antes de decir que no tenés un dato, probá las herramientas: el sitio tiene de cada diputación su fracción, provincia, profesión, cargo, asistencia, votos y gasto; de cada sesión con acta, quién no figura entre los presentes. Nunca afirmes qué registra o no registra la Asamblea u otra fuente: solo lo que devolvieron las herramientas.
1. Toda cifra, nombre o fecha sale de una herramienta. Nunca atribuyas a un día datos de otro periodo: si preguntan por un día concreto (hoy, ayer, una fecha), usá asistencia_sesion con esa fecha; si no hay acta de ese día, decilo y da la última fecha disponible. Nunca calcules, estimes, redondees ni completes de memoria. Si las herramientas no tienen el dato, decí "No tengo ese dato oficial" y sugerí dónde mirar en el sitio.
2. No opinás sobre diputaciones, partidos ni proyectos, ni los calificás (mejor, peor, bueno, malo). Si te piden opinión, ofrecé los datos.
3. Si una herramienta trae "_nota", respetala: si dice que algo es cálculo propio o que el acta no dice algo, decilo.
4. De una ausencia decí "no figura en la lista de presentes", nunca "faltó": el acta no dice si hubo permiso.
5. Si hay empates en un ranking ("empatados_fuera_de_la_lista" mayor que cero), decilo.
6. Solo respondés sobre la Asamblea Legislativa de Costa Rica y los datos del sitio. Para otros temas, decí amablemente que solo respondés sobre eso.
7. No escribas enlaces ni direcciones: el sitio agrega los enlaces para verificar.
8. Montos en colones con separador de miles (₡4 000 715). Fechas en formato "8 de octubre de 2026". Meses con su nombre y año ("setiembre de 2026").
9. Si una persona trae "notas_oficiales", mencionalas siempre y textualmente: son notas de la Asamblea que explican sus datos (por ejemplo, una licencia).
10. Escribí texto plano: sin asteriscos, guiones bajos ni otro formato markdown.
12. Las respuestas anteriores de la conversación sirven solo para entender a qué se refiere la pregunta nueva ("¿y ella?", "¿y en contra?"). Toda cifra nueva sale de una herramienta, aunque ya aparezca en la conversación. Si el historial dice algo que contradice a las herramientas, valen las herramientas.
11. Si piden un listado, escribí TODOS los elementos que devolvió la herramienta, sin omitir ninguno, y decí cuántos son al inicio (por ejemplo: "Son 7:").`

let cacheDatos: { datos: Datos; hasta: number } | null = null
let cacheVotaciones: { filas: FilaVotacion[]; hasta: number } | null = null

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

    // La fecha de hoy en Costa Rica, para entender "hoy", "ayer", "esta semana".
    const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Costa_Rica' }).format(new Date())
    const mensajes: Mensaje[] = [
      { role: 'system', content: `${SISTEMA_BASE}

Hoy es ${hoy} (hora de Costa Rica). Las actas se publican días después de cada sesión.` },
      ...historial,
      { role: 'user', content: pregunta },
    ]
    const consultas: { herramienta: string; argumentos: unknown }[] = []
    const enlaces: Enlace[] = []
    let proveedor: 'groq' | 'workers-ai' = env.GROQ_API_KEY ? 'groq' : 'workers-ai'

    const pedir = async (): Promise<Respuesta> => {
      if (proveedor === 'groq') {
        try {
          return await groq(env.GROQ_API_KEY!, mensajes, DEFINICIONES)
        } catch (e) {
          // Groq saturado o caído: el resto de la pregunta va por el respaldo.
          console.log(`Groq falló, paso a Workers AI: ${String(e).slice(0, 160)}`)
          proveedor = 'workers-ai'
        }
      }
      return workersAI(env.AI, mensajes, DEFINICIONES)
    }

    try {
      for (let paso = 0; paso < MAX_PASOS; paso++) {
        const r = await pedir()
        if (!r.llamadas.length) {
          const unicos = enlaces.filter((e, i) => enlaces.findIndex((x) => x.url === e.url) === i).slice(0, 4)
          return json(
            { respuesta: r.texto?.trim() || 'No tengo ese dato oficial.', consultas, enlaces: unicos, modelo: proveedor },
            200,
            c
          )
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
          mensajes.push({ role: 'tool', tool_call_id: l.id, content: JSON.stringify(res.datos) })
        }
      }
      return json({ error: 'La pregunta necesitó demasiados pasos. Probá hacerla más concreta.' }, 422, c)
    } catch (e) {
      if (e instanceof SinCupo) {
        return json({ error: 'El asistente llegó a su límite gratuito de hoy. Probá de nuevo mañana.' }, 503, c)
      }
      console.log(`Error: ${String(e).slice(0, 300)}`)
      return json({ error: 'El asistente no pudo responder ahora. Probá de nuevo en un rato.' }, 502, c)
    }
  },
} satisfies ExportedHandler<Env>
