import { readFileSync } from 'node:fs'
import { DEFINICIONES, ejecutar, type Contexto } from '../src/herramientas.ts'
const src = readFileSync('src/index.ts', 'utf8')
const sistema = src.slice(src.indexOf('const SISTEMA_BASE = `') + 22, src.indexOf('`', src.indexOf('const SISTEMA_BASE = `') + 22))
const tokens = (s: string) => Math.round(s.length / 3.6)
console.log('instrucciones ~', tokens(sistema), 'tokens')
console.log('herramientas  ~', tokens(JSON.stringify(DEFINICIONES)), 'tokens')
const datos = JSON.parse(readFileSync('../web/public/datos/asistente.json', 'utf8'))
const filas = JSON.parse(readFileSync('../web/public/datos/asistente-votaciones.json', 'utf8')).filas
const ctx: Contexto = { datos, sitio: 'https://wramirezsa.github.io/asamblea_costa_rica', votaciones: async () => filas }
for (const [n, a] of [['listar_diputaciones', {}], ['listar_diputaciones', { fraccion: 'PFA' }], ['buscar_diputacion', { nombre: 'Villalta' }], ['ranking', { criterio: 'asistencia', orden: 'menor' }], ['semana', {}], ['proyectos_mas_votados', {}], ['buscar_votaciones', { expediente: '24290' }], ['asistencia_sesion', {}]] as const) {
  const r = await ejecutar(ctx, n, a as Record<string, unknown>)
  console.log(n.padEnd(22), JSON.stringify(a).padEnd(22), '~', tokens(JSON.stringify(r.datos)), 'tokens')
}
