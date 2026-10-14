/**
 * Herramientas del asistente (ADR-030).
 *
 * La IA no calcula ni recuerda cifras: elige una de estas funciones y redacta
 * con lo que devuelve. Cada una lee los datos que publica el sitio
 * (datos/asistente.json, precalculado por el ETL) y devuelve enlaces para
 * verificar en la página.
 */

export interface Datos {
  periodo: string
  extraido: Record<string, string | null> | null
  composicion: {
    total: number
    mayoria_simple: number
    mayoria_calificada: number
    fracciones: { codigo: string; nombre: string | null; escanos: number }[]
    _nota: string
  }
  actas: {
    desde: string | null
    hasta: string | null
    sesiones: number
    votaciones: number
    votaciones_no_publicables: number
    sin_documento: string[]
  }
  proyectos: {
    numero: string
    nombre: string | null
    votaciones: number
    sesiones: number
    desde: string
    hasta: string
  }[]
  semana: Record<string, unknown> | null
  diputaciones: Diputacion[]
  sesiones: {
    fecha: string
    tipo: string
    numero: number
    con_lista_de_presentes: boolean
    presentes: number
    no_figuran: { nombre: string; fraccion: string | null }[]
  }[]
  /** Nombre(s) de cada expediente según las actas. */
  expedientes: Record<string, string[]>
  glosario: { nombre: string; articulo: string; explicacion: string }[]
}

interface Diputacion {
  slug: string
  nombre: string
  fraccion: string | null
  partido: string | null
  provincia: string | null
  cargo_directorio: string | null
  profesion: string | null
  asistencia: { presente: number; sesiones: number } | null
  votos: {
    a_favor: number
    en_contra: number
    en_la_lista_sin_votar: number
    fuera_de_la_lista_de_la_votacion: number
    votaciones_del_periodo: number
  } | null
  remuneracion: { mes: string; dieta: number | null; representacion: number | null; bruta: number | null } | null
  combustible: { mes: string; monto: number | null; renuncio: boolean } | null
  /** Oraciones de las notas oficiales de la Asamblea que la mencionan por nombre. */
  notas_oficiales: string[]
}

/** [clave, fecha, propuesta, expediente, a favor, en contra, no voto, resultado] */
export type FilaVotacion = [string, string, string | null, string | null, number | null, number | null, number | null, 'A' | 'R' | null]

export interface Enlace {
  texto: string
  url: string
}

export interface Contexto {
  datos: Datos
  sitio: string
  votaciones: () => Promise<FilaVotacion[]>
}

export interface Resultado {
  datos: unknown
  enlaces: Enlace[]
}

/** Definiciones en el formato de herramientas de chat completions. */
export const DEFINICIONES = [
  {
    type: 'function',
    function: {
      name: 'buscar_diputacion',
      description:
        'Datos de una diputación por nombre o apellido: fracción, provincia, cargo, asistencia al Plenario, cuántas veces votó a favor o en contra, y remuneración y combustible del último mes publicado.',
      parameters: {
        type: 'object',
        properties: { nombre: { type: 'string', description: 'Nombre o apellidos, por ejemplo "Villalta" o "Nogui Acosta".' } },
        required: ['nombre'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ranking',
      description:
        'Ordena las diputaciones por un criterio. Úsala para preguntas como quién asistió más o menos, quién votó en más votaciones, o quién recibió más combustible.',
      parameters: {
        type: 'object',
        properties: {
          criterio: {
            type: 'string',
            enum: ['asistencia', 'votos_emitidos', 'remuneracion_bruta', 'combustible'],
          },
          orden: { type: 'string', enum: ['mayor', 'menor'] },
          fraccion: { type: 'string', description: 'Sigla opcional: PPSO, PLN, PFA, PUSC, CAC.' },
          provincia: { type: 'string', description: 'Provincia opcional.' },
          cantidad: { type: 'integer', description: 'Cuántas mostrar, de 1 a 10. Por defecto 5.' },
        },
        required: ['criterio', 'orden'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_diputaciones',
      description:
        'Lista las diputaciones con su fracción, provincia, profesión y cargo en el Directorio. Filtrable por fracción (sigla o nombre, por ejemplo "PFA" o "Frente Amplio"), provincia o solo quienes integran el Directorio. Úsala para preguntas como quiénes son los de una provincia o partido, o a qué se dedican.',
      parameters: {
        type: 'object',
        properties: {
          fraccion: { type: 'string' },
          provincia: { type: 'string' },
          solo_directorio: { type: 'boolean' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'asistencia_sesion',
      description:
        'Quién no figura en la lista de presentes de una sesión concreta, por fecha (AAAA-MM-DD). Sin fecha, la última sesión con acta. Si no hay acta de esa fecha, lo dice y da la última disponible.',
      parameters: {
        type: 'object',
        properties: { fecha: { type: 'string', description: 'AAAA-MM-DD' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'composicion',
      description: 'Cuántas curules tiene cada fracción y cuántos votos hacen falta para mayoría simple y calificada.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'semana',
      description:
        'La última semana con actas: sesiones, votaciones, aprobadas y rechazadas, quién no figura entre los presentes y quién votó distinto a su bancada.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proyectos_mas_votados',
      description: 'Los expedientes (proyectos de ley) con más votaciones en el Plenario, con su nombre según el acta.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_votaciones',
      description:
        'Busca votaciones del Plenario por palabras del título o por número de expediente, opcionalmente entre fechas. Devuelve cuántas hay, cuántas se aprobaron o rechazaron y las más recientes.',
      parameters: {
        type: 'object',
        properties: {
          texto: { type: 'string', description: 'Palabras del título, por ejemplo "presupuesto" o "segundo debate".' },
          expediente: { type: 'string', description: 'Número de expediente, por ejemplo "24290".' },
          desde: { type: 'string', description: 'Fecha AAAA-MM-DD.' },
          hasta: { type: 'string', description: 'Fecha AAAA-MM-DD.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glosario',
      description: 'Qué significa un término del trámite legislativo (moción de fondo, revisión, primer debate, etc.), según el Reglamento.',
      parameters: {
        type: 'object',
        properties: { termino: { type: 'string' } },
        required: ['termino'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'sobre_los_datos',
      description: 'De qué fechas son los datos, qué periodo cubren las actas y qué no muestra el sitio.',
      parameters: { type: 'object', properties: {} },
    },
  },
] as const

function plano(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function ficha(ctx: Contexto, d: Diputacion): Enlace {
  return { texto: `Ficha de ${d.nombre}`, url: `${ctx.sitio}/diputado/${d.slug}` }
}

function buscarDiputacion(ctx: Contexto, args: { nombre?: string }): Resultado {
  const palabras = plano(args.nombre ?? '').split(/\s+/).filter((p) => p.length > 1)
  if (!palabras.length) return { datos: { error: 'Falta el nombre.' }, enlaces: [] }
  const coinciden = ctx.datos.diputaciones.filter((d) => {
    const n = plano(d.nombre)
    return palabras.every((p) => n.includes(p))
  })
  if (!coinciden.length) {
    return { datos: { encontradas: 0, nota: 'Ninguna diputación del periodo coincide con ese nombre.' }, enlaces: [] }
  }
  if (coinciden.length > 4) {
    return {
      datos: { encontradas: coinciden.length, nombres: coinciden.map((d) => d.nombre), nota: 'Hay varias: pedí el nombre completo.' },
      enlaces: [],
    }
  }
  return {
    datos: {
      encontradas: coinciden.length,
      diputaciones: coinciden.map(({ slug: _s, ...resto }) => ({ ...resto, fraccion: nombreFraccion(ctx, resto as Diputacion) })),
      _nota:
        'Asistencia: sesiones en que figura en la lista de presentes del acta. Votos: votaciones nominales publicadas del periodo. «fuera_de_la_lista_de_la_votacion» NO es ausencia a la sesión: en esas votaciones su nombre no aparece en la lista (no estaba en el salón al votar o no se registró); la asistencia es solo el dato de asistencia. «en_la_lista_sin_votar»: figura en la lista de la votación pero no votó. Montos en colones, tal como los publica la Asamblea.',
    },
    enlaces: coinciden.map((d) => ficha(ctx, d)),
  }
}

function ranking(
  ctx: Contexto,
  args: { criterio?: string; orden?: string; fraccion?: string; provincia?: string; cantidad?: number }
): Resultado {
  const valor = (d: Diputacion): number | null => {
    switch (args.criterio) {
      case 'asistencia':
        return d.asistencia?.presente ?? null
      case 'votos_emitidos':
        return d.votos ? d.votos.a_favor + d.votos.en_contra : null
      case 'remuneracion_bruta':
        return d.remuneracion?.bruta ?? null
      case 'combustible':
        return d.combustible?.monto ?? null
      default:
        return null
    }
  }
  let lista = ctx.datos.diputaciones
  if (args.fraccion) lista = lista.filter((d) => coincideFraccion(ctx, d, args.fraccion!))
  if (args.provincia) lista = lista.filter((d) => plano(d.provincia ?? '') === plano(args.provincia!))
  const con = lista.map((d) => ({ d, v: valor(d) })).filter((x) => x.v !== null) as { d: Diputacion; v: number }[]
  const sinDato = lista.length - con.length
  con.sort((a, b) => (args.orden === 'menor' ? a.v - b.v : b.v - a.v))
  const n = Math.min(10, Math.max(1, args.cantidad ?? 5))
  const corte = con[n - 1]?.v
  // Si hay empate en el corte, se dice: no se elige a nadie por su cuenta.
  const empatados = corte === undefined ? 0 : con.slice(n).filter((x) => x.v === corte).length
  const ejemplo = ctx.datos.diputaciones.find((d) => d.asistencia)?.asistencia
  return {
    datos: {
      criterio: args.criterio,
      orden: args.orden,
      filtro: { fraccion: args.fraccion ?? null, provincia: args.provincia ?? null },
      resultado: con.slice(0, n).map(({ d, v }) => ({
        nombre: d.nombre,
        fraccion: d.partido,
        provincia: d.provincia,
        valor: v,
        ...(args.criterio === 'remuneracion_bruta' && d.remuneracion ? { mes: d.remuneracion.mes } : {}),
        ...(args.criterio === 'combustible' && d.combustible ? { mes: d.combustible.mes } : {}),
        ...(d.notas_oficiales.length ? { notas_oficiales: d.notas_oficiales } : {}),
      })),
      empatados_fuera_de_la_lista: empatados,
      sin_dato_oficial: sinDato,
      _nota:
        args.criterio === 'asistencia'
          ? `Valor = sesiones en que figura entre los presentes, de ${ejemplo?.sesiones ?? '?'} actas. El acta no dice si una ausencia tuvo permiso.`
          : args.criterio === 'votos_emitidos'
            ? 'Valor = votaciones nominales en que votó a favor o en contra.'
            : args.criterio === 'remuneracion_bruta'
              ? 'Valor = remuneración bruta del último mes publicado, en colones.'
              : 'Valor = combustible del último mes publicado, en colones.',
    },
    enlaces: con.slice(0, Math.min(n, 3)).map(({ d }) => ficha(ctx, d)),
  }
}

async function buscarVotaciones(
  ctx: Contexto,
  args: { texto?: string; expediente?: string; desde?: string; hasta?: string }
): Promise<Resultado> {
  const filas = await ctx.votaciones()
  const q = plano(args.texto ?? '')
  const exp = (args.expediente ?? '').replace(/\D/g, '')
  // Los títulos de las votaciones son códigos ("MOCION FONDO ... EXP 24290"):
  // el tema está en el nombre del expediente, que trae el acta.
  const porNombre = q
    ? Object.entries(ctx.datos.expedientes).filter(([, ns]) => ns.some((n) => plano(n).includes(q)))
    : []
  const numeros = new Set(porNombre.map(([num]) => num))
  const numeroDe = (f: FilaVotacion) => (f[3] ?? (/EXP\.?\s*([\d.]{4,7})/i.exec(f[2] ?? '')?.[1] ?? '')).replace(/\D/g, '')
  const elegidas = filas.filter((f) => {
    if (args.desde && f[1] < args.desde) return false
    if (args.hasta && f[1] > args.hasta) return false
    if (exp && numeroDe(f) !== exp) return false
    if (q && !plano(f[2] ?? '').includes(q) && !numeros.has(numeroDe(f))) return false
    return true
  })
  elegidas.sort((a, b) => b[1].localeCompare(a[1]))
  return {
    datos: {
      encontradas: elegidas.length,
      expedientes_por_nombre: porNombre.slice(0, 5).map(([numero, nombres]) => ({ numero, nombre: nombres[nombres.length - 1] })),
      aprobadas: elegidas.filter((f) => f[7] === 'A').length,
      rechazadas: elegidas.filter((f) => f[7] === 'R').length,
      resultado_sin_verificar: elegidas.filter((f) => f[7] === null).length,
      mas_recientes: elegidas.slice(0, 6).map((f) => ({
        fecha: f[1],
        propuesta: f[2],
        a_favor: f[4],
        en_contra: f[5],
        no_voto: f[6],
        resultado: f[7] === 'A' ? 'aprobada' : f[7] === 'R' ? 'rechazada' : 'sin verificar',
      })),
      _nota: 'Solo votaciones nominales del Plenario publicadas en el sitio. «Sin verificar»: lo que anunció la Presidencia no coincide con la lista del acta.',
    },
    enlaces: elegidas.slice(0, 3).map((f) => ({ texto: `Votación del ${f[1]}`, url: `${ctx.sitio}/votacion/${f[0]}` })),
  }
}

function glosario(ctx: Contexto, args: { termino?: string }): Resultado {
  const q = plano(args.termino ?? '')
  const t = ctx.datos.glosario.filter((g) => plano(g.nombre).includes(q) || q.includes(plano(g.nombre)))
  return {
    datos: t.length
      ? { terminos: t, _nota: 'Resumen propio del Reglamento de la Asamblea Legislativa; el sitio muestra la cita literal.' }
      : { encontrados: 0, disponibles: ctx.datos.glosario.map((g) => g.nombre) },
    enlaces: [{ texto: 'Glosario en Votaciones', url: `${ctx.sitio}/votaciones` }],
  }
}

/**
 * Siglas de fracción que coinciden con lo pedido ("PFA", "FA" o "Frente
 * Amplio"). Se resuelve contra la lista de fracciones y se filtra por el
 * código de partido: en el padrón oficial algunas diputaciones traen vacío el
 * campo de fracción y por nombre quedarían fuera.
 */
function siglasDe(ctx: Contexto, f: string): Set<string> {
  const q = plano(f)
  if (!q) return new Set()
  return new Set(
    ctx.datos.composicion.fracciones
      .filter((x) => plano(x.codigo).includes(q) || plano(x.nombre ?? '').includes(q))
      .map((x) => x.codigo)
  )
}

function coincideFraccion(ctx: Contexto, d: Diputacion, f: string): boolean {
  return siglasDe(ctx, f).has(d.partido ?? '')
}

function nombreFraccion(ctx: Contexto, d: Diputacion): string | null {
  return d.fraccion ?? ctx.datos.composicion.fracciones.find((x) => x.codigo === d.partido)?.nombre ?? null
}

function listarDiputaciones(
  ctx: Contexto,
  args: { fraccion?: string; provincia?: string; solo_directorio?: boolean }
): Resultado {
  let lista = ctx.datos.diputaciones
  if (args.fraccion) lista = lista.filter((d) => coincideFraccion(ctx, d, args.fraccion!))
  if (args.provincia) lista = lista.filter((d) => plano(d.provincia ?? '') === plano(args.provincia!))
  if (args.solo_directorio) lista = lista.filter((d) => d.cargo_directorio)
  if (!lista.length) {
    return {
      datos: {
        cantidad: 0,
        nota: 'Ningún resultado con ese filtro. Probá de nuevo con una de estas fracciones o provincias.',
        fracciones: ctx.datos.composicion.fracciones.map((f) => `${f.codigo} (${f.nombre})`),
        provincias: [...new Set(ctx.datos.diputaciones.map((d) => d.provincia).filter(Boolean))],
      },
      enlaces: [],
    }
  }
  return {
    datos: {
      cantidad: lista.length,
      diputaciones: lista.map((d) => ({
        nombre: d.nombre,
        fraccion: nombreFraccion(ctx, d),
        sigla: d.partido,
        provincia: d.provincia,
        profesion: d.profesion ?? 'Sin dato oficial',
        cargo_directorio: d.cargo_directorio,
      })),
      _nota: 'Datos del padrón oficial de la Asamblea Legislativa. La profesión es la que declara la Asamblea en cada ficha.',
    },
    enlaces: lista.length <= 3 ? lista.map((d) => ficha(ctx, d)) : [{ texto: 'El Plenario', url: `${ctx.sitio}/` }],
  }
}

function asistenciaSesion(ctx: Contexto, args: { fecha?: string }): Resultado {
  const ses = ctx.datos.sesiones ?? []
  const ultima = ses[ses.length - 1]
  const elegidas = args.fecha ? ses.filter((s) => s.fecha === args.fecha) : ultima ? [ultima] : []
  if (!elegidas.length) {
    return {
      datos: {
        fecha_pedida: args.fecha,
        hay_acta: false,
        ultima_sesion_con_acta: ultima ? { fecha: ultima.fecha, tipo: ultima.tipo, numero: ultima.numero } : null,
        actas_listadas_sin_texto: ctx.datos.actas?.sin_documento ?? [],
        _nota: 'No hay acta publicada de esa fecha: puede que no hubo sesión o que el acta todavía no está publicada. No se puede saber quién asistió.',
      },
      enlaces: [{ texto: 'Votaciones', url: `${ctx.sitio}/votaciones` }],
    }
  }
  return {
    datos: {
      sesiones: elegidas.map((s) => ({
        fecha: s.fecha,
        sesion: `${s.tipo} N.º ${s.numero}`,
        figuran_presentes: s.con_lista_de_presentes ? s.presentes : 'Sin dato oficial',
        no_figuran_en_la_lista_de_presentes: s.con_lista_de_presentes ? s.no_figuran : 'Sin dato oficial',
      })),
      _nota: 'Lista de presentes del acta oficial de la sesión. El acta no dice si una ausencia tuvo permiso.',
    },
    enlaces: [{ texto: 'Votaciones', url: `${ctx.sitio}/votaciones` }],
  }
}

export async function ejecutar(ctx: Contexto, nombre: string, args: Record<string, unknown>): Promise<Resultado> {
  const d = ctx.datos
  switch (nombre) {
    case 'buscar_diputacion':
      return buscarDiputacion(ctx, args)
    case 'ranking':
      return ranking(ctx, args)
    case 'listar_diputaciones':
      return listarDiputaciones(ctx, args)
    case 'asistencia_sesion':
      return asistenciaSesion(ctx, args)
    case 'composicion':
      return { datos: d.composicion, enlaces: [{ texto: 'El Plenario', url: `${ctx.sitio}/` }] }
    case 'semana':
      return { datos: d.semana ?? { nota: 'Sin actas todavía.' }, enlaces: [{ texto: 'La última semana', url: `${ctx.sitio}/votaciones` }] }
    case 'proyectos_mas_votados':
      return {
        datos: { proyectos: d.proyectos, _nota: 'Conteo directo de votaciones publicadas; el nombre sale del acta.' },
        enlaces: [{ texto: 'Proyectos con más votaciones', url: `${ctx.sitio}/votaciones` }],
      }
    case 'buscar_votaciones':
      return buscarVotaciones(ctx, args)
    case 'glosario':
      return glosario(ctx, args)
    case 'sobre_los_datos':
      return {
        datos: {
          periodo: d.periodo,
          extraido: d.extraido,
          actas: d.actas,
          no_se_muestra: [
            'Comisiones (solo el Plenario).',
            'Uso de vehículos y viajes al exterior.',
            'Votaciones cuya acta no cuadra.',
            'Si una ausencia tuvo permiso: el acta no lo dice.',
          ],
        },
        enlaces: [{ texto: 'Fuentes', url: `${ctx.sitio}/fuentes` }],
      }
    default:
      return { datos: { error: `No existe la herramienta ${nombre}.` }, enlaces: [] }
  }
}
