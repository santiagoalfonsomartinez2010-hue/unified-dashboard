/*
  Iconos SVG inline compartidos por toda la app (trazo 1.5–2, tamaño por
  defecto 18px, color heredado con currentColor).
*/

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconoPanel({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </svg>
  )
}

export function IconoMas({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconoSubir({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M12 16V4m0 0 5 5m-5-5-5 5" />
      <path d="M4 20h16" />
    </svg>
  )
}

export function IconoChispa({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6z" strokeWidth="1.3" />
    </svg>
  )
}

export function IconoCalendario({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  )
}

export function IconoTabla({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M9.5 9.5v10" />
    </svg>
  )
}

export function IconoDocumento({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M6 3.5h8l4 4v13H6v-17z" />
      <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
    </svg>
  )
}

export function IconoImagen({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 15.5 16 11l-8.5 8.5" />
    </svg>
  )
}

export function IconoTexto({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M5 6h14M5 10h14M5 14h9M5 18h6" />
    </svg>
  )
}

export function IconoLlave({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2 20 3m-3.5 3.5 3 3" />
    </svg>
  )
}

export function IconoPapelera({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M4.5 6.5h15M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
      <path d="M6.5 6.5 7.4 20h9.2l.9-13.5" />
    </svg>
  )
}

export function IconoCerrar({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconoAlerta({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M12 4 2.8 20h18.4L12 4z" />
      <path d="M12 10v4.5M12 17.5v.1" />
    </svg>
  )
}

export function IconoChevron({ tam = 16, abierto = false }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      {...base}
      style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function IconoCorreo({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

export function IconoGoogle({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 12h8.5M12 12V8.5M12 12l-6 6" />
    </svg>
  )
}

export function IconoSincronizar({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M20 11a8 8 0 0 0-14.9-3M4 13a8 8 0 0 0 14.9 3" />
      <path d="M20 4v4h-4M4 20v-4h4" />
    </svg>
  )
}

export function IconoSalir({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <path d="M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14" />
      <path d="M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5" />
    </svg>
  )
}

export function IconoUsuario({ tam = 18 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" {...base}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c1.3-3.2 4-4.8 7-4.8s5.7 1.6 7 4.8" />
    </svg>
  )
}

// Icono según el tipo de archivo o conexión de la fuente
export function IconoTipoArchivo({ tipo, tam = 18 }) {
  if (tipo === 'excel') return <IconoTabla tam={tam} />
  if (tipo === 'pdf') return <IconoDocumento tam={tam} />
  if (tipo === 'calendario' || tipo === 'gcalendar') return <IconoCalendario tam={tam} />
  if (tipo === 'texto') return <IconoTexto tam={tam} />
  if (tipo === 'gmail') return <IconoCorreo tam={tam} />
  if (tipo === 'gsheets') return <IconoTabla tam={tam} />
  return <IconoImagen tam={tam} />
}
