import { IconoMas, IconoChispa } from './Iconos'
import Kpis from './Kpis'
import GraficoFuentes from './GraficoFuentes'
import GraficoCategorias from './GraficoCategorias'
import ProximosEventos from './ProximosEventos'
import ResumenIA from './ResumenIA'
import TarjetaFuente from './TarjetaFuente'
import './Panel.css'

/*
  Dashboard unificado: agrega todas las fuentes procesadas en KPIs, gráficos,
  próximos eventos, resumen de IA y una tarjeta por fuente. Todos los datos
  derivados se calculan aquí y se pasan ya masticados a los subcomponentes.
*/
export default function Panel({
  fuentes,
  resumen,
  nombrePanel,
  tipoPanel,
  detectandoTipo,
  generandoResumen,
  avisoResumen,
  onGenerarResumen,
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

  if (fuentes.length === 0) {
    return (
      <section className="panel">
        <div className="panel-vacio">
          <h2>Tu panel está esperando datos</h2>
          <p>
            Conecta tus primeras fuentes y aquí aparecerán tus cifras clave, próximos eventos y
            todas tus tablas, organizadas por la IA.
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
            {tipoPanel?.emoji ? `${tipoPanel.emoji} ` : ''}
            {nombrePanel || 'Panel unificado'}
          </h2>
          {tipoPanel ? (
            <p className="panel-cabecera-sub">
              <span className="panel-tipo">{tipoPanel.tipo}</span>
              {tipoPanel.descripcion ? ` — ${tipoPanel.descripcion}` : ''}
            </p>
          ) : (
            <p className="panel-cabecera-sub">
              {detectandoTipo
                ? 'La IA está detectando qué tipo de dashboard estás montando…'
                : `${listas.length} ${listas.length === 1 ? 'fuente conectada' : 'fuentes conectadas'} · actualizado al subir cada archivo`}
            </p>
          )}
        </div>
        <button className="boton-secundario" type="button" onClick={onPedirArchivos}>
          <IconoMas tam={16} /> Añadir datos
        </button>
      </div>

      <Kpis
        numFuentes={listas.length}
        totalRegistros={totalRegistros}
        numEventos={eventos.length}
        numCategorias={Object.keys(porCategoria).length}
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

      <ResumenIA
        resumen={resumen}
        generando={generandoResumen}
        aviso={avisoResumen}
        hayFuentes={listas.length > 0}
        onGenerar={onGenerarResumen}
      />

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
