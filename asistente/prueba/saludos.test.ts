// Saludos y agradecimientos sin IA, sin tragarse preguntas reales.
import { respuestaSaludo } from '../src/directas.ts'
const si = ['hoa', 'Hola!', 'buenas', 'Hola, ¿cómo estás?', 'gracias', 'Muchas gracias!', 'ok gracias', 'pura vida']
const no = ['hola, ¿cómo vota Villalta?', 'gracias, ¿y en contra?', 'De donde es jose migual villalobos?', 'quien es Ola']
let mal = 0
for (const q of si) if (!respuestaSaludo(q)) { mal++; console.log('MAL (debía ser saludo):', q) }
for (const q of no) if (respuestaSaludo(q)) { mal++; console.log('MAL (no es saludo):', q) }
console.log(mal ? `${mal} mal` : 'todo bien')
process.exit(mal ? 1 : 0)
