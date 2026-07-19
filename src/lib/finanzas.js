/*
  Utilidades para el apartado de Finanzas: como las tablas las crea el usuario
  (columnas libres), detectamos "a ojo" qué columna es el importe, cuál el
  estado (cobrado/pendiente…) y cuál la fecha, y agregamos los datos para las
  gráficas.
*/

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Convierte "4.850 €", "€1.290,50", "6200", "1,290.50"… en número (o null)
export function parseImporte(valor) {
  if (typeof valor === 'number') return isFinite(valor) ? valor : null
  let s = String(valor ?? '').trim()
  if (!s) return null
  // Deja solo dígitos, separadores y signo
  s = s.replace(/[^\d.,-]/g, '')
  if (!s || !/\d/.test(s)) return null
  const tieneComa = s.includes(',')
  const tienePunto = s.includes('.')
  if (tieneComa && tienePunto) {
    // El último separador que aparece es el decimal
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (tieneComa) {
    // Coma sola: decimal si va seguida de 1-2 dígitos al final; si no, miles
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '')
  } else if (tienePunto) {
    // Punto solo: en formato español suele ser separador de miles.
    // Se trata como miles si hay más de un punto, o si va seguido de 3
    // dígitos al final (4.850 → 4850). Si va seguido de 1-2 dígitos es
    // decimal (3.50 → 3.5) y se deja tal cual.
    const puntos = (s.match(/\./g) || []).length
    if (puntos > 1 || /\.\d{3}$/.test(s)) s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  return isFinite(n) ? n : null
}

// Formatea un número como euros (sin decimales si es entero)
export function formatoEuros(n) {
  if (n == null || !isFinite(n)) return '—'
  const entero = Math.round(n) === n
  return `${n.toLocaleString('es-ES', {
    minimumFractionDigits: entero ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  })} €`
}

// Clasifica un valor de estado en cobrado / pendiente / otro
const COBRADO = ['cobrado', 'cobrada', 'pagado', 'pagada', 'ingresado', 'recibido', 'ok', 'sí', 'si']
const PENDIENTE = ['pendiente', 'impago', 'impagado', 'vencido', 'vencida', 'no', 'debe', 'moroso']
export function claseEstado(valor) {
  const v = String(valor ?? '').trim().toLowerCase()
  if (COBRADO.includes(v)) return 'cobrado'
  if (PENDIENTE.includes(v)) return 'pendiente'
  return v ? 'otro' : null
}

// Columna cuyos valores parsean mayormente como importe (prioriza nombres típicos)
export function detectarColumnaImporte(columnas, registros) {
  if (!columnas?.length || !registros?.length) return null
  const prefer = /importe|monto|cantidad|total|precio|coste|gasto|ingreso|factura|€|eur|saldo|valor|pago/i
  const puntua = (col) => {
    const validos = registros.filter((f) => parseImporte(f[col]) != null).length
    const ratio = validos / registros.length
    return ratio + (prefer.test(col) ? 0.5 : 0)
  }
  let mejor = null
  let mejorP = 0.35 // umbral mínimo: al menos ~35% de la columna numérica
  for (const col of columnas) {
    const p = puntua(col)
    if (p > mejorP) {
      mejorP = p
      mejor = col
    }
  }
  return mejor
}

// Columna que parece de estado (mayoría de valores clasificables)
export function detectarColumnaEstado(columnas, registros) {
  if (!columnas?.length || !registros?.length) return null
  const prefer = /estado|situaci|pago|cobro|status/i
  let mejor = null
  let mejorP = 0.3
  for (const col of columnas) {
    const validos = registros.filter((f) => claseEstado(f[col])).length
    const p = validos / registros.length + (prefer.test(col) ? 0.4 : 0)
    if (p > mejorP) {
      mejorP = p
      mejor = col
    }
  }
  return mejor
}

// Columna con pinta de fecha AAAA-MM-DD (o AAAA/MM/DD)
export function detectarColumnaFecha(columnas, registros) {
  if (!columnas?.length || !registros?.length) return null
  for (const col of columnas) {
    const validos = registros.filter((f) => /\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(String(f[col] ?? ''))).length
    if (validos / registros.length > 0.5) return col
  }
  return null
}

// Extrae "AAAA-MM" de un valor de fecha, o null
function claveMes(valor) {
  const m = String(valor ?? '').match(/(\d{4})[-/](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}`
}

/*
  Agrega TODAS las fuentes de finanzas en:
   { total, hayImportes, porEstado: [{clase, etiqueta, monto}],
     porMes: [{clave, etiqueta, monto}], conceptos: [{etiqueta, monto, clase}] }
*/
export function resumenFinanzas(fuentes) {
  let total = 0
  let hayImportes = false
  const porEstadoMap = { cobrado: 0, pendiente: 0, otro: 0 }
  const porMesMap = new Map()
  const conceptos = []

  for (const f of fuentes) {
    const r = f.resultado
    const colImporte = detectarColumnaImporte(r.columnas, r.registros)
    if (!colImporte) continue
    const colEstado = detectarColumnaEstado(r.columnas, r.registros)
    const colFecha = detectarColumnaFecha(r.columnas, r.registros)
    // La etiqueta del concepto: primera columna de texto que no sea importe/estado/fecha
    const colEtiqueta =
      r.columnas.find(
        (c) => c !== colImporte && c !== colEstado && c !== colFecha && parseImporte(r.registros[0]?.[c]) == null
      ) || r.columnas.find((c) => c !== colImporte) || colImporte

    for (const fila of r.registros) {
      const monto = parseImporte(fila[colImporte])
      if (monto == null) continue
      hayImportes = true
      total += monto
      const clase = (colEstado && claseEstado(fila[colEstado])) || 'otro'
      porEstadoMap[clase] = (porEstadoMap[clase] || 0) + monto
      if (colFecha) {
        const k = claveMes(fila[colFecha])
        if (k) porMesMap.set(k, (porMesMap.get(k) || 0) + monto)
      }
      conceptos.push({ etiqueta: String(fila[colEtiqueta] ?? '—'), monto, clase })
    }
  }

  const etiquetasEstado = { cobrado: 'Cobrado', pendiente: 'Pendiente', otro: 'Otros' }
  const porEstado = ['cobrado', 'pendiente', 'otro']
    .filter((c) => porEstadoMap[c] > 0)
    .map((c) => ({ clase: c, etiqueta: etiquetasEstado[c], monto: porEstadoMap[c] }))

  const porMes = [...porMesMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-8)
    .map(([clave, monto]) => {
      const [, mes] = clave.split('-')
      return { clave, etiqueta: MESES_CORTOS[Number(mes) - 1] || mes, monto }
    })

  conceptos.sort((a, b) => b.monto - a.monto)

  return { total, hayImportes, porEstado, porMes, conceptos: conceptos.slice(0, 8) }
}
