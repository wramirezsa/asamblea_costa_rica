import { useState } from 'react'
import { rutaAUrl } from './rutas'
import type { Actividad as DatosActividad } from './tipos'

/**
 * Actividad legislativa que la Asamblea mantiene al dia.
 *
 * Cada bloque muestra su PROPIA fecha de ultima actualizacion, tomada del
 * campo `Modified` mas reciente de la fuente. No es la fecha en que corrimos
 * el ETL: es cuando la Asamblea toco ese dato por ultima vez. Asi se ve de un
 * vistazo si un conjunto se dejo de alimentar.
 */

function fecha(iso: string | null): string {
  if (!iso) return 'sin dato'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'sin dato'
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function haceCuanto(iso: string | null): { texto: string; fresco: boolean } {
  if (!iso) return { texto: '', fresco: false }
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias <= 0) return { texto: 'hoy', fresco: true }
  if (dias === 1) return { texto: 'ayer', fresco: true }
  if (dias < 31) return { texto: `hace ${dias} días`, fresco: true }
  const meses = Math.floor(dias / 30)
  return { texto: `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`, fresco: dias < 120 }
}

function Sello({ iso }: { iso: string | null }) {
  const { texto, fresco } = haceCuanto(iso)
  return (
    <div className={`sello-fecha${fresco ? ' fresco' : ''}`} title={`Última actualización: ${fecha(iso)}`}>
      <span className="punto-fecha" />
      Actualizado {texto || fecha(iso)}
    </div>
  )
}

export default function Actividad({
  datos,
  onFuentes,
}: {
  datos: DatosActividad
  onFuentes?: () => void
}) {
  const [abierto, setAbierto] = useState<'leyes' | 'mociones' | null>(null)
  const { leyes, mociones } = datos

  const totalMociones = Object.values(mociones.por_resultado).reduce((a, b) => a + b, 0)
  const rechazadas = mociones.por_resultado['Rechazada'] ?? 0
  const aprobadas = mociones.por_resultado['Aprobada'] ?? 0
  const pctRechazo = totalMociones ? Math.round((rechazadas / totalMociones) * 100) : 0
  const anioActual = String(new Date().getFullYear())

  return (
    <section className="actividad">
      <div className="actividad-cabecera">
        <h2>Actividad legislativa</h2>
        <p>
          Lo que la Asamblea sí mantiene al día. Cada bloque indica cuándo se actualizó
          por última vez en la fuente oficial.
        </p>
      </div>

      <div className="tarjetas">
        <article className="tarjeta">
          <Sello iso={leyes.ultima_actualizacion} />
          <div className="cifra">{leyes.total.toLocaleString('es-CR')}</div>
          <div className="cifra-et">leyes aprobadas</div>
          <p className="tarjeta-nota">
            {leyes.por_anio[anioActual] ?? 0} en lo que va de {anioActual}.
          </p>
          <button className="ver-mas" onClick={() => setAbierto(abierto === 'leyes' ? null : 'leyes')}>
            {abierto === 'leyes' ? 'Ocultar' : 'Ver las más recientes'}
          </button>
        </article>

        <article className="tarjeta">
          <Sello iso={mociones.ultima_actualizacion} />
          <div className="cifra">
            {pctRechazo}<span className="cifra-sufijo">%</span>
          </div>
          <div className="cifra-et">de las mociones se rechaza</div>
          <p className="tarjeta-nota">
            {rechazadas.toLocaleString('es-CR')} rechazadas frente a{' '}
            {aprobadas.toLocaleString('es-CR')} aprobadas, sobre{' '}
            {totalMociones.toLocaleString('es-CR')} mociones en{' '}
            {mociones.expedientes_distintos.toLocaleString('es-CR')} expedientes.
          </p>
          <button
            className="ver-mas"
            onClick={() => setAbierto(abierto === 'mociones' ? null : 'mociones')}
          >
            {abierto === 'mociones' ? 'Ocultar' : 'Ver las más recientes'}
          </button>
        </article>

        <article className="tarjeta">
          <Sello iso={datos.intervenciones.ultima_actualizacion} />
          <div className="cifra">
            {datos.intervenciones.diputaciones_con_registro}
            <span className="cifra-sufijo">/57</span>
          </div>
          <div className="cifra-et">diputaciones con intervenciones publicadas</div>
          <p className="tarjeta-nota">
            {datos.intervenciones.total} documentos. Se ven en la ficha de cada
            diputación, al hacer clic en su curul.
          </p>
        </article>
      </div>

      {abierto === 'leyes' && (
        <div className="listado">
          {leyes.recientes.slice(0, 12).map((l) => (
            <article key={`${l.numero}-${l.titulo}`} className="fila-dato">
              <div className="fila-marca">Ley {l.numero}</div>
              <div>
                <h4>{l.titulo}</h4>
                {l.resumen && <p>{l.resumen}</p>}
                <span className="fila-pie">{fecha(l.publicada)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {abierto === 'mociones' && (
        <div className="listado">
          {mociones.recientes.slice(0, 12).map((m, i) => (
            <article key={`${m.numero}-${i}`} className="fila-dato">
              <div className={`fila-marca resultado-${(m.resultado ?? '').toLowerCase()}`}>
                {m.resultado ?? 'sin dato'}
              </div>
              <div>
                <h4>{m.asunto ?? 'Sin asunto registrado'}</h4>
                <p className="fila-meta">
                  Moción {m.numero} · Expediente {m.expediente ?? 'sin número'}
                  {m.tramite ? ` · ${m.tramite}` : ''}
                </p>
                <span className="fila-pie">{fecha(m.fecha)}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="actividad-pie">
        Algunos conjuntos viejos del catálogo de la Asamblea quedaron congelados hace años,
        pero varios se mudaron: la asistencia y el uso de vehículos, por ejemplo, ahora se
        publican en su portal de datos abiertos. Acá aparece lo que ya leemos de forma
        verificable; lo que todavía no, y por qué, está en{' '}
        <a
          href={rutaAUrl({ tipo: 'seccion', seccion: 'fuentes' })}
          onClick={(e) => {
            if (!onFuentes || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
            e.preventDefault()
            onFuentes()
          }}
        >
          Fuentes
        </a>
        .
      </p>
    </section>
  )
}
