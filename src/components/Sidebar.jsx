import {
  IconoPanel,
  IconoMas,
  IconoChispa,
  IconoPapelera,
  IconoLlave,
  IconoTipoArchivo,
  IconoGoogle,
  IconoSincronizar,
  IconoSalir,
  IconoUsuario,
} from './Iconos'
import { colorCliente } from '../lib/visuales'
import './Sidebar.css'

/*
  Columna izquierda: logo, selector de paneles del usuario, acciones
  principales (añadir datos, conectar Google, sincronizar…), lista de fuentes,
  estado de la API key y la cuenta con la que se ha iniciado sesión.
*/
export default function Sidebar({
  fuentes,
  hayApiKey,
  paneles,
  panelId,
  estadoGuardado,
  usuarioEmail,
  haySincronizables,
  sincronizando,
  onAnadir,
  onEjemplo,
  onVaciar,
  onApiKey,
  onCambiarPanel,
  onNuevoPanel,
  onBorrarPanel,
  onConectarGoogle,
  onSincronizar,
  onCerrarSesion,
}) {
  const textoGuardado = {
    guardando: 'Guardando…',
    guardado: 'Guardado en la nube',
    error: 'Error al guardar',
    local: 'Modo local (solo este navegador)',
  }[estadoGuardado]

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
        <button className="sidebar-item activo" type="button">
          <IconoPanel /> Panel
        </button>
        <button className="sidebar-item" type="button" onClick={onAnadir}>
          <IconoMas /> Añadir datos
        </button>
        <button className="sidebar-item" type="button" onClick={onConectarGoogle}>
          <IconoGoogle /> Conectar Google
        </button>
        {haySincronizables && (
          <button
            className="sidebar-item"
            type="button"
            onClick={onSincronizar}
            disabled={sincronizando}
          >
            <IconoSincronizar /> {sincronizando ? 'Sincronizando…' : 'Sincronizar Google'}
          </button>
        )}
        <button className="sidebar-item" type="button" onClick={onEjemplo}>
          <IconoChispa /> Datos de ejemplo
        </button>
        {fuentes.length > 0 && (
          <button className="sidebar-item peligro" type="button" onClick={onVaciar}>
            <IconoPapelera /> Vaciar panel
          </button>
        )}
      </nav>

      <div className="sidebar-seccion">Fuentes conectadas</div>
      <div className="sidebar-fuentes">
        {fuentes.length === 0 && (
          <p className="sidebar-vacio">
            Aún no hay fuentes. Sube un Excel, un PDF, una imagen o conecta tu cuenta de Google.
          </p>
        )}
        {fuentes.map((f) => (
          <div className="sidebar-fuente" key={f.id} title={f.nombreArchivo}>
            <span
              className="sidebar-fuente-icono"
              style={{ color: colorCliente(f.nombreArchivo) }}
            >
              <IconoTipoArchivo tipo={f.tipoArchivo} tam={16} />
            </span>
            <span className="sidebar-fuente-nombre">
              {f.resultado?.titulo || f.nombreArchivo}
            </span>
            <span className={`sidebar-fuente-punto ${f.estado}`} title={f.estado} />
          </div>
        ))}
      </div>

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
