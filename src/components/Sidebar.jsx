import {
  IconoPanel,
  IconoMas,
  IconoChispa,
  IconoPapelera,
  IconoLlave,
  IconoCalendario,
  IconoTabla,
  IconoCategoria,
  IconoPaleta,
  IconoSalir,
  IconoUsuario,
} from './Iconos'
import { infoCategoria } from '../lib/categorias'
import './Sidebar.css'

/*
  Barra lateral estilo app: logo, selector de paneles del usuario y la
  NAVEGACIÓN POR APARTADOS del dashboard — Resumen, Agenda, los apartados
  DISEÑADOS POR LA IA en el análisis (secciones) y, como zona de datos, un
  apartado por categoría y Fuentes — más las acciones y la cuenta abajo.
*/
export default function Sidebar({
  fuentes,
  categorias,
  secciones = [],
  vista,
  hayApiKey,
  paneles,
  panelId,
  estadoGuardado,
  usuarioEmail,
  onVista,
  onAnadir,
  onNuevaTabla,
  onPersonalizar,
  onEjemplo,
  onVaciar,
  onApiKey,
  onCambiarPanel,
  onNuevoPanel,
  onBorrarPanel,
  onCerrarSesion,
}) {
  const textoGuardado = {
    guardando: 'Guardando…',
    guardado: 'Guardado en la nube',
    error: 'Error al guardar',
    local: 'Modo local (solo este navegador)',
  }[estadoGuardado]

  const procesadas = fuentes.filter((f) => f.estado === 'listo')
  const hayAgenda =
    procesadas.some((f) => (f.resultado.eventos?.length || 0) > 0) ||
    procesadas.some((f) => f.resultado.categoria === 'agenda')

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-cuadro">E</span>
        <div>
          <strong>Empleia</strong>
          <span className="sidebar-logo-sub">Panel Unificado</span>
        </div>
      </div>

      {paneles.length > 0 && (
        <div className="sidebar-paneles">
          <select
            value={panelId || ''}
            onChange={(e) => onCambiarPanel(e.target.value)}
            title="Cambiar de panel"
          >
            {paneles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <button type="button" onClick={onNuevoPanel} title="Crear otro panel">
            <IconoMas tam={15} />
          </button>
          {paneles.length > 1 && (
            <button
              type="button"
              className="peligro"
              onClick={onBorrarPanel}
              title="Borrar este panel"
            >
              <IconoPapelera tam={15} />
            </button>
          )}
        </div>
      )}

      <nav className="sidebar-nav">
        <button
          className={`sidebar-item ${vista === 'resumen' ? 'activo' : ''}`}
          type="button"
          onClick={() => onVista('resumen')}
        >
          <IconoPanel /> Resumen
        </button>
        {hayAgenda && (
          <button
            className={`sidebar-item ${vista === 'agenda' ? 'activo' : ''}`}
            type="button"
            onClick={() => onVista('agenda')}
          >
            <IconoCalendario /> Agenda
          </button>
        )}
        {secciones.map((s) => (
          <button
            key={s.id}
            className={`sidebar-item ${vista === `ia:${s.id}` ? 'activo' : ''}`}
            type="button"
            onClick={() => onVista(`ia:${s.id}`)}
            title={s.descripcion || undefined}
          >
            <span className="sidebar-emoji">{s.icono || '✨'}</span> {s.titulo}
          </button>
        ))}
        {secciones.length > 0 && (categorias.length > 0 || fuentes.length > 0) && (
          <div className="sidebar-seccion sidebar-seccion-nav">Tus datos</div>
        )}
        {categorias.map((cat) => (
          <button
            key={cat}
            className={`sidebar-item ${vista === `cat:${cat}` ? 'activo' : ''}`}
            type="button"
            onClick={() => onVista(`cat:${cat}`)}
          >
            <IconoCategoria categoria={cat} /> {infoCategoria(cat).etiqueta}
          </button>
        ))}
        {fuentes.length > 0 && (
          <button
            className={`sidebar-item ${vista === 'fuentes' ? 'activo' : ''}`}
            type="button"
            onClick={() => onVista('fuentes')}
          >
            <IconoTabla /> Fuentes
            <span className="sidebar-contador">{fuentes.length}</span>
          </button>
        )}
      </nav>

      <div className="sidebar-seccion">Acciones</div>
      <nav className="sidebar-nav">
        <button className="sidebar-item" type="button" onClick={onAnadir}>
          <IconoMas /> Añadir datos
        </button>
        <button className="sidebar-item" type="button" onClick={onNuevaTabla}>
          <IconoTabla /> Nueva tabla manual
        </button>
        <button className="sidebar-item" type="button" onClick={onPersonalizar}>
          <IconoPaleta /> Personalizar
        </button>
        <button className="sidebar-item" type="button" onClick={onEjemplo}>
          <IconoChispa /> Datos de ejemplo
        </button>
        {fuentes.length > 0 && (
          <button className="sidebar-item peligro" type="button" onClick={onVaciar}>
            <IconoPapelera /> Vaciar panel
          </button>
        )}
      </nav>

      <div className="sidebar-hueco" />

      {textoGuardado && (
        <p className={`sidebar-guardado ${estadoGuardado}`}>{textoGuardado}</p>
      )}

      <button className="sidebar-apikey" type="button" onClick={onApiKey}>
        <span className="sidebar-apikey-icono">
          <IconoLlave tam={16} />
        </span>
        <span className="sidebar-apikey-texto">
          <strong>API key de Gemini</strong>
          <span className={hayApiKey ? 'ok' : 'falta'}>
            {hayApiKey ? 'Configurada' : 'Sin configurar'}
          </span>
        </span>
      </button>

      {usuarioEmail && (
        <div className="sidebar-usuario">
          <span className="sidebar-usuario-icono">
            <IconoUsuario tam={15} />
          </span>
          <span className="sidebar-usuario-email" title={usuarioEmail}>
            {usuarioEmail}
          </span>
          <button type="button" onClick={onCerrarSesion} title="Cerrar sesión">
            <IconoSalir tam={15} />
          </button>
        </div>
      )}
    </aside>
  )
}
