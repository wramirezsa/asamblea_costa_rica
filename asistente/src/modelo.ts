/**
 * Los modelos de IA, detrás de un mismo formato (mensajes de chat completions).
 *
 * Principal: Groq, plan gratuito, modelo openai/gpt-oss-120b (el mismo que usa
 * RC Tech). Respaldo: Workers AI de Cloudflare con el mismo modelo, plan
 * gratuito de 10 000 neuronas al día. Ninguno puede cobrar: el plan gratis de
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

export class SinCupo extends Error {}

const MODELO_GROQ = 'openai/gpt-oss-120b'
const MODELO_CF = '@cf/openai/gpt-oss-120b'

export async function groq(clave: string, mensajes: Mensaje[], herramientas: readonly unknown[]): Promise<Respuesta> {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO_GROQ,
      messages: mensajes,
      tools: herramientas,
      tool_choice: 'auto',
      temperature: 0.2,
      max_completion_tokens: 900,
      reasoning_effort: 'low',
    }),
  })
  if (r.status === 429) throw new SinCupo('Groq: límite del plan gratuito')
  if (!r.ok) throw new Error(`Groq respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const j = (await r.json()) as {
    choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[]
  }
  const m = j.choices[0].message
  return {
    texto: m.content,
    llamadas: (m.tool_calls ?? []).map((t) => ({ id: t.id, nombre: t.function.name, argumentos: t.function.arguments })),
  }
}

/**
 * Workers AI: por el binding, gpt-oss usa el formato de la API Responses.
 * Se traducen los mensajes de ida y la salida de vuelta.
 */
export async function workersAI(ai: Ai, mensajes: Mensaje[], herramientas: readonly unknown[]): Promise<Respuesta> {
  const input: unknown[] = []
  for (const m of mensajes) {
    if (m.role === 'tool') {
      input.push({ type: 'function_call_output', call_id: m.tool_call_id, output: m.content })
    } else if (m.role === 'assistant') {
      if (m.content) input.push({ role: 'assistant', content: m.content })
      for (const t of m.tool_calls ?? []) {
        input.push({ type: 'function_call', call_id: t.id, name: t.function.name, arguments: t.function.arguments })
      }
    } else {
      input.push({ role: m.role, content: m.content })
    }
  }
  const tools = (herramientas as { function: { name: string; description: string; parameters: unknown } }[]).map((h) => ({
    type: 'function',
    name: h.function.name,
    description: h.function.description,
    parameters: h.function.parameters,
  }))
  let salida: { output?: { type: string; name?: string; arguments?: string; call_id?: string; content?: { type: string; text?: string }[] }[] }
  try {
    // El tipo del binding no conoce todavía la forma Responses de este modelo.
    salida = (await (ai.run as unknown as (m: string, o: unknown) => Promise<unknown>)(MODELO_CF, {
      input,
      tools,
      reasoning: { effort: 'low' },
    })) as typeof salida
  } catch (e) {
    const texto = String(e)
    if (/limit|quota|neuron|4006|capacity/i.test(texto)) throw new SinCupo('Workers AI: límite diario gratuito')
    throw e
  }
  const llamadas: LlamadaHerramienta[] = []
  const textos: string[] = []
  for (const item of salida.output ?? []) {
    if (item.type === 'function_call' && item.name) {
      llamadas.push({ id: item.call_id ?? crypto.randomUUID(), nombre: item.name, argumentos: item.arguments ?? '{}' })
    } else if (item.type === 'message') {
      for (const c of item.content ?? []) if (c.type === 'output_text' && c.text) textos.push(c.text)
    }
  }
  return { texto: textos.join('\n') || null, llamadas }
}
