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

function WidgetTiles({ widget }) {
  return (
    <div className="fin-tiles">
      {widget.items.map((t, i) => (
        <div className="fin-tile" key={i}>
          <span className="fin-tile-et">{t.etiqueta.toUpperCase()}</span>
          <b style={t.color ? { color: COLOR_TILE[t.color] } : undefined}>{t.valor}</b>
          {t.detalle && <span className="fin-tile-pct">{t.detalle}</span>}
        </div>
      ))}
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
    </div>
  )
}

function WidgetLista({ widget }) {
  return (
    <div className="panel-card">
      {widget.titulo && <h3>{widget.titulo}</h3>}
      <ul className="ia-lista">
        {widget.items.map((it, i) => (
          <li key={i}>
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
  donut: WidgetDonut,
  tabla: WidgetTabla,
  lista: WidgetLista,
  texto: WidgetTexto,
}

export default function VistaSeccionIA({ seccion }) {
  // Los tiles y las tablas ocupan todo el ancho; el resto de widgets se
  // empareja de dos en dos en una rejilla, en el orden que fijó la IA.
  const bloques = []
  for (const w of seccion.widgets) {
    if (w.tipo === 'tiles' || w.tipo === 'tabla') {
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
          return <Widget key={i} widget={b.widgets[0]} />
        }
        return (
          <div className="vista-rejilla-2" key={i}>
            {b.widgets.map((w, j) => {
              const Widget = RENDER[w.tipo]
              return <Widget key={j} widget={w} />
            })}
          </div>
        )
      })}
    </div>
  )
}
