import { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Panel from './components/Panel'
import ModalApiKey from './components/ModalApiKey'
import ModalPersonalizar from './components/ModalPersonalizar'
import ModalNuevaTabla from './components/ModalNuevaTabla'
import PantallaAcceso from './components/PantallaAcceso'
import Landing from './components/Landing'
import AsistenteCreacion from './components/AsistenteCreacion'
import Chatbot from './components/Chatbot'
import { inferirTipoArchivo } from './lib/parseArchivo'
import { analizarFuente, analizarPanelCompleto, CATEGORIAS } from './lib/gemini'
import { INFO_CATEGORIAS } from './lib/categorias'
import {
  supabaseDisponible,
  obtenerSesion,
  alCambiarSesion,
  cerrarSesion,
  listarPaneles,
  cargarPanel,
  crearPanel,
  guardarPanel,
  borrarPanel,
} from './lib/supabase'
import {
  cargarFuentes,
  guardarFuentes,
  cargarExtras,
  guardarExtras,
  cargarApiKey,
  guardarApiKey,
  vaciarTodo,
} from './lib/almacen'
import { fuentesDeEjemplo, perfilDeEjemplo, analisisDeEjemplo } from './lib/ejemplo'
import './App.css'

/*
  Panel Unificado de Empleia.

  Flujo: el usuario crea una cuenta e inicia sesión (los dashboards se guardan
  en Supabase por usuario). Al crear un panel, un ASISTENTE le hace unas
  preguntas (para qué es, a qué se dedica, qué quiere ver) y deja añadir todos
  los archivos de golpe; al pulsar "Crear" se analiza todo a la vez. La IA no
  se limita a volcar tablas: cruza todas las fuentes con el perfil del usuario
  y devuelve KPIs personalizados, conexiones entre datos y sugerencias. Un
  chatbot integrado responde preguntas y edita el panel.

  (La conexión con Gmail / Google Calendar / Google Sheets queda para más
  adelante: su código sigue en src/lib/google.js y ConexionesGoogle.jsx, pero
  no está enganchado a la app todavía.)
*/

let contadorId = 0
const nuevoId = () => `f-${Date.now()}-${contadorId++}`

const TEMA_POR_DEFECTO = { modo: 'oscuro', acento: '#a3e635' }

// Convierte un color #rrggbb en su tinte translúcido para badges y fondos
function tinteDeAcento(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 0.12)`
}

// Color del texto que va SOBRE el acento: oscuro si el acento es claro
// (verde lima) y blanco si es oscuro (violeta), para mantener el contraste.
function colorSobreAcento(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminancia = 0.299 * r + 0.587 * g + 0.114 * b
  return luminancia > 150 ? '#0c1006' : '#ffffff'
}

// Convierte los datos guardados con el formato antiguo (tipoPanel + resumen)
// al formato nuevo (analisis) para no perder los paneles ya creados.
function migrarAnalisis(d) {
  if (d.analisis) return d.analisis
  if (!d.tipoPanel && !d.resumen) return null
  return {
    tipo: d.tipoPanel?.tipo || 'Panel de organización',
    emoji: d.tipoPanel?.emoji || '📊',
    descripcion: d.tipoPanel?.descripcion || '',
    titular: d.resumen?.titular || '',
    kpis: [],
    conexiones: (d.resumen?.insights || []).map((t) => ({ titulo: '', texto: t })),
    sugerencias: d.resumen?.sugerencias || [],
    clave: d.tipoPanel?.clave || null,
  }
}

export default function App() {
  // Sesión y modo de persistencia
  const [sesion, setSesion] = useState(undefined) // undefined = comprobando
  const [modoLocal, setModoLocal] = useState(false)
  const [estadoGuardado, setEstadoGuardado] = useState(null)

  // Portada: mientras no haya sesión se muestra la landing; al pulsar un CTA
  // se abre el formulario de acceso en la pestaña correspondiente.
  const [accesoAbierto, setAccesoAbierto] = useState(false)
  const [accesoModo, setAccesoModo] = useState('entrar') // 'entrar' | 'registro'

  // Paneles del usuario (en la nube) y panel activo
  const [paneles, setPaneles] = useState([])
  const [panelId, setPanelId] = useState(null)
  const [cargandoPaneles, setCargandoPaneles] = useState(false)
  const [errorNube, setErrorNube] = useState(null)

  // Contenido del panel activo
  const [nombrePanel, setNombrePanel] = useState('Mi panel')
  const [perfil, setPerfil] = useState(null) // respuestas del asistente de creación
  const [fuentes, setFuentes] = useState([])
  const [analisis, setAnalisis] = useState(null) // análisis conjunto de la IA
  const [tema, setTema] = useState(TEMA_POR_DEFECTO)

  // Apartado activo del dashboard ('resumen' | 'agenda' | 'cat:<categoría>' | 'fuentes')
  const [vista, setVista] = useState('resumen')

  // IA, asistente y modales
  const [apiKey, setApiKey] = useState(() => cargarApiKey())
  const [modalKeyAbierto, setModalKeyAbierto] = useState(false)
  const [asistenteAbierto, setAsistenteAbierto] = useState(false)
  const [personalizarAbierto, setPersonalizarAbierto] = useState(false)
  const [nuevaTablaAbierta, setNuevaTablaAbierta] = useState(false)
  const [creandoPanel, setCreandoPanel] = useState(false)
  const [analizando, setAnalizando] = useState(false)
  const [avisoAnalisis, setAvisoAnalisis] = useState(null)

  const inputArchivosRef = useRef(null)
  const panelRef = useRef(null)
  const omitirGuardado = useRef(true) // evita re-guardar justo tras cargar un panel

  /* ---------- Sesión ---------- */

  useEffect(() => {
    if (!supabaseDisponible) {
      setSesion(null)
      return
    }
    obtenerSesion().then(setSesion)
    return alCambiarSesion(setSesion)
  }, [])

  // Al iniciar sesión, carga la lista de paneles del usuario. Si no tiene
  // ninguno, se abre el asistente de creación (las preguntas del formulario).
  const usuarioId = sesion?.user?.id
  useEffect(() => {
    if (!usuarioId) return
    let cancelado = false
    setCargandoPaneles(true)
    setErrorNube(null)
    ;(async () => {
      try {
        const lista = await listarPaneles()
        if (cancelado) return
        setPaneles(lista)
        if (lista.length === 0) {
          setAsistenteAbierto(true)
        } else {
          await abrirPanel(lista[0].id)
        }
      } catch (error) {
        if (!cancelado) setErrorNube(error.message)
      } finally {
        if (!cancelado) setCargandoPaneles(false)
      }
    })()
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioId])

  async function abrirPanel(id) {
    const p = await cargarPanel(id)
    const d = p.datos || {}
    omitirGuardado.current = true
    setPanelId(p.id)
    setNombrePanel(p.nombre || 'Mi panel')
    setPerfil(d.perfil || null)
    setFuentes((d.fuentes || []).filter((f) => f.estado !== 'procesando'))
    setAnalisis(migrarAnalisis(d))
    setTema(d.tema || TEMA_POR_DEFECTO)
    setAvisoAnalisis(null)
    setVista('resumen')
    setEstadoGuardado('guardado')
  }

  function entrarModoLocal() {
    omitirGuardado.current = true
    setModoLocal(true)
    const fuentesLocales = cargarFuentes()
    setFuentes(fuentesLocales)
    const extras = cargarExtras()
    if (extras) {
      setNombrePanel(extras.nombrePanel || 'Mi panel')
      setPerfil(extras.perfil || null)
      setAnalisis(extras.analisis || null)
      setTema(extras.tema || TEMA_POR_DEFECTO)
    }
    setEstadoGuardado('local')
    // Sin datos previos: arranca con el formulario de creación
    if (fuentesLocales.length === 0 && !extras) setAsistenteAbierto(true)
  }

  // "Probar demo" desde la landing: entra en modo local con datos de ejemplo,
  // sin crear cuenta ni abrir el asistente.
  function probarDemo() {
    omitirGuardado.current = true
    setModoLocal(true)
    setEstadoGuardado('local')
    cargarEjemplo()
  }

  async function salir() {
    await cerrarSesion()
    omitirGuardado.current = true
    setPaneles([])
    setPanelId(null)
    setNombrePanel('Mi panel')
    setPerfil(null)
    setFuentes([])
    setAnalisis(null)
    setTema(TEMA_POR_DEFECTO)
    setAsistenteAbierto(false)
  }

  /* ---------- Guardado automático (nube o local) ---------- */

  useEffect(() => {
    if (omitirGuardado.current) {
      omitirGuardado.current = false
      return
    }
    if (modoLocal) {
      guardarFuentes(fuentes)
      guardarExtras({ nombrePanel, perfil, analisis, tema })
      return
    }
    if (!panelId) return
    setEstadoGuardado('guardando')
    const temporizador = setTimeout(async () => {
      try {
        await guardarPanel(panelId, nombrePanel, { perfil, fuentes, analisis, tema })
        setEstadoGuardado('guardado')
      } catch {
        setEstadoGuardado('error')
      }
    }, 1200)
    return () => clearTimeout(temporizador)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuentes, analisis, tema, nombrePanel, perfil, panelId, modoLocal])

  /* ---------- Tema visual (el chatbot puede cambiarlo) ---------- */

  useEffect(() => {
    const raiz = document.documentElement
    if (tema.modo === 'claro') raiz.setAttribute('data-tema', 'claro')
    else raiz.removeAttribute('data-tema')
    if (/^#[0-9a-f]{6}$/i.test(tema.acento || '')) {
      raiz.style.setProperty('--color-violeta', tema.acento)
      raiz.style.setProperty('--violeta-tinte', tinteDeAcento(tema.acento))
      raiz.style.setProperty('--color-onacento', colorSobreAcento(tema.acento))
    }
  }, [tema])

  /* ---------- Análisis inteligente conjunto ---------- */

  const listas = fuentes.filter((f) => f.estado === 'listo')
  const hayProcesando = fuentes.some((f) => f.estado === 'procesando')
  const claveFuentes = listas
    .map((f) => f.id)
    .sort()
    .join('|')

  // Categorías de datos presentes (cada una es un apartado en la sidebar).
  // La categoría "agenda" se excluye: sus eventos ya tienen su propio
  // apartado Agenda y sus tablas quedan en Fuentes.
  const categoriasPresentes = Object.keys(INFO_CATEGORIAS).filter(
    (cat) => cat !== 'agenda' && listas.some((f) => f.resultado.categoria === cat)
  )

  // Si el apartado activo deja de existir (se quitó su última fuente), vuelve al resumen
  useEffect(() => {
    if (vista.startsWith('cat:') && !categoriasPresentes.includes(vista.slice(4))) {
      setVista('resumen')
    } else if (vista === 'fuentes' && fuentes.length === 0) {
      setVista('resumen')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, claveFuentes])

  // Ejecuta el análisis conjunto (cruza todas las fuentes con el perfil)
  async function ejecutarAnalisis(clave) {
    setAnalizando(true)
    setAvisoAnalisis(null)
    try {
      const resultado = await analizarPanelCompleto(
        fuentes.filter((f) => f.estado === 'listo'),
        perfil,
        apiKey
      )
      setAnalisis({ ...resultado, clave })
    } catch (error) {
      setAvisoAnalisis(error.message)
    } finally {
      setAnalizando(false)
    }
  }

  // Se relanza solo cuando cambia el conjunto de fuentes (y no hay ninguna
  // procesándose: así el lote del asistente se analiza entero de una vez).
  useEffect(() => {
    if (!claveFuentes || !apiKey || hayProcesando) return
    if (analisis?.esEjemplo || analisis?.clave === claveFuentes) return
    let cancelado = false
    const temporizador = setTimeout(async () => {
      setAnalizando(true)
      setAvisoAnalisis(null)
      try {
        const resultado = await analizarPanelCompleto(
          fuentes.filter((f) => f.estado === 'listo'),
          perfil,
          apiKey
        )
        if (!cancelado) setAnalisis({ ...resultado, clave: claveFuentes })
      } catch (error) {
        if (!cancelado) setAvisoAnalisis(error.message)
      } finally {
        if (!cancelado) setAnalizando(false)
      }
    }, 900)
    return () => {
      cancelado = true
      clearTimeout(temporizador)
      setAnalizando(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFuentes, apiKey, hayProcesando])

  // Botón "Actualizar análisis": fuerza una pasada nueva
  function actualizarAnalisis() {
    if (listas.length === 0) return
    if (!apiKey) {
      setModalKeyAbierto(true)
      return
    }
    ejecutarAnalisis(claveFuentes)
  }

  /* ---------- Archivos subidos ---------- */

  function pedirArchivos() {
    if (!apiKey) {
      setModalKeyAbierto(true)
      return
    }
    inputArchivosRef.current?.click()
  }

  // Analiza los archivos en serie (la capa gratuita de Gemini limita el ritmo).
  // Cuando termina el último, el efecto de arriba lanza el análisis conjunto.
  async function procesarArchivos(lista, perfilContexto = perfil) {
    const archivos = Array.from(lista || [])
    if (archivos.length === 0) return
    if (!apiKey) {
      setModalKeyAbierto(true)
      return
    }

    const nuevas = archivos.map((archivo) => ({
      id: nuevoId(),
      nombreArchivo: archivo.name,
      tipoArchivo: inferirTipoArchivo(archivo.name),
      estado: 'procesando',
      creado: Date.now(),
    }))
    setFuentes((previas) => [...previas, ...nuevas])
    panelRef.current?.scrollTo({ top: 0, behavior: 'smooth' })

    for (let i = 0; i < archivos.length; i++) {
      const meta = nuevas[i]
      try {
        const resultado = await analizarFuente(archivos[i], meta.tipoArchivo, apiKey, perfilContexto)
        setFuentes((previas) =>
          previas.map((f) => (f.id === meta.id ? { ...f, estado: 'listo', resultado } : f))
        )
      } catch (error) {
        setFuentes((previas) =>
          previas.map((f) => (f.id === meta.id ? { ...f, estado: 'error', error: error.message } : f))
        )
      }
    }
  }

  /* ---------- Asistente de creación ---------- */

  // Crea el panel con las respuestas del formulario y analiza todos los
  // archivos añadidos de una sola vez.
  async function crearDesdeAsistente({ nombre, perfil: perfilNuevo, archivos }) {
    setCreandoPanel(true)
    try {
      if (!modoLocal) {
        const p = await crearPanel(nombre, {
          perfil: perfilNuevo,
          fuentes: [],
          analisis: null,
          tema: TEMA_POR_DEFECTO,
        })
        setPaneles((prev) => [{ id: p.id, nombre: p.nombre }, ...prev])
        omitirGuardado.current = true
        setPanelId(p.id)
        setEstadoGuardado('guardado')
      }
      setNombrePanel(nombre)
      setPerfil(perfilNuevo)
      setFuentes([])
      setAnalisis(null)
      setAvisoAnalisis(null)
      setVista('resumen')
      setAsistenteAbierto(false)
      if (archivos.length > 0) await procesarArchivos(archivos, perfilNuevo)
    } catch (error) {
      window.alert(error.message)
    } finally {
      setCreandoPanel(false)
    }
  }

  /* ---------- Edición manual del panel ---------- */

  function editarResultado(id, editar) {
    setFuentes((previas) =>
      previas.map((f) =>
        f.id === id && f.resultado ? { ...f, resultado: editar(f.resultado) } : f
      )
    )
  }

  // Aplica cambios sueltos al resultado de una fuente (título, categoría,
  // columnas, registros, métricas, eventos…). Lo usan las vistas editables.
  function editarFuente(id, cambios) {
    editarResultado(id, (r) => ({ ...r, ...cambios }))
  }

  // Aplica cambios al análisis (kpis, titular, conexiones, sugerencias…)
  // desde el modo edición del Resumen. Si aún no hay análisis, lo crea.
  function editarAnalisis(cambios) {
    setAnalisis((a) => ({
      tipo: null,
      emoji: null,
      descripcion: '',
      titular: '',
      kpis: [],
      conexiones: [],
      sugerencias: [],
      clave: claveFuentes,
      ...(a || {}),
      ...cambios,
    }))
  }

  function renombrarPanel(nombre) {
    const limpio = String(nombre || '').trim().slice(0, 60)
    if (!limpio) return
    setNombrePanel(limpio)
    setPaneles((prev) => prev.map((p) => (p.id === panelId ? { ...p, nombre: limpio } : p)))
  }

  // Crea una tabla manual vacía (proveedores, clientes, citas…) sin archivo
  function crearFuenteManual({ titulo, categoria, columnas }) {
    const nueva = {
      id: nuevoId(),
      nombreArchivo: 'Creada a mano',
      tipoArchivo: 'texto',
      origen: 'manual',
      estado: 'listo',
      creado: Date.now(),
      resultado: {
        titulo: titulo || 'Nueva tabla',
        categoria: CATEGORIAS.includes(categoria) ? categoria : 'otros',
        resumen: 'Tabla creada manualmente.',
        columnas: columnas?.length ? columnas : ['Nombre', 'Detalle', 'Estado', 'Fecha'],
        registros: [],
        eventos: [],
        metricas: [],
      },
    }
    setFuentes((previas) => [...previas, nueva])
    setNuevaTablaAbierta(false)
    setVista(nueva.resultado.categoria === 'agenda' ? 'agenda' : `cat:${nueva.resultado.categoria}`)
  }

  /* ---------- Acciones del chatbot ---------- */

  function aplicarAcciones(acciones) {
    for (const a of acciones) {
      switch (a.tipo) {
        case 'cambiar_tema':
          if (a.modo === 'claro' || a.modo === 'oscuro') setTema((t) => ({ ...t, modo: a.modo }))
          break
        case 'cambiar_acento':
          if (/^#[0-9a-f]{6}$/i.test(a.color || '')) setTema((t) => ({ ...t, acento: a.color }))
          break
        case 'renombrar_panel':
          renombrarPanel(a.nombre)
          break
        case 'renombrar_fuente':
          if (a.titulo) editarResultado(a.id, (r) => ({ ...r, titulo: String(a.titulo) }))
          break
        case 'cambiar_categoria':
          if (CATEGORIAS.includes(a.categoria))
            editarResultado(a.id, (r) => ({ ...r, categoria: a.categoria }))
          break
        case 'quitar_fuente':
          setFuentes((previas) => previas.filter((f) => f.id !== a.id))
          break
        case 'editar_metricas':
          if (Array.isArray(a.metricas))
            editarResultado(a.id, (r) => ({ ...r, metricas: a.metricas }))
          break
        case 'editar_registros':
          editarResultado(a.id, (r) => ({
            ...r,
            columnas: Array.isArray(a.columnas) ? a.columnas : r.columnas,
            registros: Array.isArray(a.registros) ? a.registros.slice(0, 40) : r.registros,
          }))
          break
        case 'editar_eventos':
          if (Array.isArray(a.eventos)) editarResultado(a.id, (r) => ({ ...r, eventos: a.eventos }))
          break
        default:
          break
      }
    }
  }

  /* ---------- Gestión de paneles ---------- */

  async function cambiarPanel(id) {
    if (id === panelId) return
    try {
      await abrirPanel(id)
    } catch (error) {
      window.alert(error.message)
    }
  }

  async function borrarPanelActual() {
    if (!window.confirm(`¿Borrar el panel "${nombrePanel}"? Esta acción no se puede deshacer.`))
      return
    try {
      await borrarPanel(panelId)
      const restantes = paneles.filter((p) => p.id !== panelId)
      setPaneles(restantes)
      if (restantes.length > 0) {
        await abrirPanel(restantes[0].id)
      } else {
        omitirGuardado.current = true
        setPanelId(null)
        setFuentes([])
        setPerfil(null)
        setAnalisis(null)
        setAsistenteAbierto(true)
      }
    } catch (error) {
      window.alert(error.message)
    }
  }

  /* ---------- Otros ---------- */

  function cargarEjemplo() {
    setFuentes(fuentesDeEjemplo())
    setPerfil(perfilDeEjemplo())
    setAnalisis(analisisDeEjemplo())
    setAvisoAnalisis(null)
    setVista('resumen')
    setAsistenteAbierto(false)
  }

  function vaciarPanel() {
    if (!window.confirm('¿Vaciar el panel? Se quitarán todas las fuentes y el análisis.')) return
    setFuentes([])
    setAnalisis(null)
    setAvisoAnalisis(null)
    setVista('resumen')
    if (modoLocal) vaciarTodo()
  }

  function quitarFuente(id) {
    setFuentes((previas) => previas.filter((f) => f.id !== id))
  }

  function guardarKey(key) {
    guardarApiKey(key)
    setApiKey(key)
    setModalKeyAbierto(false)
  }

  /* ---------- Render ---------- */

  // 1) Comprobando la sesión guardada
  if (!modoLocal && supabaseDisponible && sesion === undefined) {
    return <div className="app-cargando">Cargando…</div>
  }

  // 2) Sin sesión: primero la landing (portada); al pulsar un CTA se abre el
  //    formulario de acceso (crear cuenta / iniciar sesión).
  if (!modoLocal && !sesion) {
    if (!accesoAbierto) {
      return (
        <Landing
          onCrear={() => {
            setAccesoModo('registro')
            setAccesoAbierto(true)
          }}
          onIniciar={() => {
            setAccesoModo('entrar')
            setAccesoAbierto(true)
          }}
          onDemo={probarDemo}
        />
      )
    }
    return (
      <PantallaAcceso
        modoInicial={accesoModo}
        onVolver={() => setAccesoAbierto(false)}
        onModoLocal={entrarModoLocal}
      />
    )
  }

  // 3) Con sesión pero sin panel activo: o el asistente de creación (primer
  //    panel) o la pantalla de carga/error
  if (!modoLocal && !panelId) {
    if (asistenteAbierto && !cargandoPaneles) {
      return (
        <>
          <AsistenteCreacion
            hayApiKey={Boolean(apiKey)}
            onPedirApiKey={() => setModalKeyAbierto(true)}
            onCrear={crearDesdeAsistente}
            onCerrar={null}
            creando={creandoPanel}
          />
          {modalKeyAbierto && (
            <ModalApiKey onGuardar={guardarKey} onCerrar={() => setModalKeyAbierto(false)} />
          )}
        </>
      )
    }
    return (
      <div className="app-cargando">
        {errorNube ? (
          <div className="app-cargando-error">
            <p>{errorNube}</p>
            <p className="app-cargando-pista">
              ¿Has ejecutado <code>supabase/schema.sql</code> en tu proyecto de Supabase?
            </p>
            <button className="boton-secundario" type="button" onClick={salir}>
              Cerrar sesión
            </button>
          </div>
        ) : (
          'Cargando tus paneles…'
        )}
      </div>
    )
  }

  const panelParaChat = { nombrePanel, perfil, analisis, tema, fuentes }

  return (
    <div className="app">
      <Sidebar
        fuentes={fuentes}
        categorias={categoriasPresentes}
        vista={vista}
        hayApiKey={Boolean(apiKey)}
        paneles={paneles}
        panelId={panelId}
        estadoGuardado={estadoGuardado}
        usuarioEmail={sesion?.user?.email || null}
        onVista={setVista}
        onAnadir={pedirArchivos}
        onNuevaTabla={() => setNuevaTablaAbierta('otros')}
        onPersonalizar={() => setPersonalizarAbierto(true)}
        onEjemplo={cargarEjemplo}
        onVaciar={vaciarPanel}
        onApiKey={() => setModalKeyAbierto(true)}
        onCambiarPanel={cambiarPanel}
        onNuevoPanel={() => setAsistenteAbierto(true)}
        onBorrarPanel={borrarPanelActual}
        onCerrarSesion={salir}
      />

      <main className="app-principal" ref={panelRef}>
        <Panel
          vista={vista}
          fuentes={fuentes}
          analisis={analisis}
          analizando={analizando}
          avisoAnalisis={avisoAnalisis}
          nombrePanel={nombrePanel}
          perfil={perfil}
          tema={tema}
          onActualizarAnalisis={actualizarAnalisis}
          onEditarAnalisis={editarAnalisis}
          onEditarFuente={editarFuente}
          onQuitarFuente={quitarFuente}
          onPedirArchivos={pedirArchivos}
          onArchivosSoltados={procesarArchivos}
          onPersonalizar={() => setPersonalizarAbierto(true)}
          onNuevaTabla={() =>
            setNuevaTablaAbierta(vista.startsWith('cat:') ? vista.slice(4) : 'otros')
          }
          onEjemplo={cargarEjemplo}
        />
      </main>

      {/* Selector de archivos oculto, compartido por sidebar y hero */}
      <input
        ref={inputArchivosRef}
        type="file"
        multiple
        hidden
        accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp,.gif,.ics,.json,.txt,.md"
        onChange={(e) => {
          procesarArchivos(e.target.files)
          e.target.value = ''
        }}
      />

      {modalKeyAbierto && (
        <ModalApiKey
          onGuardar={guardarKey}
          onCerrar={() => setModalKeyAbierto(false)}
          onEjemplo={() => {
            setModalKeyAbierto(false)
            cargarEjemplo()
          }}
        />
      )}

      {asistenteAbierto && (
        <AsistenteCreacion
          hayApiKey={Boolean(apiKey)}
          onPedirApiKey={() => setModalKeyAbierto(true)}
          onCrear={crearDesdeAsistente}
          onCerrar={() => setAsistenteAbierto(false)}
          creando={creandoPanel}
        />
      )}

      {personalizarAbierto && (
        <ModalPersonalizar
          nombre={nombrePanel}
          tema={tema}
          onNombre={renombrarPanel}
          onTema={setTema}
          onCerrar={() => setPersonalizarAbierto(false)}
        />
      )}

      {nuevaTablaAbierta && (
        <ModalNuevaTabla
          categoriaInicial={typeof nuevaTablaAbierta === 'string' ? nuevaTablaAbierta : 'otros'}
          onCrear={crearFuenteManual}
          onCerrar={() => setNuevaTablaAbierta(false)}
        />
      )}

      <Chatbot
        panel={panelParaChat}
        apiKey={apiKey}
        onAcciones={aplicarAcciones}
        onPedirApiKey={() => setModalKeyAbierto(true)}
      />
    </div>
  )
}
