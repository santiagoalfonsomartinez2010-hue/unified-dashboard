/*
  Formato de cifras para el dashboard.

  Regla importante: la unidad solo se pinta si CONSTA en los datos. Si el
  Excel trae "1200" a secas, se muestra "1.200" y no "1.200 €": inventar la
  moneda es exactamente el tipo de dato falso que el panel debe evitar.
*/

const SIMBOLOS = { EUR: '€', USD: '$', GBP: '£', JPY: '¥', CHF: 'CHF', MXN: '$' }

// Formatea un número en español, con la unidad detrás si se conoce
export function formatearNumero(n, unidad = null, opciones = {}) {
  if (n == null || !isFinite(n)) return '—'
  const { compacto = false, decimales } = opciones

  if (unidad === '%') {
    return `${formatearCifra(n, decimales ?? (Number.isInteger(n) ? 0 : 1))} %`
  }

  const simbolo = SIMBOLOS[unidad]
  const texto = compacto && Math.abs(n) >= 10000 ? abreviar(n) : formatearCifra(n, decimales)

  if (simbolo) return `${texto} ${simbolo}`
  if (unidad === 'uds') return `${texto} uds`
  if (unidad) return `${texto} ${unidad}`
  return texto
}

function formatearCifra(n, decimales) {
  const dec = decimales ?? (Number.isInteger(n) ? 0 : 2)
  return n.toLocaleString('es-ES', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
    useGrouping: 'always',
  })
}

// 1.234.567 → "1,23 M" (para tarjetas estrechas)
function abreviar(n) {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${formatearCifra(n / 1e9, 2)} MM`
  if (abs >= 1e6) return `${formatearCifra(n / 1e6, 2)} M`
  return `${formatearCifra(n / 1000, 1)} k`
}

// Variación en porcentaje, con su signo ("+23,4 %")
export function formatearVariacion(pct) {
  if (pct == null || !isFinite(pct)) return '—'
  const signo = pct > 0 ? '+' : ''
  return `${signo}${pct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`
}

// Recuento con la palabra que corresponda ("1 factura" / "5 facturas")
export function plural(n, singular, plural_) {
  return `${n.toLocaleString('es-ES')} ${n === 1 ? singular : plural_}`
}
