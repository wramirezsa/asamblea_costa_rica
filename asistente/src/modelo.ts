/**
 * Los modelos de IA, detrás de un mismo formato (mensajes de chat completions).
 *
 * Principal: Groq, plan gratuito, modelo openai/gpt-oss-120b (el mismo que usa
 * RC Tech) y, cuando se le acaba el cupo, qwen/qwen3.8-27b. Respaldo final:
 * Workers AI de Cloudflare con gpt-oss-120b, plan gratuito de 10 000 neuronas
 * al día. Ninguno puede cobrar: el plan gratis de
 * Workers no admite cobro por exceso y la cuenta de Groq no tiene tarjeta.
 */

export interface LlamadaHerramienta {
  id: string
  nombre: string
  argumentos: string
}

export type Mensaje =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export interface Respuesta {
  texto: string | null
  llamadas: LlamadaHerramienta[]
}

export class SinCupo extends Error {
  /** Segundos que pide esperar el proveedor, si los dice. */
  constructor(mensaje: string, public segundos = 60) {
    super(mensaje)
  }
}

/**
 * En orden. Cada modelo de Groq tiene su propio cupo gratuito (8 000 tokens
 * por minuto, 200 000 por día), así que el segundo entra cuando el primero se
 * llena. Qwen pasó la evaluación del 2026-10-14 sin cifras falsas. El chico
 * (gpt-oss-20b) no entra: inventó cifras ("Hay 6 diputados") y respondió
 * fuera de tema; menos respuestas antes que respuestas falsas (ADR-030).
 */
export const MODELOS_GROQ = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b']
const MODELO_CF = '@cf/openai/gpt-oss-120b'

export async function groq(clave: string, modelo: string, mensajes: Mensaje[], herramientas: readonly unknown[]): Promise<Respuesta> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo,
      messages: mensajes,
      tools: herramientas,
      tool_choice: 'auto',
      temperature: 0.2,
      max_completion_tokens: 700,
      reasoning_effort: 'low',
      // Qwen mezclaria su razonamiento (<think>) con la respuesta si no se le pide ocultarlo.
      ...(modelo.startsWith('qwen/') ? { reasoning_format: 'hidden' } : {}),
    }),
  })
  // Cuánto cupo queda (por minuto y por día), para saber qué límite se toca.
  const cupo = ['limit-requests', 'remaining-requests', 'limit-tokens', 'remaining-tokens', 'reset-tokens']
    .map((k) => `${k}=${r.headers.get(`x-ratelimit-${k}`)}`)
    .join(' ')
  console.log(`Groq ${modelo} ${r.status} ${cupo} retry-after=${r.headers.get('retry-after')}`)
  if (r.status === 429) throw new SinCupo(`Groq ${modelo}: límite del plan gratuito`, Number(r.headers.get('retry-after')) || 60)
  if (!r.ok) throw new Error(`Groq respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as {
    choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
  }
  const m = j.choices[0].message
  return {
    // Qwen omite content cuando llama herramientas (gpt-oss manda null).
    texto: m.content ?? null,
    llamadas: (m.tool_calls ?? []).map((t) => ({ id: t.id, nombre: t.function.name, argumentos: t.function.arguments })),
  }
}

/**
 * Workers AI. Se le manda el formato de chat (messages + tools anidados),
 * igual que a Groq; la salida puede venir en formato de chat (choices) o de
 * la API Responses (output), según el modelo: se aceptan las dos.
 */
export async function workersAI(ai: Ai, mensajes: Mensaje[], herramientas: readonly unknown[]): Promise<Respuesta> {
  type Salida = {
    choices?: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string | object } }[] } }[]
    output?: { type: string; name?: string; arguments?: string; call_id?: string; content?: { type: string; text?: string }[] }[]
    response?: string
    tool_calls?: { name: string; arguments: object }[]
  }
  let salida: Salida
  try {
    // El tipo del binding no conoce todavía todas las formas de este modelo.
    salida = (await (ai.run as unknown as (m: string, o: unknown) => Promise<unknown>)(MODELO_CF, {
      // Workers AI exige texto en content (no acepta null en el mensaje que
      // llama a una herramienta).
      messages: mensajes.map((m) => (m.role === 'assistant' && m.content == null ? { ...m, content: '' } : m)),
      tools: herramientas,
      reasoning_effort: 'low',
      max_tokens: 700,
    })) as Salida
  } catch (e) {
    const texto = String(e)
    if (/limit|quota|neuron|4006|capacity/i.test(texto)) throw new SinCupo('Workers AI: límite diario gratuito')
    throw e
  }
  const comoTexto = (a: string | object) => (typeof a === 'string' ? a : JSON.stringify(a))
  if (salida.choices?.length) {
    const m = salida.choices[0].message
    return {
      texto: m.content,
      llamadas: (m.tool_calls ?? []).map((t) => ({ id: t.id, nombre: t.function.name, argumentos: comoTexto(t.function.arguments) })),
    }
  }
  if (salida.output) {
    const llamadas: LlamadaHerramienta[] = []
    const textos: string[] = []
    for (const item of salida.output) {
      if (item.type === 'function_call' && item.name) {
        llamadas.push({ id: item.call_id ?? crypto.randomUUID(), nombre: item.name, argumentos: item.arguments ?? '{}' })
      } else if (item.type === 'message') {
        for (const c of item.content ?? []) if (c.type === 'output_text' && c.text) textos.push(c.text)
      }
    }
    return { texto: textos.join('\n') || null, llamadas }
  }
  return {
    texto: salida.response ?? null,
    llamadas: (salida.tool_calls ?? []).map((t) => ({ id: crypto.randomUUID(), nombre: t.name, argumentos: comoTexto(t.arguments) })),
  }
}
