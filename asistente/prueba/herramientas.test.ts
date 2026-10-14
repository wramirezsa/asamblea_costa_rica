import { readFileSync } from 'node:fs'
import { ejecutar, type Contexto } from '../src/herramientas.ts'

const datos = JSON.parse(readFileSync('../web/public/datos/asistente.json', 'utf8'))
const filas = JSON.parse(readFileSync('../web/public/datos/asistente-votaciones.json', 'utf8')).filas
const ctx: Contexto = { datos, sitio: 'https://sitio', votaciones: async () => filas }

const casos: [string, Record<string, unknown>][] = [
  ['buscar_diputacion', { nombre: 'villalta' }],
  ['buscar_diputacion', { nombre: 'mora' }],
  ['ranking', { criterio: 'asistencia', orden: 'menor', cantidad: 3 }],
  ['ranking', { criterio: 'combustible', orden: 'mayor', cantidad: 3, fraccion: 'pln' }],
  ['buscar_votaciones', { expediente: '24.290' }],
  ['buscar_votaciones', { texto: 'presupuesto' }],
  ['glosario', { termino: 'revision' }],
  ['composicion', {}],
]
for (const [n, a] of casos) {
  const r = await ejecutar(ctx, n, a)
  console.log('==', n, JSON.stringify(a), '\n', JSON.stringify(r.datos).slice(0, 420), '\n  enlaces:', r.enlaces.map((e) => e.url).join(' '))
}
