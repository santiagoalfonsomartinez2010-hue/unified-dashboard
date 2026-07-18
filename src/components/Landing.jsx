import {
  IconoChispa,
  IconoPanel,
  IconoTabla,
  IconoCalendario,
  IconoMoneda,
  IconoPersonas,
  IconoLapiz,
  IconoPaleta,
  IconoLlave,
  IconoDocumento,
  IconoCategoria,
} from './Iconos'
import './Landing.css'

/*
  Portada / landing de Empleia. Es lo primero que ve alguien sin sesión:
  explica qué es Empleia y todo lo que hace, con una maqueta del panel, la
  lista de funciones y los pasos, y lleva al registro / login.

  Props:
   - onCrear():   abre el formulario en la pestaña "Crear cuenta"
   - onIniciar(): abre el formulario en la pestaña "Iniciar sesión"
   - onDemo():    entra en modo local con datos de ejemplo (sin cuenta)
*/

const FUNCIONES = [
  {
    Icono: IconoChispa,
    titulo: 'La IA entiende tu dashboard',
    texto:
      'Detecta qué estás montando —una peluquería, un gimnasio, el control de pagos…— y personaliza el panel a tu caso.',
  },
  {
    Icono: IconoDocumento,
    titulo: 'Sube cualquier cosa',
    texto:
      'Excels, PDFs, imágenes, calendarios (.ics) o JSON. La IA los lee, los normaliza y los cruza entre sí.',
  },
  {
    Icono: IconoPanel,
    titulo: 'Análisis inteligente',
    texto:
      'No vuelca tablas: calcula cifras clave, detecta conexiones entre tus datos y te sugiere qué hacer.',
  },
  {
    Icono: IconoCategoria,
    titulo: 'Dashboard por apartados',
    texto:
      'Resumen, Agenda, Finanzas, Clientes, Inventario… como una app de verdad, no una lista larga.',
  },
  {
    Icono: IconoChispa,
    titulo: 'Asistente con IA',
    texto:
      'Un chatbot que responde preguntas sobre tus datos y edita el panel por ti: estilo, tablas, métricas…',
  },
  {
    Icono: IconoLapiz,
    titulo: 'Edición manual total',
    texto:
      'Añade citas, proveedores o clientes a mano, crea tablas desde cero y edita cualquier celda cuando quieras.',
  },
  {
    Icono: IconoPaleta,
    titulo: 'Personalízalo a tu gusto',
    texto:
      'Nombre, emoji, tema claro u oscuro y el color de acento que prefieras. Tu panel, tu estilo.',
  },
  {
    Icono: IconoLlave,
    titulo: 'Tu cuenta en la nube',
    texto:
      'Tus dashboards se guardan solos en tu cuenta: entra desde el móvil, la tablet o el ordenador.',
  },
]

const PASOS = [
  {
    n: '1',
    titulo: 'Crea tu cuenta',
    texto: 'Gratis y en un minuto. Tus paneles quedan guardados y accesibles desde cualquier sitio.',
  },
  {
    n: '2',
    titulo: 'Cuéntanos y sube tus datos',
    texto:
      'Respondes unas preguntas rápidas (para qué es, a qué te dedicas) y añades tus archivos de golpe.',
  },
  {
    n: '3',
    titulo: 'La IA lo organiza',
    texto:
      'Al pulsar "Crear", cruza todo y te devuelve un panel con cifras, conexiones, agenda y sugerencias.',
  },
]

export default function Landing({ onCrear, onIniciar, onDemo }) {
  return (
    <div className="landing">
      {/* Barra superior */}
      <header className="landing-nav">
        <div className="landing-logo">
          <span className="landing-logo-cuadro">E</span>
          <div>
            <strong>Empleia</strong>
            <span>Panel Unificado</span>
          </div>
        </div>
        <div className="landing-nav-acciones">
          <button className="landing-enlace" type="button" onClick={onIniciar}>
            Iniciar sesión
          </button>
          <button className="boton-primario" type="button" onClick={onCrear}>
            Crear cuenta
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="landing-hero">
        <span className="landing-badge">
          <IconoChispa tam={14} /> Tus datos dispersos, en un solo panel
        </span>
        <h1>
          Todo tu negocio en un dashboard que <span>la IA organiza por ti</span>
        </h1>
        <p className="landing-hero-sub">
          Empleia reúne tus Excels, PDFs, imágenes y calendarios sueltos, los entiende, los cruza y
          los convierte en un panel claro con cifras clave, agenda y sugerencias. Sin plantillas ni
          complicaciones.
        </p>
        <div className="landing-hero-botones">
          <button className="boton-primario landing-cta" type="button" onClick={onCrear}>
            Empezar gratis
          </button>
          <button className="boton-secundario landing-cta" type="button" onClick={onDemo}>
            Probar demo
          </button>
        </div>
        <p className="landing-hero-nota">Sin tarjeta. Puedes ver una demo con datos de ejemplo.</p>

        {/* Maqueta decorativa del panel */}
        <Maqueta />
      </section>

      {/* Qué es */}
      <section className="landing-seccion landing-que-es">
        <h2>¿Qué es Empleia?</h2>
        <p>
          La facturación en un Excel, el equipo en un PDF, las citas en un calendario y el
          inventario en una foto de la pizarra. Empleia junta todo eso en <strong>un único
          panel organizado</strong>, y una IA lo cruza para decirte lo que de verdad importa: qué
          te deben, qué se te viene esta semana y qué conviene hacer.
        </p>
      </section>

      {/* Funciones */}
      <section className="landing-seccion">
        <h2>Todo lo que puedes hacer</h2>
        <div className="landing-funciones">
          {FUNCIONES.map((f) => (
            <div className="landing-funcion" key={f.titulo}>
              <span className="landing-funcion-icono">
                <f.Icono tam={20} />
              </span>
              <strong>{f.titulo}</strong>
              <p>{f.texto}</p>
            </div>
          ))}
          <div className="landing-funcion landing-funcion-pronto">
            <span className="landing-funcion-icono">
              <IconoCalendario tam={20} />
            </span>
            <strong>
              Gmail, Calendar y Sheets <em className="landing-pronto">Próximamente</em>
            </strong>
            <p>Conecta tu cuenta de Google para que el panel se alimente y se actualice solo.</p>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="landing-seccion">
        <h2>Cómo funciona</h2>
        <div className="landing-pasos">
          {PASOS.map((p) => (
            <div className="landing-paso" key={p.n}>
              <span className="landing-paso-num">{p.n}</span>
              <strong>{p.titulo}</strong>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="landing-final">
        <h2>Crea tu primer dashboard en un minuto</h2>
        <p>Sin plantillas, sin hojas de cálculo interminables. Tú subes, la IA organiza.</p>
        <div className="landing-hero-botones">
          <button className="boton-primario landing-cta" type="button" onClick={onCrear}>
            Empezar gratis
          </button>
          <button className="boton-secundario landing-cta" type="button" onClick={onDemo}>
            Probar demo
          </button>
        </div>
      </section>

      <footer className="landing-pie">
        <span className="landing-logo-cuadro pequeno">E</span>
        Empleia · Panel Unificado — todos tus datos, un solo panel.
      </footer>
    </div>
  )
}

/*
  Maqueta puramente decorativa del dashboard (no interactiva). Imita el look
  de Kpis, AnalisisIA y el donut sin importar esos componentes.
*/
function Maqueta() {
  const kpis = [
    { et: 'PENDIENTE DE COBRO', v: '7.490 €', icono: '💶' },
    { et: 'FACTURADO', v: '13.460 €', icono: '📈' },
    { et: 'CITAS PRÓXIMAS', v: '4', icono: '📅' },
    { et: 'POR REPONER', v: '2', icono: '📦' },
  ]
  const nav = [
    { icono: <IconoPanel tam={15} />, txt: 'Resumen', activo: true },
    { icono: <IconoCalendario tam={15} />, txt: 'Agenda' },
    { icono: <IconoMoneda tam={15} />, txt: 'Finanzas' },
    { icono: <IconoPersonas tam={15} />, txt: 'Personas' },
    { icono: <IconoTabla tam={15} />, txt: 'Fuentes' },
  ]
  return (
    <div className="maqueta" aria-hidden="true">
      <div className="maqueta-sidebar">
        <div className="maqueta-logo">
          <span className="landing-logo-cuadro pequeno">E</span>
          <b>Empleia</b>
        </div>
        {nav.map((n) => (
          <div key={n.txt} className={`maqueta-item ${n.activo ? 'activo' : ''}`}>
            {n.icono} <span>{n.txt}</span>
          </div>
        ))}
      </div>
      <div className="maqueta-main">
        <div className="maqueta-cabecera">
          <div>
            <div className="maqueta-titulo">🔧 Peluquería Sol</div>
            <div className="maqueta-sub">Gestión de negocio · panel personalizado</div>
          </div>
          <span className="maqueta-boton">Añadir datos</span>
        </div>
        <div className="maqueta-kpis">
          {kpis.map((k) => (
            <div key={k.et} className="maqueta-kpi">
              <div className="maqueta-kpi-top">
                <span>{k.et}</span>
                <i>{k.icono}</i>
              </div>
              <b>{k.v}</b>
            </div>
          ))}
        </div>
        <div className="maqueta-fila">
          <div className="maqueta-analisis">
            <div className="maqueta-analisis-tit">
              <i>✦</i> Análisis &amp; alertas
            </div>
            <div className="maqueta-linea larga" />
            <div className="maqueta-linea" />
            <div className="maqueta-alerta">⚡ Dependencia de un cliente</div>
            <div className="maqueta-alerta">⚡ Stock vs. agenda</div>
          </div>
          <div className="maqueta-donut">
            <div className="maqueta-donut-anillo" />
            <div className="maqueta-leyenda">
              <span>
                <i style={{ background: '#3987e5' }} /> Finanzas
              </span>
              <span>
                <i style={{ background: '#199e70' }} /> Personas
              </span>
              <span>
                <i style={{ background: '#c98500' }} /> Clientes
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
