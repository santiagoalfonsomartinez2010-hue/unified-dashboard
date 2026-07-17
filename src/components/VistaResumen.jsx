import Kpis from './Kpis'
import AnalisisIA from './AnalisisIA'
import GraficoFuentes from './GraficoFuentes'
import GraficoDonut from './GraficoDonut'
import ProximosEventos from './ProximosEventos'
import './Vistas.css'

/*
  Apartado "Resumen": el pulso del panel. KPIs personalizados, análisis &
  alertas de la IA, gráficos y próximos eventos.
*/
export default function VistaResumen({
  listas,
  analisis,
  analizando,
  avisoAnalisis,
  editando,
  onEditarAnalisis,
  onActualizarAnalisis,
}) {
  const porFuente = listas
    .map((f) => ({
      id: f.id,
      nombre: f.resultado.titulo,
      valor: f.resultado.registros.length,
    }))
    .sort((a, b) => b.valor - a.valor)
  const totalRegistros = porFuente.reduce((suma, f) => suma + f.valor, 0)

  const porCategoria = {}
  for (const f of listas) {
    const clave = f.resultado.categoria
    porCategoria[clave] = (porCategoria[clave] || 0) + f.resultado.registros.length
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const eventos = listas
    .flatMap((f) => f.resultado.eventos.map((e) => ({ ...e, fuente: f.resultado.titulo })))
    .filter((e) => e.fecha && e.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))

  return (
    <div className="vista">
      <Kpis
        kpis={analisis?.kpis}
        numFuentes={listas.length}
        totalRegistros={totalRegistros}
        numEventos={eventos.length}
        editable={editando}
        onCambiar={(kpis) => onEditarAnalisis({ kpis })}
      />

      <div className="vista-rejilla-2">
        <AnalisisIA
          analisis={analisis}
          analizando={analizando}
          aviso={avisoAnalisis}
          hayFuentes={listas.length > 0}
          editable={editando}
          onEditar={onEditarAnalisis}
          onActualizar={onActualizarAnalisis}
        />
        <div className="panel-card">
          <h3>Mix por categoría</h3>
          <GraficoDonut porCategoria={porCategoria} total={totalRegistros} />
        </div>
      </div>

      <div className="vista-rejilla-2">
        <div className="panel-card">
          <h3>Registros por fuente</h3>
          <GraficoFuentes datos={porFuente} />
        </div>
        <div className="panel-card">
          <h3>Próximos eventos</h3>
          <ProximosEventos eventos={eventos} />
        </div>
      </div>
    </div>
  )
}
