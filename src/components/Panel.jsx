import { IconoMas, IconoChispa } from './Iconos'
import Kpis from './Kpis'
import GraficoFuentes from './GraficoFuentes'
import GraficoCategorias from './GraficoCategorias'
import ProximosEventos from './ProximosEventos'
import AnalisisIA from './AnalisisIA'
import TarjetaFuente from './TarjetaFuente'
import './Panel.css'

/*
  Dashboard unificado. El protagonista es el ANÁLISIS de la IA (tipo de panel,
  KPIs personalizados y conexiones entre fuentes), no el volcado de tablas:
  las tablas quedan al final, plegadas dentro de cada tarjeta de fuente.
*/
export default function Panel({
  fuentes,
  analisis,
  analizando,
  avisoAnalisis,
  nombrePanel,
  perfil,
  onActualizarAnalisis,
  onQuitarFuente,
  onPedirArchivos,
  onEjemplo,
}) {
  const listas = fuentes.filter((f) => f.estado === 'listo')

  // Registros totales y por fuente (para el gráfico de barras)
  const porFuente = listas
    .map((f) => ({
      id: f.id,
      nombre: f.resultado.titulo,
      valor: f.resultado.registros.length,
    }))
    .sort((a, b) => b.valor - a.valor)
  const totalRegistros = porFuente.reduce((suma, f) => suma + f.valor, 0)

  // Registros por categoría (para la barra apilada)
  const porCategoria = {}
  for (const f of listas) {
    const clave = f.resultado.categoria
    porCategoria[clave] = (porCategoria[clave] || 0) + f.resultado.registros.length
  }

  // Eventos de todas las fuentes, de hoy en adelante, ordenados por fecha
  const hoy = new Date().toISOString().slice(0, 10)
  const eventos = listas
    .flatMap((f) =>
      f.resultado.eventos.map((e) => ({ ...e, fuente: f.resultado.titulo }))
    )
    .filter((e) => e.fecha && e.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  const etiquetaProposito =
    perfil?.proposito === 'negocio'
      ? 'Negocio'
      : perfil?.proposito === 'trabajo'
        ? 'Trabajo'
        : perfil?.proposito === 'personal'
          ? 'Personal'
          : null

  if (fuentes.length === 0) {
    return (
      <section className="panel">
        <div className="panel-vacio">
          <h2>Tu panel está esperando datos</h2>
          <p>
            Añade tus primeros archivos y la IA los entenderá en conjunto: cifras clave,
            conexiones entre tus datos, agenda unificada y sugerencias.
          </p>
          <div className="panel-vacio-botones">
            <button className="boton-primario" type="button" onClick={onPedirArchivos}>
              <IconoMas tam={16} /> Añadir archivos
            </button>
            <button className="boton-secundario" type="button" onClick={onEjemplo}>
              <IconoChispa tam={16} /> Ver con datos de ejemplo
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <div className="panel-cabecera">
        <div>
          <h2>
            {analisis?.emoji ? `${analisis.emoji} ` : ''}
            {nombrePanel || 'Panel unificado'}
            {etiquetaProposito && <span className="panel-badge">{etiquetaProposito}</span>}
          </h2>
          {analisis?.tipo ? (
            <p className="panel-cabecera-sub">
              <span className="panel-tipo">{analisis.tipo}</span>
              {analisis.descripcion ? ` — ${analisis.descripcion}` : ''}
            </p>
          ) : (
            <p className="panel-cabecera-sub">
              {analizando
                ? 'La IA está entendiendo tus datos para personalizar el panel…'
                : `${listas.length} ${listas.length === 1 ? 'fuente conectada' : 'fuentes conectadas'}`}
            </p>
          )}
        </div>
        <button className="boton-secundario" type="button" onClick={onPedirArchivos}>
          <IconoMas tam={16} /> Añadir datos
        </button>
      </div>

      <Kpis
        kpis={analisis?.kpis}
        numFuentes={listas.length}
        totalRegistros={totalRegistros}
        numEventos={eventos.length}
      />

      <AnalisisIA
        analisis={analisis}
        analizando={analizando}
        aviso={avisoAnalisis}
        hayFuentes={listas.length > 0}
        onActualizar={onActualizarAnalisis}
      />

      <div className="panel-rejilla">
        <div className="panel-card">
          <h3>Registros por fuente</h3>
          <GraficoFuentes datos={porFuente} />
        </div>
        <div className="panel-card">
          <h3>Registros por categoría</h3>
          <GraficoCategorias porCategoria={porCategoria} total={totalRegistros} />
        </div>
        <div className="panel-card panel-card-eventos">
          <h3>Próximos eventos</h3>
          <ProximosEventos eventos={eventos} />
        </div>
      </div>

      <div className="panel-fuentes-titulo">
        <h3>Tus fuentes</h3>
        <span>{fuentes.length}</span>
      </div>
      <div className="panel-fuentes">
        {[...fuentes]
          .sort((a, b) => b.creado - a.creado)
          .map((f) => (
            <TarjetaFuente key={f.id} fuente={f} onQuitar={() => onQuitarFuente(f.id)} />
          ))}
      </div>
    </section>
  )
}
