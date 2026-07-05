import { IconoMas, IconoChispa, IconoSincronizar } from './Iconos'
import Cabecera from './Cabecera'
import VistaResumen from './VistaResumen'
import VistaAgenda from './VistaAgenda'
import VistaCategoria from './VistaCategoria'
import VistaFuentes from './VistaFuentes'
import { infoCategoria } from '../lib/categorias'
import './Panel.css'

/*
  Zona principal del dashboard, organizada por APARTADOS navegables desde la
  barra lateral (como una app de verdad): Resumen, Agenda, un apartado por
  cada categoría de datos presente y Fuentes.
*/
export default function Panel({
  vista,
  fuentes,
  analisis,
  analizando,
  avisoAnalisis,
  nombrePanel,
  perfil,
  onActualizarAnalisis,
  onQuitarFuente,
  onPedirArchivos,
  onArchivosSoltados,
  onEjemplo,
}) {
  const listas = fuentes.filter((f) => f.estado === 'listo')

  const etiquetaProposito =
    perfil?.proposito === 'negocio'
      ? 'Negocio'
      : perfil?.proposito === 'trabajo'
        ? 'Trabajo'
        : perfil?.proposito === 'personal'
          ? 'Personal'
          : null

  // Estado vacío: el panel existe pero aún no tiene datos
  if (fuentes.length === 0) {
    return (
      <>
        <Cabecera
          titulo={`${analisis?.emoji ? `${analisis.emoji} ` : ''}${nombrePanel || 'Mi panel'}`}
          badge={etiquetaProposito}
          subtitulo="Tu panel está esperando datos."
        />
        <div className="vista">
          <div
            className="panel-vacio"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              onArchivosSoltados(e.dataTransfer.files)
            }}
          >
            <h2>Añade tus primeros datos</h2>
            <p>
              Sube Excels, PDFs, imágenes o calendarios (o arrástralos aquí) y la IA los
              entenderá en conjunto: cifras clave, conexiones entre tus datos, agenda y
              sugerencias.
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
        </div>
      </>
    )
  }

  // Cabecera según el apartado activo
  let titulo = ''
  let subtitulo = ''
  let badge = null
  if (vista === 'resumen') {
    titulo = `${analisis?.emoji ? `${analisis.emoji} ` : ''}${nombrePanel || 'Mi panel'}`
    badge = etiquetaProposito
    subtitulo = analisis?.tipo
      ? `${analisis.tipo}${analisis.descripcion ? ` — ${analisis.descripcion}` : ''}`
      : analizando
        ? 'La IA está entendiendo tus datos para personalizar el panel…'
        : `${listas.length} ${listas.length === 1 ? 'fuente conectada' : 'fuentes conectadas'}`
  } else if (vista === 'agenda') {
    titulo = 'Agenda'
    subtitulo = 'Citas, vencimientos y entregas de todas tus fuentes, por día.'
  } else if (vista === 'fuentes') {
    titulo = 'Fuentes'
    subtitulo = 'Gestiona los datos conectados a este panel.'
  } else if (vista.startsWith('cat:')) {
    const cat = vista.slice(4)
    const info = infoCategoria(cat)
    const deCat = listas.filter((f) => f.resultado.categoria === cat)
    const registros = deCat.reduce((s, f) => s + f.resultado.registros.length, 0)
    titulo = info.etiqueta
    subtitulo = `${deCat.length} ${deCat.length === 1 ? 'fuente' : 'fuentes'} · ${registros} registros`
  }

  return (
    <>
      <Cabecera titulo={titulo} subtitulo={subtitulo} badge={badge}>
        {vista === 'resumen' && (
          <button
            className="boton-secundario"
            type="button"
            onClick={onActualizarAnalisis}
            disabled={analizando || listas.length === 0}
          >
            <IconoSincronizar tam={14} /> {analizando ? 'Analizando…' : 'Actualizar análisis'}
          </button>
        )}
        <button className="boton-primario" type="button" onClick={onPedirArchivos}>
          <IconoMas tam={15} /> Añadir datos
        </button>
      </Cabecera>

      {vista === 'resumen' && (
        <VistaResumen
          listas={listas}
          analisis={analisis}
          analizando={analizando}
          avisoAnalisis={avisoAnalisis}
          onActualizarAnalisis={onActualizarAnalisis}
        />
      )}
      {vista === 'agenda' && <VistaAgenda listas={listas} />}
      {vista === 'fuentes' && (
        <VistaFuentes fuentes={fuentes} onQuitarFuente={onQuitarFuente} />
      )}
      {vista.startsWith('cat:') && (
        <VistaCategoria
          categoria={vista.slice(4)}
          fuentes={fuentes}
          onQuitarFuente={onQuitarFuente}
        />
      )}
    </>
  )
}
