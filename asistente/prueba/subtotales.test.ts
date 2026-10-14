// Los subtotales de listar_diputaciones deben dar los cuadres oficiales.
import { readFileSync } from 'node:fs'
import { ejecutar, type Contexto } from '../src/herramientas.ts'
const datos = JSON.parse(readFileSync('../web/public/datos/asistente.json', 'utf8'))
const ctx: Contexto = { datos, sitio: 'https://sitio', votaciones: async () => [] }
type D = { cantidad: number; por_fraccion: Record<string, number>; por_provincia: Record<string, number> }
const todo = (await ejecutar(ctx, 'listar_diputaciones', {})).datos as D
const fr = Object.values(todo.por_fraccion).join('/')
const pr = Object.values(todo.por_provincia).join('/')
console.log(todo.cantidad, fr, pr, todo.por_fraccion)
const cartago = (await ejecutar(ctx, 'listar_diputaciones', { provincia: 'Cartago' })).datos as D
console.log('Cartago', cartago.cantidad, cartago.por_fraccion)
process.exit(todo.cantidad === 57 && fr === '31/17/7/1/1' && pr === '18/12/6/6/5/5/5' ? 0 : 1)
