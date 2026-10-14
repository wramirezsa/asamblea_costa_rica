/**
 * Respuestas directas, sin IA (ADR-030).
 *
 * Las preguntas más comunes (las sugeridas en la página y unas pocas formas
 * inequívocas) se responden con plantillas sobre los mismos datos. No gastan
 * el cupo gratuito de la IA, no pueden inventar nada y salen al instante.
 * Si la pregunta no calza con claridad en un patrón, se devuelve null y la
 * responde la IA como siempre.
 */

import { ejecutar, type Contexto, type Datos, type Enlace } from './herramientas'

export interface Directa {
  respuesta: string
  consultas: { herramienta: string; argumentos: unknown }[]
  enlaces: Enlace[]
}

type Diputacion = Datos['diputaciones'][number]

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']

function plano(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function miles(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function colones(n: number): string {
  return `₡${miles(n)}`
}

function fecha(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${a}`
}

function mes(iso: string): string {
  const [a, m] = iso.split('-').map(Number)
  return `${MESES[m - 1]} de ${a}`
}

function lista(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

function fichas(ctx: Contexto, dips: Diputacion[]): Enlace[] {
  return dips.slice(0, 3).map((d) => ({ texto: `Ficha de ${d.nombre}`, url: `${ctx.sitio}/diputado/${d.slug}` }))
}

/** Una fracción por sigla o nombre ("PLN", "Liberación Nacional", "frente amplio"). */
function fraccionDe(datos: Datos, texto: string) {
  const q = plano(texto).replace(/^(el|la|los|las) /, '').replace(/^partido /, '')
  if (!q) return null
  const coinciden = datos.composicion.fracciones.filter(
    (f) => plano(f.codigo) === q || plano(f.nombre ?? '').includes(q)
  )
  return coinciden.length === 1 ? coinciden[0] : null
}

/** Una sola diputación cuyo nombre contiene todas las palabras dadas. */
function personaDe(datos: Datos, texto: string): Diputacion | null {
  const palabras = plano(texto)
    .split(' ')
    .filter((p) => p.length > 2 && !['diputado', 'diputada', 'diputacion', 'don', 'dona'].includes(p))
  if (!palabras.length) return null
  const coinciden = datos.diputaciones.filter((d) => {
    const n = plano(d.nombre)
    return palabras.every((p) => n.includes(p))
  })
  return coinciden.length === 1 ? coinciden[0] : null
}

function notas(d: Diputacion): string {
  return d.notas_oficiales.length ? `\n\nNota oficial de la Asamblea: ${d.notas_oficiales.join(' ')}` : ''
}

function fichaPersona(d: Diputacion): string {
  const partes: string[] = [`${d.nombre} (${d.partido ?? 'sin fracción en el padrón'}, ${d.provincia ?? 'provincia sin dato oficial'})`]
  if (d.asistencia) {
    partes.push(`figura en la lista de presentes en ${d.asistencia.presente} de ${d.asistencia.sesiones} sesiones con acta`)
  }
  let texto = `${partes.join(' ')}.`
  if (d.votos) {
    texto += ` En las ${miles(d.votos.votaciones_del_periodo)} votaciones nominales del periodo votó a favor ${miles(d.votos.a_favor)} veces y en contra ${miles(d.votos.en_contra)}; en ${miles(d.votos.en_la_lista_sin_votar)} figuraba en la lista sin votar y en ${miles(d.votos.fuera_de_la_lista_de_la_votacion)} su nombre no aparece en la lista de esa votación.`
  }
  return texto + notas(d)
}

export async function respuestaDirecta(pregunta: string, ctx: Contexto): Promise<Directa | null> {
  const q = plano(pregunta)
  const d = ctx.datos
  const comp = d.composicion

  // Composición: "¿cuántas curules tiene cada partido?"
  if (/curules|escanos|bancadas?/.test(q) && /cada (partido|fraccion|bancada)|por (partido|fraccion|bancada)|reparten|composicion/.test(q)) {
    const res = await ejecutar(ctx, 'composicion', {})
    const filas = [...comp.fracciones].sort((a, b) => b.escanos - a.escanos)
    return {
      respuesta: `Son ${comp.total} curules: ${lista(filas.map((f) => `${f.nombre ?? f.codigo} (${f.codigo}) ${f.escanos}`))}. La mayoría simple es de ${comp.mayoria_simple} votos y la calificada, de ${comp.mayoria_calificada}.`,
      consultas: [{ herramienta: 'composicion', argumentos: {} }],
      enlaces: res.enlaces,
    }
  }

  // "¿Cuántas curules tiene el PLN?"
  const curules = /cuantas (curules|diputaciones|diputados|escanos) (tiene|tienen) (.+)$/.exec(q)
  if (curules) {
    const f = fraccionDe(d, curules[3])
    if (f) {
      return {
        respuesta: `${f.nombre ?? f.codigo} (${f.codigo}) tiene ${f.escanos} de las ${comp.total} curules.`,
        consultas: [{ herramienta: 'composicion', argumentos: {} }],
        enlaces: [{ texto: 'El Plenario', url: `${ctx.sitio}/` }],
      }
    }
  }

  // Mayorías y total
  if (/mayoria (simple|calificada|absoluta)/.test(q) && /(cuantos|votos|cuanto|que es)/.test(q)) {
    return {
      respuesta: `Con ${comp.total} curules, la mayoría simple es de ${comp.mayoria_simple} votos y la mayoría calificada (dos tercios), de ${comp.mayoria_calificada}. Son cálculo sobre el total de curules.`,
      consultas: [{ herramienta: 'composicion', argumentos: {} }],
      enlaces: [{ texto: 'El Plenario', url: `${ctx.sitio}/` }],
    }
  }
  if (/^cuantos (diputados|diputadas|diputaciones|diputados y diputadas) hay( en total| en la asamblea| en el plenario)?$/.test(q)) {
    return {
      respuesta: `Hay ${comp.total} diputaciones en el periodo ${d.periodo}.`,
      consultas: [{ herramienta: 'composicion', argumentos: {} }],
      enlaces: [{ texto: 'El Plenario', url: `${ctx.sitio}/` }],
    }
  }

  // Directorio
  if (/(quien|quienes) (preside|es el presidente|es la presidenta)/.test(q) || /presidente de la asamblea|presidenta de la asamblea/.test(q)) {
    const p = d.diputaciones.find((x) => plano(x.cargo_directorio ?? '').startsWith('presiden'))
    if (p) {
      return {
        respuesta: `${p.nombre} (${p.partido}, ${p.provincia}) ocupa la ${p.cargo_directorio} de la Asamblea Legislativa, según la integración oficial del Directorio.`,
        consultas: [{ herramienta: 'listar_diputaciones', argumentos: { solo_directorio: true } }],
        enlaces: fichas(ctx, [p]),
      }
    }
  }
  if (/(quienes|quien) (integran|forman|conforman|estan en) el directorio|^directorio( legislativo)?$/.test(q)) {
    const orden = ['presidencia', 'vicepresidencia', 'primera secretaria', 'segunda secretaria', 'primera prosecretaria', 'segunda prosecretaria']
    const rango = (c: string | null) => {
      const i = orden.indexOf(plano(c ?? ''))
      return i < 0 ? orden.length : i
    }
    const dir = d.diputaciones.filter((x) => x.cargo_directorio).sort((a, b) => rango(a.cargo_directorio) - rango(b.cargo_directorio))
    return {
      respuesta: `Son ${dir.length}: ${lista(dir.map((x) => `${x.nombre} (${x.cargo_directorio}, ${x.partido})`))}.`,
      consultas: [{ herramienta: 'listar_diputaciones', argumentos: { solo_directorio: true } }],
      enlaces: fichas(ctx, dir),
    }
  }

  // Glosario: "¿qué es una moción de fondo?", "¿qué significa revisión?"
  const termino = /^(que es|que significa|que quiere decir|que son) (una |un |la |el |las |los )?(.+?)( en una votacion| en el plenario)?$/.exec(q)
  if (termino) {
    const t = plano(termino[3])
    const g = d.glosario.filter((x) => {
      const n = plano(x.nombre)
      return n === t || n === `mocion de ${t}` || t === n.replace(/^mocion de /, '')
    })
    if (g.length === 1) {
      return {
        respuesta: `${g[0].nombre}: ${g[0].explicacion}\n\n(Reglamento de la Asamblea Legislativa, art. ${g[0].articulo}.)`,
        consultas: [{ herramienta: 'glosario', argumentos: { termino: termino[3] } }],
        enlaces: [{ texto: 'Glosario en Votaciones', url: `${ctx.sitio}/votaciones` }],
      }
    }
  }

  // Proyectos más votados
  if (/(cual|que) (proyecto|expediente) (tiene|tuvo|acumula) mas votaciones|proyectos? (con )?mas votad/.test(q)) {
    const p = d.proyectos[0]
    if (p) {
      return {
        respuesta: `El expediente ${p.numero}, «${p.nombre ?? 'sin nombre en las actas'}», con ${miles(p.votaciones)} votaciones en ${p.sesiones} sesiones, entre el ${fecha(p.desde)} y el ${fecha(p.hasta)}. Cada moción y su revisión se votan aparte; por eso un proyecto muy disputado acumula miles.`,
        consultas: [{ herramienta: 'proyectos_mas_votados', argumentos: {} }],
        enlaces: [{ texto: 'Proyectos con más votaciones', url: `${ctx.sitio}/votaciones` }],
      }
    }
  }

  // La semana: "¿quién no figura entre los presentes esta semana?"
  if (/(esta|ultima) semana/.test(q) && /(presentes|ausen|falt|no (estuv|asist|figur))/.test(q)) {
    const s = d.semana as {
      desde: string
      hasta: string
      sesiones: number
      ausencias: { nombre: string; fraccion: string | null; veces: number; de: number }[]
    } | null
    if (s) {
      const aus = s.ausencias
      return {
        respuesta: aus.length
          ? `Del ${fecha(s.desde)} al ${fecha(s.hasta)} hubo ${s.sesiones} sesiones con acta. Son ${aus.length} las diputaciones que no figuran en la lista de presentes de alguna: ${lista(aus.map((a) => `${a.nombre} (${a.fraccion}, ${a.veces} de ${a.de})`))}. El acta no dice si una ausencia tuvo permiso.`
          : `Del ${fecha(s.desde)} al ${fecha(s.hasta)} todas las diputaciones figuran en las listas de presentes.`,
        consultas: [{ herramienta: 'semana', argumentos: {} }],
        enlaces: [{ texto: 'La última semana', url: `${ctx.sitio}/votaciones` }],
      }
    }
  }

  // Combustible y remuneración: "¿quién recibió más combustible el último mes?"
  const gasto = /quien (recibio|recibe|gasto|gana|cobro) (mas|menos) (combustible|remuneracion|salario|dinero)/.exec(q)
  if (gasto) {
    const criterio = gasto[3] === 'combustible' ? 'combustible' : 'remuneracion_bruta'
    const res = await ejecutar(ctx, 'ranking', { criterio, orden: gasto[2] === 'mas' ? 'mayor' : 'menor', cantidad: 3 })
    const r = res.datos as { resultado: { nombre: string; fraccion: string; valor: number; mes?: string }[]; empatados_fuera_de_la_lista: number }
    const primero = r.resultado[0]
    if (primero) {
      const empate = r.resultado.filter((x) => x.valor === primero.valor)
      const quien = empate.length > 1 ? `${lista(empate.map((x) => `${x.nombre} (${x.fraccion})`))}, empatados,` : `${primero.nombre} (${primero.fraccion})`
      const dip = d.diputaciones.find((x) => x.nombre === primero.nombre)
      return {
        respuesta: `${quien} con ${colones(primero.valor)} de ${criterio === 'combustible' ? 'combustible' : 'remuneración bruta'} en ${primero.mes ? mes(primero.mes) : 'el último mes publicado'}, el último mes publicado por la Asamblea.${dip ? notas(dip) : ''}`,
        consultas: [{ herramienta: 'ranking', argumentos: { criterio } }],
        enlaces: res.enlaces,
      }
    }
  }

  // Una persona: "¿cómo vota José María Villalta?"
  const persona = /^(como vota|como ha votado|como voto|asistencia de|cuanto asiste|cuanto asistio) (el diputado |la diputada |la diputacion )?(.+)$/.exec(q)
  if (persona) {
    const p = personaDe(d, persona[3])
    if (p) {
      return {
        respuesta: fichaPersona(p),
        consultas: [{ herramienta: 'buscar_diputacion', argumentos: { nombre: persona[3] } }],
        enlaces: fichas(ctx, [p]),
      }
    }
  }

  return null
}
