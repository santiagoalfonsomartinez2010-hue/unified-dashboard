import './Vistas.css'
import './Finanzas.css'
import './SeccionIA.css'

/*
  Renderizador genérico de un apartado DISEÑADO POR LA IA. El análisis
  conjunto devuelve "secciones" (qué apartados necesita este negocio y con
  qué widgets); aquí solo se pintan: la estructura la decide el modelo, no
  una plantilla. Tipos de widget: tiles, barras, donut, tabla, lista, texto.
*/

// Paleta estable para series sin semántica propia (misma que las categorías)
const PALETA = ['#3987e5', '#199e70', '#c98500', '#9085e9', '#e66767', '#008300', '#6b7185']

const COLOR_TILE = {
  verde: 'var(--color-verde)',
  rojo: 'var(--color-rojo)',
  amarillo: 'var(--color-amarillo)',
  acento: 'var(--color-violeta)',
}

function formatoValor(n, unidad) {
  const texto = Number(n).toLocaleString('es-ES', {
    maximumFractionDigits: 2,
    useGrouping: 'always',
  })
  return unidad ? `${texto} ${unidad}` : texto
}

/*
  Explicabilidad: de dónde sale este número. Se muestra como title nativo
  (aparece al posar el ratón) y en un pie discreto, para que cualquier cifra
  del panel se pueda rastrear hasta su hoja, sus columnas y su fórmula.
*/
function textoProcedencia(p) {
  if (!p) return null
  const partes = []
  if (p.hoja) partes.push(`Fuente: hoja "${p.hoja}"`)
  if (p.columnas?.length) partes.push(`Columnas: ${p.columnas.join(', ')}`)
  if (p.formula) partes.push(`Cálculo: ${p.formula}`)
  if (p.explicacion) partes.push(p.explicacion)
  return partes.join('\n')
}

function PieProcedencia({ procedencia, nota }) {
  const texto = textoProcedencia(procedencia)
  if (!texto && !nota) return null
  return (
    <p className="ia-procedencia" title={texto || undefined}>
      {nota ? `${nota} ` : ''}
      {procedencia?.formula ? <code>{procedencia.formula}</code> : null}
      {procedencia?.hoja ? <span className="ia-procedencia-hoja"> · {procedencia.hoja}</span> : null}
    </p>
  )
}

function WidgetTiles({ widget }) {
  return (
    <div className="fin-tiles">
      {widget.items.map((t, i) => (
        <div className="fin-tile" key={i} title={textoProcedencia(t.procedencia) || undefined}>
          <span className="fin-tile-et">{t.etiqueta.toUpperCase()}</span>
          <b style={t.color ? { color: COLOR_TILE[t.color] } : undefined}>{t.valor}</b>
          {t.detalle && <span className="fin-tile-pct">{t.detalle}</span>}
          {t.procedencia?.formula && <span className="ia-tile-formula">{t.procedencia.formula}</span>}
        </div>
      ))}
    </div>
  )
}

/*
  Evolución en el tiempo. Se dibuja como SVG con viewBox y sin tamaños fijos
  para que escale con la tarjeta; los puntos llevan <title> para poder leer
  el valor exacto de cada periodo.
*/
function WidgetLinea({ widget }) {
  const datos = widget.datos || []
  const valores = datos.map((d) => d.valor)

  /*
    La escala se ajusta a los datos, sin forzar el cero: en una serie que se
    mueve entre 14.000 y 17.000, meter el cero deja la línea pegada al borde
    de arriba y esconde justo la variación que se quiere ver. Se deja un
    margen del 12 % arriba y abajo para que no toque los bordes.
  */
  const maxDato = Math.max(...valores)
  const minDato = Math.min(...valores)
  const margen = (maxDato - minDato) * 0.12 || Math.abs(maxDato) * 0.1 || 1
  const max = maxDato + margen
  const min = minDato - margen
  const rango = max - min || 1

  // viewBox con la proporción real del dibujo y escalado uniforme: así los
  // puntos son círculos y no elipses estiradas.
  const ancho = 400
  const alto = 130
  const x = (i) => (datos.length === 1 ? ancho / 2 : (i / (datos.length - 1)) * ancho)
  const y = (v) => alto - ((v - min) / rango) * alto

  const linea = datos.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(d.valor).toFixed(2)}`).join(' ')
  const area = `${linea} L ${ancho} ${alto} L 0 ${alto} Z`

  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <div className="ia-linea">
        <svg viewBox={`0 0 ${ancho} ${alto}`} className="ia-linea-svg" role="img"
             aria-label={widget.titulo || 'Evolución'}>
          <path d={area} className="ia-linea-area" />
          <path d={linea} className="ia-linea-trazo" />
          {datos.map((d, i) => (
            <circle key={i} cx={x(i)} cy={y(d.valor)} r="3.5" className="ia-linea-punto">
              <title>{`${d.etiqueta}: ${formatoValor(d.valor, widget.unidad)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="ia-linea-ejes">
          {datos.map((d, i) => (
            <span key={i} title={`${d.etiqueta}: ${formatoValor(d.valor, widget.unidad)}`}>
              {d.etiqueta}
            </span>
          ))}
        </div>
      </div>
      <PieProcedencia procedencia={widget.procedencia} nota={widget.nota} />
    </div>
  )
}

/*
  Dispersión: relación entre dos métricas. Cada punto es un registro; los
  ejes se etiquetan con el nombre real de la columna.
*/
function WidgetDispersion({ widget }) {
  const puntos = widget.puntos || []
  if (!puntos.length) return null

  const xs = puntos.map((p) => p.x)
  const ys = puntos.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangoX = maxX - minX || 1
  const rangoY = maxY - minY || 1

  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <div className="ia-dispersion">
        <svg viewBox="0 0 400 240" className="ia-dispersion-svg" role="img" aria-label={widget.titulo}>
          {puntos.map((p, i) => (
            <circle
              key={i}
              cx={((p.x - minX) / rangoX) * 384 + 8}
              cy={232 - ((p.y - minY) / rangoY) * 224}
              r="3"
              className="ia-dispersion-punto"
            >
              <title>{`${widget.ejes?.x}: ${formatoValor(p.x, widget.ejes?.unidadX)} · ${widget.ejes?.y}: ${formatoValor(p.y, widget.ejes?.unidadY)}`}</title>
            </circle>
          ))}
        </svg>
        <div className="ia-dispersion-ejes">
          <span>↔ {widget.ejes?.x}</span>
          <span>↕ {widget.ejes?.y}</span>
        </div>
      </div>
      <PieProcedencia procedencia={widget.procedencia} nota={widget.nota} />
    </div>
  )
}

function WidgetBarras({ widget }) {
  const max = Math.max(...widget.datos.map((d) => d.valor), 1)
  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <div className="fin-barras ia-barras">
        {widget.datos.map((d, i) => (
          <div
            className="fin-barra-fila"
            key={i}
            title={`${d.etiqueta}: ${formatoValor(d.valor, widget.unidad)}`}
          >
            <span className="fin-barra-nombre">{d.etiqueta}</span>
            <div className="fin-barra-pista">
              <div className="fin-barra" style={{ width: `${Math.max((d.valor / max) * 100, 2)}%` }} />
            </div>
            <span className="fin-barra-valor">{formatoValor(d.valor, widget.unidad)}</span>
          </div>
        ))}
      </div>
      <PieProcedencia procedencia={widget.procedencia} nota={widget.nota} />
    </div>
  )
}

function WidgetDonut({ widget }) {
  const total = widget.datos.reduce((s, d) => s + d.valor, 0)
  let acumulado = 0
  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <div className="fin-donut">
        <svg viewBox="0 0 42 42" className="fin-donut-svg" role="img" aria-label={widget.titulo}>
          {widget.datos.map((d, i) => {
            const pct = total > 0 ? (d.valor / total) * 100 : 0
            const seg = (
              <circle
                key={i}
                cx="21"
                cy="21"
                r="15.9155"
                fill="none"
                stroke={PALETA[i % PALETA.length]}
                strokeWidth="5.5"
                strokeDasharray={`${Math.max(pct - 1.2, 0.5)} ${100 - Math.max(pct - 1.2, 0.5)}`}
                strokeDashoffset={-acumulado + 25}
              />
            )
            acumulado += pct
            return seg
          })}
        </svg>
        <ul className="fin-donut-leyenda">
          {widget.datos.map((d, i) => (
            <li key={i}>
              <span className="fin-punto" style={{ background: PALETA[i % PALETA.length] }} />
              <span className="fin-donut-nombre">{d.etiqueta}</span>
              <span className="fin-donut-cifra">{formatoValor(d.valor, widget.unidad)}</span>
            </li>
          ))}
        </ul>
      </div>
      <PieProcedencia procedencia={widget.procedencia} nota={widget.nota} />
    </div>
  )
}

function WidgetTabla({ widget }) {
  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <div className="tabla-scroll">
        <table className="tabla-app">
          <thead>
            <tr>
              {widget.columnas.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {widget.filas.map((fila, i) => (
              <tr key={i}>
                {fila.map((celda, j) => (
                  <td key={j}>{celda}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PieProcedencia procedencia={widget.procedencia} nota={widget.nota} />
    </div>
  )
}

function WidgetLista({ widget }) {
  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <ul className="ia-lista">
        {widget.items.map((it, i) => (
          <li key={i} title={textoProcedencia(it.procedencia) || undefined}>
            <span className="ia-lista-texto">{it.texto}</span>
            {it.detalle && <span className="ia-lista-detalle">{it.detalle}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function WidgetTexto({ widget }) {
  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <p className="ia-texto">{widget.texto}</p>
    </div>
  )
}

const RENDER = {
  tiles: WidgetTiles,
  barras: WidgetBarras,
  // El histograma son barras de intervalos: mismo dibujo, otra pregunta
  histograma: WidgetBarras,
  linea: WidgetLinea,
  donut: WidgetDonut,
  dispersion: WidgetDispersion,
  tabla: WidgetTabla,
  lista: WidgetLista,
  texto: WidgetTexto,
}

export default function VistaSeccionIA({ seccion }) {
  // Los tiles y las tablas ocupan todo el ancho; el resto de widgets se
  // empareja de dos en dos en una rejilla, en el orden que fijó la IA.
  const bloques = []
  for (const w of (seccion.widgets || []).filter((w) => RENDER[w?.tipo])) {
    // Las series temporales necesitan ancho para leerse; los tiles y las
    // tablas, también.
    if (w.tipo === 'tiles' || w.tipo === 'tabla' || w.tipo === 'linea') {
      bloques.push({ ancho: true, widgets: [w] })
    } else {
      const ultimo = bloques[bloques.length - 1]
      if (ultimo && !ultimo.ancho && ultimo.widgets.length < 2) ultimo.widgets.push(w)
      else bloques.push({ ancho: false, widgets: [w] })
    }
  }

  return (
    <div className="vista">
      {bloques.map((b, i) => {
        if (b.ancho) {
          const Widget = RENDER[b.widgets[0].tipo]
          return Widget ? <Widget key={i} widget={b.widgets[0]} /> : null
        }
        return (
          <div className="vista-rejilla-2" key={i}>
            {b.widgets.map((w, j) => {
              const Widget = RENDER[w.tipo]
              return Widget ? <Widget key={j} widget={w} /> : null
            })}
          </div>
        )
      })}
    </div>
  )
}
