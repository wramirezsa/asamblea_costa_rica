import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Hemiciclo from './Hemiciclo'
import PanelDiputado from './PanelDiputado'
import Actividad from './Actividad'
import QuienTeRepresenta from './QuienTeRepresenta'
import BarraVotacion from './BarraVotacion'
import Votaciones from './Votaciones'
import { FUENTES, extraccionMasVieja, fechaHora } from './frescura'
import { aSlug, irA, leerRuta, ponerTitulo, recurso } from './rutas'
import type { Asamblea, CodigoVoto, DatosVotaciones, Diputado } from './tipos'
import { VOTO, buscarVotacion, cargarVotaciones, claveVotacion, nombreSesion, votoDe } from './votos'
import './estilos.css'

// Three.js pesa mas que todo el resto junto: solo se descarga si la persona
// entra a la vista del salon.
const Plenario3D = lazy(() => import('./Plenario3D'))

const COLOR_SIN_BANCADA = '#94a3b8'

export default function App() {
  const [datos, setDatos] = useState<Asamblea | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [busqueda, setBusqueda] = useState('')
  const [bancadas, setBancadas] = useState<Set<string>>(new Set())
  const [provincia, setProvincia] = useState('')
  const rutaInicial = useMemo(() => leerRuta(), [])
  const [seleccionado, setSeleccionado] = useState<string | null>(
    rutaInicial.tipo === 'diputado' ? rutaInicial.slug : null
  )
  const [globo, setGlobo] = useState<{ dip: Diputado; x: number; y: number } | null>(null)
  const [modo, setModo] = useState<'caras' | 'colores'>('caras')
  const [vista, setVista] = useState<'composicion' | 'salon'>('composicion')
  // Votacion del acta que se ve en el mapa (indice en votaciones.json).
  const [votaciones, setVotaciones] = useState<DatosVotaciones | null>(null)
  const [votacionActiva, setVotacionActiva] = useState<number | null>(null)
  const refMapa = useRef<HTMLDivElement | null>(null)

  const verVotacion = useCallback((indice: number) => {
    cargarVotaciones().then((d) => {
      setVotaciones(d)
      setVotacionActiva(indice)
      setSeleccionado(null)
      requestAnimationFrame(() =>
        refMapa.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      )
    })
  }, [])

  // Si se entro por /votacion/xxx, hay que cargar las votaciones y ubicarla.
  useEffect(() => {
    if (rutaInicial.tipo !== 'votacion') return
    cargarVotaciones()
      .then((d) => {
        setVotaciones(d)
        setVotacionActiva(buscarVotacion(d, rutaInicial.clave))
      })
      .catch(() => setVotacionActiva(null))
  }, [rutaInicial])

  // Voto de cada diputacion en la votacion activa, para pintar el mapa.
  const votoMapa = useMemo<((slug: string) => CodigoVoto) | null>(() => {
    if (!votaciones || votacionActiva === null) return null
    const v = votaciones.votaciones[votacionActiva]
    const indice = new Map(votaciones.orden.map((s, i) => [s, i]))
    return (slug: string) => {
      const k = indice.get(slug)
      return k === undefined ? '-' : votoDe(v, k)
    }
  }, [votaciones, votacionActiva])

  useEffect(() => {
    // 'no-cache' obliga a revalidar contra el servidor en cada carga. El
    // archivo cambia cada vez que corre el ETL y el sitio promete mostrar el
    // dato vigente: servir una copia vieja del navegador seria faltar a eso.
    fetch(recurso('datos/asamblea.json'), { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status} al pedir datos/asamblea.json`)
        return r.json()
      })
      .then(setDatos)
      .catch((e) => setError(String(e.message ?? e)))
  }, [])

  const porSlug = useMemo(() => {
    const m = new Map<string, Diputado>()
    datos?.diputados.forEach((d) => m.set(d.slug, d))
    return m
  }, [datos])

  const colores = useMemo(() => {
    const m = new Map<string, string>()
    datos?.fracciones.forEach((f) => f.color && m.set(f.codigo, f.color))
    return m
  }, [datos])

  const colorDe = (partido: string | null) =>
    (partido && colores.get(partido)) || COLOR_SIN_BANCADA

  const banderas = useMemo(() => {
    const m = new Map<string, string>()
    datos?.fracciones.forEach((f) => f.bandera && m.set(f.codigo, f.bandera))
    return m
  }, [datos])

  const banderaDe = (partido: string | null) =>
    (partido && banderas.get(partido)) || null

  // Donde se sienta cada quien, para mostrarlo en el globo.
  const curulPorSlug = useMemo(() => {
    const m = new Map<string, string>()
    datos?.sala.curules.forEach((c) => m.set(c.slug, c.id))
    datos?.sala.mesa.forEach((p) => m.set(p.slug, p.etiqueta))
    return m
  }, [datos])

  const provincias = useMemo(() => {
    const s = new Set<string>()
    datos?.diputados.forEach((d) => d.provincia && s.add(d.provincia))
    return [...s].sort((a, b) => a.localeCompare(b, 'es'))
  }, [datos])

  // Un solo conjunto de slugs visibles alimenta el atenuado del mapa; asi el
  // filtro nunca esconde curules, solo baja su prominencia.
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const s = new Set<string>()
    datos?.diputados.forEach((d) => {
      if (bancadas.size > 0 && !bancadas.has(d.partido_codigo ?? '')) return
      if (provincia && d.provincia !== provincia) return
      if (q) {
        const heno = normalizar(
          [d.nombre, d.fraccion, d.provincia, d.profesion].filter(Boolean).join(' ')
        )
        if (!heno.includes(q)) return
      }
      s.add(d.slug)
    })
    return s
  }, [datos, busqueda, bancadas, provincia])

  // Cuando el filtro deja a una sola persona, el salon 3D vuela hasta su
  // curul sin abrir la ficha. Es el gesto natural al ir curando el mapa:
  // se escribe un apellido y la camara va sola, incluso al fondo de la sala.
  const enfocado = visibles.size === 1 ? [...visibles][0] : null

  // La dirección refleja lo que se está viendo, y viceversa. Sin esto no se
  // puede compartir un enlace ni volver con el botón de atrás.
  useEffect(() => {
    if (!datos) return
    // Se entro por un enlace a una votacion y todavia no carga: no tocar la
    // direccion, o se pierde el enlace antes de poder mostrarlo.
    if (rutaInicial.tipo === 'votacion' && !votaciones) return
    if (seleccionado) irA({ tipo: 'diputado', slug: seleccionado })
    else if (votaciones && votacionActiva !== null)
      irA({ tipo: 'votacion', clave: claveVotacion(votaciones, votaciones.votaciones[votacionActiva]) })
    else if (provincia) irA({ tipo: 'provincia', provincia: aSlug(provincia) })
    else irA({ tipo: 'inicio' })
  }, [datos, seleccionado, provincia, votaciones, votacionActiva, rutaInicial])

  useEffect(() => {
    const alNavegar = () => {
      const r = leerRuta()
      if (r.tipo === 'diputado') {
        setSeleccionado(r.slug)
      } else if (r.tipo === 'votacion') {
        setSeleccionado(null)
        cargarVotaciones().then((d) => {
          setVotaciones(d)
          setVotacionActiva(buscarVotacion(d, r.clave))
        })
      } else if (r.tipo === 'provincia') {
        setVotacionActiva(null)
        setSeleccionado(null)
        const encontrada = datos?.diputados.find(
          (d) => d.provincia && aSlug(d.provincia) === r.provincia
        )?.provincia
        setProvincia(encontrada ?? '')
      } else {
        setSeleccionado(null)
        setProvincia('')
        setVotacionActiva(null)
      }
    }
    window.addEventListener('popstate', alNavegar)
    return () => window.removeEventListener('popstate', alNavegar)
  }, [datos])

  // Si se entró por /provincia/xxx hay que traducir el slug al nombre real.
  useEffect(() => {
    if (!datos || rutaInicial.tipo !== 'provincia') return
    const encontrada = datos.diputados.find(
      (d) => d.provincia && aSlug(d.provincia) === rutaInicial.provincia
    )?.provincia
    if (encontrada) setProvincia(encontrada)
  }, [datos, rutaInicial])

  // Título y descripción según lo que se ve: es lo que aparece al compartir.
  useEffect(() => {
    if (!datos) return
    const dip = seleccionado ? porSlug.get(seleccionado) : null
    if (dip) {
      ponerTitulo(
        `${dip.nombre} · Asamblea Abierta`,
        [dip.fraccion, dip.provincia, dip.profesion].filter(Boolean).join(' · ')
      )
    } else if (votaciones && votacionActiva !== null) {
      const v = votaciones.votaciones[votacionActiva]
      const s = votaciones.sesiones[v.s]
      ponerTitulo(
        `${v.p ?? 'Votación'} · Asamblea Abierta`,
        `Cómo votó cada diputación: ${v.d[0] ?? '—'} a favor, ${v.d[1] ?? '—'} en contra. ${nombreSesion(s)}, según el acta oficial.`
      )
    } else if (provincia) {
      const n = datos.diputados.filter((d) => d.provincia === provincia).length
      ponerTitulo(
        `Diputaciones de ${provincia} · Asamblea Abierta`,
        `Las ${n} diputaciones que representan a ${provincia} en la Asamblea Legislativa de Costa Rica, ${datos.periodo}.`
      )
    } else {
      ponerTitulo(
        'Asamblea Abierta · Plenario legislativo de Costa Rica',
        `Mapa interactivo del plenario ${datos.periodo}: las ${datos.total} diputaciones, dónde se sientan y qué han hecho.`
      )
    }
  }, [datos, seleccionado, provincia, porSlug, votaciones, votacionActiva])

  const alternarBancada = (codigo: string) => {
    setBancadas((prev) => {
      const s = new Set(prev)
      s.has(codigo) ? s.delete(codigo) : s.add(codigo)
      return s
    })
  }

  if (error) {
    return (
      <div className="centro-pantalla">
        <div className="error-caja">
          <strong>No se pudieron cargar los datos.</strong>
          <p style={{ color: 'var(--texto-2)', fontSize: 13, lineHeight: 1.6 }}>
            El sitio no muestra información sin su fuente. Generá los datos antes de abrirlo:
          </p>
          <code>
            python etl/fetch_diputados.py
            <br />
            python etl/fetch_assets.py
            <br />
            python etl/derive_colores.py
            <br />
            python etl/publish_web.py
          </code>
          <p style={{ color: 'var(--texto-3)', fontSize: 11.5, marginTop: 10 }}>{error}</p>
        </div>
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="centro-pantalla">
        <div>
          <div className="giro" />
          <p style={{ color: 'var(--texto-2)', fontSize: 13 }}>Cargando el plenario…</p>
        </div>
      </div>
    )
  }

  const activas = [...datos.fracciones].sort((a, b) => b.escanos - a.escanos)
  const dipSeleccionado = seleccionado ? porSlug.get(seleccionado) : null
  const mayoriaSimple = Math.floor(datos.total / 2) + 1
  const bancadaMayor = activas[0]
  const filtrando = busqueda.trim() !== '' || bancadas.size > 0 || provincia !== ''
  const masVieja = extraccionMasVieja(datos.extraido)

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <div className="marca-icono">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="1.9">
              <path d="M3 21h18M5 21V10M19 21V10M9 21v-6h6v6M2 10l10-7 10 7" />
            </svg>
          </div>
          <div>
            <h1>Asamblea Abierta</h1>
            <p>Plenario legislativo de Costa Rica · {datos.periodo}</p>
          </div>
        </div>

        <div className="cabecera-espacio" />

        <div
          className="sello-datos"
          title={[
            `Fuente: ${datos.fuente_oficial}`,
            'Fecha de la extracción más vieja. Por fuente:',
            ...FUENTES.map(([k, n]) => `${n}: ${fechaHora(datos.extraido[k])}`),
          ].join('\n')}
        >
          <span className="punto-vivo" />
          Datos oficiales ·{' '}
          {masVieja
            ? new Date(masVieja).toLocaleDateString('es-CR', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })
            : 'sin fecha'}
        </div>
      </header>

      <QuienTeRepresenta
        diputados={datos.diputados}
        provinciaActiva={provincia}
        onElegir={setProvincia}
      />

      <section className="composicion">
        <div className="composicion-barra">
          {activas.map((f) => (
            <div
              key={f.codigo}
              className={`composicion-seg${
                bancadas.size > 0 && !bancadas.has(f.codigo) ? ' apagado' : ''
              }`}
              style={{ flex: f.escanos, background: f.color ?? COLOR_SIN_BANCADA }}
              title={`${f.nombre ?? f.codigo}: ${f.escanos} de ${datos.total}`}
              onClick={() => alternarBancada(f.codigo)}
            >
              {f.escanos >= 4 ? f.escanos : ''}
            </div>
          ))}
        </div>
        <div className="composicion-pie">
          <span className="mayoria">
            Mayoría simple: <strong>{mayoriaSimple}</strong> · Mayoría calificada (⅔):{' '}
            <strong>{Math.ceil((datos.total * 2) / 3)}</strong>
            {bancadaMayor && bancadaMayor.escanos >= mayoriaSimple && (
              <>
                {' · '}
                <strong style={{ color: bancadaMayor.color ?? undefined }}>
                  {bancadaMayor.codigo}
                </strong>{' '}
                alcanza por sí sola la mayoría simple
              </>
            )}
          </span>
          <span>{datos.total} curules</span>
        </div>
      </section>

      <section className="controles">
        <div className="buscador">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, provincia o profesión…"
            aria-label="Buscar diputación"
          />
        </div>

        <div className="chips">
          {activas.map((f) => {
            const activo = bancadas.has(f.codigo)
            return (
              <button
                key={f.codigo}
                className={`chip${activo ? ' activo' : ''}`}
                style={activo ? { color: f.color ?? undefined } : undefined}
                onClick={() => alternarBancada(f.codigo)}
                title={f.nombre ?? f.codigo}
              >
                <span className="chip-punto" style={{ background: f.color ?? COLOR_SIN_BANCADA }} />
                {f.codigo}
                <span className="chip-n">{f.escanos}</span>
              </button>
            )
          })}
        </div>

        <select
          className="selector"
          value={provincia}
          onChange={(e) => setProvincia(e.target.value)}
          aria-label="Filtrar por provincia"
        >
          <option value="">Todas las provincias</option>
          {provincias.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        {filtrando && (
          <button
            className="chip"
            onClick={() => {
              setBusqueda('')
              setBancadas(new Set())
              setProvincia('')
            }}
          >
            Limpiar · {visibles.size} de {datos.total}
          </button>
        )}

        {vista === 'composicion' && (
          <div className="conmutador" role="group" aria-label="Modo de visualización">
            <button
              className={modo === 'caras' ? 'activo' : ''}
              onClick={() => setModo('caras')}
              aria-pressed={modo === 'caras'}
            >
              Caras
            </button>
            <button
              className={modo === 'colores' ? 'activo' : ''}
              onClick={() => setModo('colores')}
              aria-pressed={modo === 'colores'}
            >
              Bancadas
            </button>
          </div>
        )}

        <div className="conmutador conmutador-vista" role="group" aria-label="Vista">
          <button
            className={vista === 'composicion' ? 'activo' : ''}
            onClick={() => setVista('composicion')}
            aria-pressed={vista === 'composicion'}
            title="Diagrama de composición: cómo se reparten las 57 curules"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 18a9 9 0 0 1 18 0" />
              <circle cx="12" cy="18" r="1.4" fill="currentColor" />
            </svg>
            Composición
          </button>
          <button
            className={vista === 'salon' ? 'activo' : ''}
            onClick={() => setVista('salon')}
            aria-pressed={vista === 'salon'}
            title="El salón de sesiones reconstruido en 3D"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" />
              <path d="m12 12 9-5M12 12v10M12 12 3 7" />
            </svg>
            Salón 3D
          </button>
        </div>
      </section>

      <div ref={refMapa} className="ancla-mapa" />
      {votaciones && votacionActiva !== null && (
        <BarraVotacion
          datos={votaciones}
          indice={votacionActiva}
          onCambiar={setVotacionActiva}
          onCerrar={() => setVotacionActiva(null)}
        />
      )}
      <div className="lienzo-envoltura">
        {vista === 'composicion' ? (
          <Hemiciclo
            datos={datos}
            porSlug={porSlug}
            colorDe={colorDe}
            visibles={visibles}
            seleccionado={seleccionado}
            modo={modo}
            votoDe={votoMapa}
            onSeleccionar={setSeleccionado}
            onSobrevolar={setGlobo}
          />
        ) : (
          <Suspense
            fallback={
              <div className="lienzo lienzo-cargando">
                <div>
                  <div className="giro" />
                  <p>Levantando el salón de sesiones…</p>
                </div>
              </div>
            }
          >
            <Plenario3D
              datos={datos}
              porSlug={porSlug}
              colorDe={colorDe}
              visibles={visibles}
                seleccionado={seleccionado}
              enfocado={enfocado}
              votoDe={votoMapa}
              onSeleccionar={setSeleccionado}
              onSobrevolar={setGlobo}
            />
          </Suspense>
        )}
      </div>

      {globo && !dipSeleccionado && (
        <div
          className="globo"
          style={{
            left: Math.min(globo.x + 16, window.innerWidth - 266),
            top: Math.min(globo.y + 16, window.innerHeight - 160),
          }}
        >
          <div className="globo-fila">
            {globo.dip.foto && <img src={`${recurso('assets')}/${globo.dip.foto}`} alt="" />}
            <div style={{ minWidth: 0 }}>
              <div className="globo-nombre">{globo.dip.nombre}</div>
              {globo.dip.cargo_directorio && (
                <div className="globo-cargo">{globo.dip.cargo_directorio}</div>
              )}
              <div className="globo-meta">
                <span style={{ color: colorDe(globo.dip.partido_codigo) }}>
                  {globo.dip.partido_codigo}
                </span>{' '}
                · {globo.dip.provincia}
                <br />
                {globo.dip.profesion}
              </div>
            </div>
          </div>
          {votoMapa && (
            <div className="globo-curul">
              <span>En esta votación</span>
              <span style={{ color: VOTO[votoMapa(globo.dip.slug)].color, fontWeight: 700 }}>
                {VOTO[votoMapa(globo.dip.slug)].simbolo} {VOTO[votoMapa(globo.dip.slug)].etiqueta}
              </span>
            </div>
          )}
          {curulPorSlug.get(globo.dip.slug) && (
            <div className="globo-curul">
              <span>Curul</span>
              <span className="curul-id">{curulPorSlug.get(globo.dip.slug)}</span>
            </div>
          )}
          <div className="globo-pie">
            {banderaDe(globo.dip.partido_codigo) ? (
              <span className="globo-bancada">
                <img src={`${recurso('assets')}/${banderaDe(globo.dip.partido_codigo)}`} alt="" />
                {globo.dip.fraccion ?? globo.dip.partido_codigo}
              </span>
            ) : (
              <span>{globo.dip.fraccion ?? ''}</span>
            )}
            <span>Clic para la ficha</span>
          </div>
        </div>
      )}

      {dipSeleccionado && (
        <PanelDiputado
          dip={dipSeleccionado}
          datos={datos}
          intervenciones={
            datos.actividad?.intervenciones.por_diputacion[dipSeleccionado.slug] ?? []
          }
          color={colorDe(dipSeleccionado.partido_codigo)}
          onVerVotacion={verVotacion}
          onCerrar={() => setSeleccionado(null)}
        />
      )}

      {datos.actas && <Votaciones resumen={datos.actas} onVer={verVotacion} />}

      {datos.actividad && <Actividad datos={datos.actividad} />}

      <footer className="pie">
        <div className="pie-interno">
          <div>
            <h4>De dónde salen estos datos</h4>
            <p>
              El padrón de las {datos.total} diputaciones, sus fotografías oficiales y las
              banderas de las fracciones se leen directamente de la{' '}
              <a href="https://www.asamblea.go.cr" target="_blank" rel="noopener noreferrer">
                Asamblea Legislativa de Costa Rica
              </a>
              . {datos.licencia}.
            </p>
            <p>
              <strong style={{ color: 'var(--texto-2)' }}>Lo que todavía no mostramos:</strong>{' '}
              asistencia diaria y votaciones nominales. La Asamblea dejó de publicar su
              conjunto de asistencia en 2019 y no expone las votaciones del plenario en
              formato estructurado. Preferimos dejar el vacío visible antes que llenarlo con
              estimaciones.
            </p>
            <p style={{ fontSize: 11.5 }}>
              Extracción por fuente:{' '}
              {FUENTES.map(([k, n]) => `${n} ${fechaHora(datos.extraido[k])}`).join(' · ')}.
              Sitio armado el {fechaHora(datos.generado)}. Proyecto ciudadano independiente,
              sin vínculo con la Asamblea Legislativa.
            </p>
          </div>

          <div className="aporte">
            <h4 style={{ color: 'var(--texto)' }}>Apoyá la plataforma</h4>
            <p style={{ color: 'var(--texto-2)' }}>
              Este proyecto es independiente y gratuito. Los aportes cubren el dominio, el
              alojamiento y el trabajo de mantener los datos al día.
            </p>
            <button className="aporte-boton" disabled>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M19 14c1.5-1.5 2-3.4 2-5a7 7 0 0 0-14 0c0 1.6.5 3.5 2 5l5 6 5-6Z" />
              </svg>
              Donar
            </button>
            <small>
              Pendiente de configurar el medio de pago. No se activa hasta que exista una
              cuenta real: no ponemos botones que no funcionan.
            </small>
          </div>
        </div>
      </footer>
    </div>
  )
}

function normalizar(s: string): string {
  // Quita tildes para que "Ramirez" encuentre a "Ramírez". Se usan escapes
  // explicitos porque los combinantes literales son invisibles al editar.
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
