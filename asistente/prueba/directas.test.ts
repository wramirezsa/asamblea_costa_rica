import { readFileSync } from 'node:fs'
import { respuestaDirecta } from '../src/directas.ts'
import type { Contexto } from '../src/herramientas.ts'
const datos = JSON.parse(readFileSync('../web/public/datos/asistente.json', 'utf8'))
const ctx: Contexto = { datos, sitio: 'https://sitio', votaciones: async () => [] }
const preguntas = [
  '¿Quién no figura entre los presentes esta semana?',
  '¿Cómo vota José María Villalta?',
  '¿Cuál proyecto tiene más votaciones?',
  '¿Qué es una moción de fondo?',
  '¿Cuántas curules tiene cada partido?',
  '¿Quién recibió más combustible el último mes?',
  '¿Cuántas curules tiene el PLN?',
  '¿Cuántas curules tiene el Frente Amplio?',
  '¿Cuántos votos se necesitan para una mayoría calificada?',
  '¿Cuántos diputados hay en total?',
  '¿Quién preside la Asamblea?',
  '¿Quiénes integran el Directorio?',
  '¿Qué significa una revisión en una votación?',
  'cómo vota Mora',
  '¿Quién es el mejor diputado?',
  '¿Cuál es la capital de Francia?',
]
for (const p of preguntas) {
  const r = await respuestaDirecta(p, ctx)
  console.log('==', p, '\n  ', r ? r.respuesta.replace(/\n+/g, ' / ').slice(0, 330) : '(va a la IA)')
}
