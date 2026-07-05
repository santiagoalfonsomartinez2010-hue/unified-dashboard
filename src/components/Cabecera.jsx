import './Cabecera.css'

/*
  Barra superior de la zona principal (estilo app): título del apartado
  actual, subtítulo y acciones a la derecha.
*/
export default function Cabecera({ titulo, subtitulo, badge, children }) {
  return (
    <header className="cabecera">
      <div className="cabecera-textos">
        <h1>
          {titulo}
          {badge && <span className="cabecera-badge">{badge}</span>}
        </h1>
        {subtitulo && <p>{subtitulo}</p>}
      </div>
      {children && <div className="cabecera-acciones">{children}</div>}
    </header>
  )
}
