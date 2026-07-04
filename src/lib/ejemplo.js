/*
  Datos de ejemplo para enseñar la demo sin necesidad de API key ni archivos
  reales. Simulan cuatro fuentes ya procesadas por la IA (facturación, equipo,
  calendario e inventario) y el resumen global correspondiente.

  Las fechas de los eventos se generan relativas a "hoy" para que la sección
  de próximos eventos nunca aparezca vacía o caducada.
*/

// Fecha AAAA-MM-DD a `dias` días vista
function enDias(dias) {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function fuentesDeEjemplo() {
  const ahora = Date.now()
  return [
    {
      id: `ej-1-${ahora}`,
      nombreArchivo: 'facturas_2026.xlsx',
      tipoArchivo: 'excel',
      estado: 'listo',
      creado: ahora - 3000,
      esEjemplo: true,
      resultado: {
        titulo: 'Facturación primer semestre',
        categoria: 'finanzas',
        resumen:
          'Facturas emitidas entre enero y junio de 2026. Reformas Marín concentra el mayor importe y hay dos facturas aún pendientes de cobro.',
        columnas: ['numero', 'cliente', 'concepto', 'importe', 'estado'],
        registros: [
          { numero: 'F-2026-014', cliente: 'Reformas Marín', concepto: 'Obra local Calle Mayor', importe: '4.850 €', estado: 'Cobrada' },
          { numero: 'F-2026-015', cliente: 'Clínica Dental Sonrisa', concepto: 'Mantenimiento mensual', importe: '640 €', estado: 'Cobrada' },
          { numero: 'F-2026-016', cliente: 'Panadería El Horno', concepto: 'Instalación vitrina', importe: '1.290 €', estado: 'Pendiente' },
          { numero: 'F-2026-017', cliente: 'Reformas Marín', concepto: 'Ampliación almacén', importe: '6.200 €', estado: 'Pendiente' },
          { numero: 'F-2026-018', cliente: 'Gimnasio Vital', concepto: 'Revisión climatización', importe: '480 €', estado: 'Cobrada' },
        ],
        eventos: [
          { fecha: enDias(6), titulo: 'Vencimiento factura F-2026-016 (Panadería El Horno)' },
          { fecha: enDias(14), titulo: 'Vencimiento factura F-2026-017 (Reformas Marín)' },
        ],
        metricas: [
          { etiqueta: 'Facturado', valor: '13.460 €' },
          { etiqueta: 'Pendiente de cobro', valor: '7.490 €' },
          { etiqueta: 'Facturas', valor: '5' },
        ],
      },
    },
    {
      id: `ej-2-${ahora}`,
      nombreArchivo: 'equipo.pdf',
      tipoArchivo: 'pdf',
      estado: 'listo',
      creado: ahora - 2000,
      esEjemplo: true,
      resultado: {
        titulo: 'Plantilla y contratos del equipo',
        categoria: 'personas',
        resumen:
          'Listado del equipo con cargo y tipo de contrato. El contrato temporal de Lucía Ferrer vence este mes.',
        columnas: ['nombre', 'cargo', 'contrato', 'incorporacion'],
        registros: [
          { nombre: 'Marta Vidal', cargo: 'Jefa de obra', contrato: 'Indefinido', incorporacion: '2023-02-01' },
          { nombre: 'Andrés Soto', cargo: 'Técnico instalador', contrato: 'Indefinido', incorporacion: '2024-09-15' },
          { nombre: 'Lucía Ferrer', cargo: 'Administración', contrato: 'Temporal', incorporacion: '2025-11-03' },
          { nombre: 'Iván Ruiz', cargo: 'Técnico instalador', contrato: 'Prácticas', incorporacion: '2026-03-10' },
        ],
        eventos: [{ fecha: enDias(9), titulo: 'Fin de contrato temporal de Lucía Ferrer' }],
        metricas: [
          { etiqueta: 'Personas en plantilla', valor: '4' },
          { etiqueta: 'Contratos indefinidos', valor: '2' },
        ],
      },
    },
    {
      id: `ej-3-${ahora}`,
      nombreArchivo: 'agenda_julio.ics',
      tipoArchivo: 'calendario',
      estado: 'listo',
      creado: ahora - 1000,
      esEjemplo: true,
      resultado: {
        titulo: 'Agenda de obras y visitas',
        categoria: 'agenda',
        resumen: 'Calendario del mes con visitas comerciales, inicios de obra y una revisión de maquinaria.',
        columnas: ['fecha', 'cita', 'lugar'],
        registros: [
          { fecha: enDias(2), cita: 'Visita presupuesto', lugar: 'Cafetería La Plaza' },
          { fecha: enDias(5), cita: 'Inicio obra almacén', lugar: 'Reformas Marín' },
          { fecha: enDias(11), cita: 'Revisión maquinaria', lugar: 'Nave propia' },
          { fecha: enDias(18), cita: 'Entrega instalación', lugar: 'Gimnasio Vital' },
        ],
        eventos: [
          { fecha: enDias(2), titulo: 'Visita presupuesto — Cafetería La Plaza' },
          { fecha: enDias(5), titulo: 'Inicio obra almacén — Reformas Marín' },
          { fecha: enDias(11), titulo: 'Revisión de maquinaria' },
          { fecha: enDias(18), titulo: 'Entrega instalación — Gimnasio Vital' },
        ],
        metricas: [
          { etiqueta: 'Citas este mes', valor: '4' },
          { etiqueta: 'Obras activas', valor: '2' },
        ],
      },
    },
    {
      id: `ej-4-${ahora}`,
      nombreArchivo: 'foto_almacen.jpg',
      tipoArchivo: 'imagen',
      estado: 'listo',
      creado: ahora,
      esEjemplo: true,
      resultado: {
        titulo: 'Inventario de la pizarra del almacén',
        categoria: 'inventario',
        resumen:
          'Foto de la pizarra de material del almacén. Quedan pocas unidades de cable y de tubo de cobre.',
        columnas: ['material', 'unidades', 'aviso'],
        registros: [
          { material: 'Cable 2,5 mm (rollo)', unidades: '3', aviso: 'Reponer' },
          { material: 'Tubo cobre 18 mm', unidades: '6', aviso: 'Reponer' },
          { material: 'Cajas registro', unidades: '48', aviso: '' },
          { material: 'Soportes split', unidades: '15', aviso: '' },
        ],
        eventos: [],
        metricas: [
          { etiqueta: 'Referencias', valor: '4' },
          { etiqueta: 'Por reponer', valor: '2' },
        ],
      },
    },
  ]
}

// Tipo de dashboard que la IA habría detectado para las fuentes de ejemplo
export function tipoPanelDeEjemplo() {
  return {
    tipo: 'Gestión de negocio de instalaciones',
    emoji: '🔧',
    descripcion:
      'Organiza la facturación, el equipo, las citas y el inventario de un negocio de instalaciones y reformas.',
    confianza: 'alta',
    esEjemplo: true,
  }
}

export function resumenDeEjemplo() {
  return {
    titular:
      'Negocio con buena carga de trabajo: 13.460 € facturados este semestre, pero 7.490 € aún sin cobrar y material clave por reponer.',
    insights: [
      'Reformas Marín concentra 11.050 € (el 82 % de la facturación) y además tiene la mayor factura pendiente: dependes mucho de un solo cliente.',
      'El fin del contrato de Lucía Ferrer coincide con el arranque de la obra del almacén: riesgo de quedarte sin administración en plena punta de trabajo.',
      'Hay 4 citas ya agendadas y 2 obras activas, pero el almacén tiene 2 materiales marcados para reponer que se usan en instalaciones.',
    ],
    sugerencias: [
      'Reclama esta semana la factura F-2026-016 y confirma el cobro de la F-2026-017 antes de empezar la obra del almacén.',
      'Decide la renovación de Lucía Ferrer antes de su vencimiento para no perder capacidad administrativa.',
      'Haz pedido de cable y tubo de cobre antes del inicio de obra para evitar parones.',
    ],
    esEjemplo: true,
  }
}
