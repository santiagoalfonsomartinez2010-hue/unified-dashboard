import TarjetaFuente from './TarjetaFuente'
import './Vistas.css'

/*
  Apartado "Fuentes": gestión de todos los datos conectados al panel, con la
  tarjeta clásica por fuente (estado, métricas y tabla plegable).
*/
export default function VistaFuentes({ fuentes, onQuitarFuente }) {
  return (
    <div className="vista">
      <div className="vista-fuentes">
        {[...fuentes]
          .sort((a, b) => b.creado - a.creado)
          .map((f) => (
            <TarjetaFuente key={f.id} fuente={f} onQuitar={() => onQuitarFuente(f.id)} />
          ))}
      </div>
    </div>
  )
}
