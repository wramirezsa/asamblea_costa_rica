import { readFileSync } from 'node:fs'
import { ejecutar, type Contexto } from '../src/herramientas.ts'
const datos = JSON.parse(readFileSync('../web/public/datos/asistente.json', 'utf8'))
const ctx: Contexto = { datos, sitio: 'https://sitio', votaciones: async () => [] }
for (const f of ['Frente Amplio', 'FA', 'PFA', 'liberacion', 'PPSO']) {
  const r = await ejecutar(ctx, 'listar_diputaciones', { fraccion: f })
  console.log(f, '->', (r.datos as { cantidad: number }).cantidad)
}
