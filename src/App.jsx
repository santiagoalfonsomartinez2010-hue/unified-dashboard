import { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import Hero from './components/Hero'
import Panel from './components/Panel'
import ModalApiKey from './components/ModalApiKey'
import PantallaAcceso from './components/PantallaAcceso'
import Chatbot from './components/Chatbot'
import { inferirTipoArchivo } from './lib/parseArchivo'
import {
  analizarFuente,
  generarResumenGlobal,
  detectarTipoPanel,
  CATEGORIAS,
} from './lib/gemini'
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
  cargarResumen,
  guardarResumen,
  cargarExtras,
  guardarExtras,
  cargarApiKey,
  guardarApiKey,
  vaciarTodo,
} from './lib/almacen'
import { fuentesDeEjemplo, resumenDeEjemplo, tipoPanelDeEjemplo } from './lib/ejemplo'
import './App.css'

/*
  Panel Unificado de Empleia.

  Flujo: el usuario crea una cuenta e inicia sesión (los dashboards se guardan
  en Supabase y se pueden abrir desde cualquier dispositivo), sube archivos
  (Excel, PDF, imágenes, calendarios…) y la IA de Gemini lo normaliza todo en
  un solo dashboard. La IA detecta además QUÉ tipo de dashboard se está
  montando (una peluquería, un gimnasio, el control de pagos…) y un chatbot
  integrado responde preguntas sobre los datos y edita el panel (estilo
  visual, nombres, tablas…).

  (La conexión con Gmail / Google Calendar / Google Sheets queda para más
  adelante: su código sigue en src/lib/google.js y ConexionesGoogle.jsx, pero
  no está enganchado a la app todavía.)
*/

let contadorId = 0
const nuevoId = () => `f-${Date.now()}-${contadorId++}`

const TEMA_POR_DEFECTO = { modo: 'oscuro', acento: '#6366f1' }

// Convierte un color #rrggbb en su tinte translúcido para badges y fondos
function tinteDeAcento(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, 0.12)`
}

export default function App() {
  // Sesión y modo de persistencia
  const [sesion, setSesion] = useState(undefined) // undefined = comprobando
  const [modoLocal, setModoLocal] = useState(false)
  const [estadoGuardado, setEstadoGuardado] = useState(null)

  // Paneles del usuario (en la nube) y panel activo
  const [paneles, setPaneles] = useState([])
  const [panelId, setPanelId] = useState(null)
  const [cargandoPaneles, setCargandoPaneles] = useState(false)
  const [errorNube, setErrorNube] = useState(null)

  // Contenido del panel activo
  const [nombrePanel, setNombrePanel] = useState('Mi panel')
  const [fuentes, setFuentes] = useState([])
  const [resumen, setResumen] = useState(null)
  const [tipoPanel, setTipoPanel] = useState(null)
  const [tema, setTema] = useState(TEMA_POR_DEFECTO)

  // IA y modales
  const [apiKey, setApiKey] = useState(() => cargarApiKey())
  const [modalKeyAbierto, setModalKeyAbierto] = useState(false)
  const [generandoResumen, setGenerandoResumen] = useState(false)
  const [avisoResumen, setAvisoResumen] = useState(null)
  const [detectandoTipo, setDetectandoTipo] = useState(false)

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

  // Al iniciar sesión, carga la lista de paneles del usuario (o crea el primero)
  const usuarioId = sesion?.user?.id
  useEffect(() => {
    if (!usuarioId) return
    let cancelado = false
    setCargandoPaneles(true)
    setErrorNube(null)
    ;(async () => {
      try {
        let lista = await listarPaneles()
        if (lista.length === 0) {
          const p = await crearPanel('Mi panel', {})
          lista = [{ id: p.id, nombre: p.nombre }]
        }
        if (cancelado) return
        setPaneles(lista)
        await abrirPanel(lista[0].id)
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
    setFuentes((d.fuentes || []).filter((f) => f.estado !== 'procesando'))
    setResumen(d.resumen || null)
    setTipoPanel(d.tipoPanel || null)
    setTema(d.tema || TEMA_POR_DEFECTO)
    setAvisoResumen(null)
    setEstadoGuardado('guardado')
  }

  function entrarModoLocal() {
    omitirGuardado.current = true
    setModoLocal(true)
    setFuentes(cargarFuentes())
    setResumen(cargarResumen())
    const extras = cargarExtras()
    if (extras) {
      setNombrePanel(extras.nombrePanel || 'Mi panel')
      setTipoPanel(extras.tipoPanel || null)
      setTema(extras.tema || TEMA_POR_DEFECTO)
    }
    setEstadoGuardado('local')
  }

  async function salir() {
    await cerrarSesion()
    omitirGuardado.current = true
    setPaneles([])
    setPanelId(null)
    setNombrePanel('Mi panel')
    setFuentes([])
    setResumen(null)
    setTipoPanel(null)
    setTema(TEMA_POR_DEFECTO)
  }

  /* ---------- Guardado automático (nube o local) ---------- */

  useEffect(() => {
    if (omitirGuardado.current) {
      omitirGuardado.current = false
      return
    }
    if (modoLocal) {
      guardarFuentes(fuentes)
      guardarResumen(resumen)
      guardarExtras({ nombrePanel, tipoPanel, tema })
      return
    }
    if (!panelId) return
    setEstadoGuardado('guardando')
    const temporizador = setTimeout(async () => {
      try {
        await guardarPanel(panelId, nombrePanel, { fuentes, resumen, tipoPanel, tema })
        setEstadoGuardado('guardado')
      } catch {
        setEstadoGuardado('error')
      }
    }, 1200)
    return () => clearTimeout(temporizador)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fuentes, resumen, tipoPanel, tema, nombrePanel, panelId, modoLocal])

  /* ---------- Tema visual (el chatbot puede cambiarlo) ---------- */

  useEffect(() => {
    const raiz = document.documentElement
    if (tema.modo === 'claro') raiz.setAttribute('data-tema', 'claro')
    else raiz.removeAttribute('data-tema')
    if (/^#[0-9a-f]{6}$/i.test(tema.acento || '')) {
      raiz.style.setProperty('--color-violeta', tema.acento)
      raiz.style.setProperty('--violeta-tinte', tinteDeAcento(tema.acento))
    }
  }, [tema])

  /* ---------- Detección del tipo de dashboard ---------- */

  const listas = fuentes.filter((f) => f.estado === 'listo')
  const claveFuentes = listas
    .map((f) => f.id)
    .sort()
    .join('|')

  useEffect(() => {
    if (!claveFuentes || !apiKey) return
    if (tipoPanel?.esEjemplo || tipoPanel?.clave === claveFuentes) return
    let cancelado = false
    setDetectandoTipo(true)
    const temporizador = setTimeout(async () => {
      try {
        const detectado = await detectarTipoPanel(
          fuentes.filter((f) => f.estado === 'listo'),
          apiKey
        )
        if (!cancelado) setTipoPanel({ ...detectado, clave: claveFuentes })
      } catch {
        // la detección es un extra: si falla, el panel sigue funcionando
      } finally {
        if (!cancelado) setDetectandoTipo(false)
      }
    }, 800)
    return () => {
      cancelado = true
      clearTimeout(temporizador)
      setDetectandoTipo(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveFuentes, apiKey])

  /* ---------- Archivos subidos ---------- */

  function pedirArchivos() {
    if (!apiKey) {
      setModalKeyAbierto(true)
      return
    }
    inputArchivosRef.current?.click()
  }

  // Analiza los archivos en serie (la capa gratuita de Gemini limita el ritmo)
  async function procesarArchivos(lista) {
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
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

    for (let i = 0; i < archivos.length; i++) {
      const meta = nuevas[i]
      try {
        const resultado = await analizarFuente(archivos[i], meta.tipoArchivo, apiKey)
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

  /* ---------- Resumen global ---------- */

  async function generarResumen() {
    const procesadas = fuentes.filter((f) => f.estado === 'listo')
    if (procesadas.length === 0) return
    if (!apiKey) {
      setModalKeyAbierto(true)
      return
    }
    setGenerandoResumen(true)
    setAvisoResumen(null)
    try {
      setResumen(await generarResumenGlobal(procesadas, apiKey))
    } catch (error) {
      setAvisoResumen(error.message)
    } finally {
      setGenerandoResumen(false)
    }
  }

  /* ---------- Acciones del chatbot ---------- */

  function editarResultado(id, editar) {
    setFuentes((previas) =>
      previas.map((f) =>
        f.id === id && f.resultado ? { ...f, resultado: editar(f.resultado) } : f
      )
    )
  }

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
          if (a.nombre) {
            const nombre = String(a.nombre).slice(0, 60)
            setNombrePanel(nombre)
            setPaneles((prev) => prev.map((p) => (p.id === panelId ? { ...p, nombre } : p)))
          }
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

  async function nuevoPanel() {
    const nombre = window.prompt('Nombre del nuevo panel:', 'Nuevo panel')
    if (!nombre?.trim()) return
    try {
      const p = await crearPanel(nombre.trim(), {})
      setPaneles((prev) => [{ id: p.id, nombre: p.nombre }, ...prev])
      await abrirPanel(p.id)
    } catch (error) {
      window.alert(error.message)
    }
  }

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
      if (restantes.length > 0) await abrirPanel(restantes[0].id)
    } catch (error) {
      window.alert(error.message)
    }
  }

  /* ---------- Otros ---------- */

  function cargarEjemplo() {
    setFuentes(fuentesDeEjemplo())
    setResumen(resumenDeEjemplo())
    setTipoPanel(tipoPanelDeEjemplo())
    setAvisoResumen(null)
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function vaciarPanel() {
    if (!window.confirm('¿Vaciar el panel? Se quitarán todas las fuentes y el resumen.')) return
    setFuentes([])
    setResumen(null)
    setTipoPanel(null)
    setAvisoResumen(null)
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

  // 2) Sin sesión: crear cuenta / iniciar sesión (obligatorio antes de crear paneles)
  if (!modoLocal && !sesion) {
    return <PantallaAcceso onModoLocal={entrarModoLocal} />
  }

  // 3) Con sesión pero aún cargando los paneles de la nube
  if (!modoLocal && !panelId) {
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
          `${cargandoPaneles ? 'Cargando tus paneles…' : 'Preparando tu panel…'}`
        )}
      </div>
    )
  }

  const panelParaChat = { nombrePanel, tipoPanel, tema, fuentes, resumen }

  return (
    <div className="app">
      <Sidebar
        fuentes={fuentes}
        hayApiKey={Boolean(apiKey)}
        paneles={paneles}
        panelId={panelId}
        estadoGuardado={estadoGuardado}
        usuarioEmail={sesion?.user?.email || null}
        onAnadir={pedirArchivos}
        onEjemplo={cargarEjemplo}
        onVaciar={vaciarPanel}
        onApiKey={() => setModalKeyAbierto(true)}
        onCambiarPanel={cambiarPanel}
        onNuevoPanel={nuevoPanel}
        onBorrarPanel={borrarPanelActual}
        onCerrarSesion={salir}
      />

      <main className="app-principal">
        <Hero
          hayFuentes={fuentes.length > 0}
          onArchivosSoltados={procesarArchivos}
          onPedirArchivos={pedirArchivos}
          onEjemplo={cargarEjemplo}
        />
        <div ref={panelRef}>
          <Panel
            fuentes={fuentes}
            resumen={resumen}
            nombrePanel={nombrePanel}
            tipoPanel={tipoPanel}
            detectandoTipo={detectandoTipo}
            generandoResumen={generandoResumen}
            avisoResumen={avisoResumen}
            onGenerarResumen={generarResumen}
            onQuitarFuente={quitarFuente}
            onPedirArchivos={pedirArchivos}
            onEjemplo={cargarEjemplo}
          />
        </div>
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

      <Chatbot
        panel={panelParaChat}
        apiKey={apiKey}
        onAcciones={aplicarAcciones}
        onPedirApiKey={() => setModalKeyAbierto(true)}
      />
    </div>
  )
}
