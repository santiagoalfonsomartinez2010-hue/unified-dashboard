# Empleia · Panel Unificado

**Todos tus datos esparcidos, en un solo dashboard.** Subes Excels, PDFs,
imágenes, calendarios (.ics) o JSON, y la IA de Google Gemini lo lee todo, lo
normaliza y lo organiza automáticamente en un panel con cifras clave,
gráficos, agenda unificada, resumen inteligente y un chatbot que responde
preguntas y edita el panel por ti.

> La conexión con Gmail, Google Calendar y Google Sheets está implementada en
> el código pero **desconectada de la app de momento** (queda para más
> adelante); ver la sección de configuración.

## Qué hace

1. **Cuentas e inicio de sesión (Supabase):** antes de crear un dashboard hay
   que crear cuenta e iniciar sesión. Los paneles se guardan en la nube por
   usuario, así que puedes abrir la app en otro dispositivo y seguir donde lo
   dejaste. Se pueden tener varios paneles y cambiar entre ellos desde la
   barra lateral. (Sin Supabase configurado, la app ofrece un "modo local"
   que guarda solo en el navegador.)
2. **Asistente de creación:** al crear un panel, un formulario por pasos
   pregunta para qué es el dashboard (personal / trabajo / negocio), en qué
   consiste tu trabajo y en qué te va a ayudar, y qué quieres añadir. Ese
   "perfil" personaliza todo el análisis de la IA. Los archivos se añaden
   todos de golpe y, al pulsar **Crear**, se analizan a la vez.
3. **Subida de archivos** (clic o arrastrar): Excel/CSV (se parsean con
   `xlsx`), PDF e imágenes (Gemini los lee por visión/OCR), calendarios
   `.ics`, JSON y texto.
4. **Análisis inteligente conjunto:** la IA no se limita a volcar tablas.
   Cruza TODAS las fuentes con el perfil del usuario y devuelve: el **tipo de
   dashboard** (panel de pagos, gestión de peluquería…), **KPIs
   personalizados** calculados de los datos, **conexiones detectadas** entre
   fuentes (el mismo cliente en dos tablas, stock frente a agenda…) y
   **sugerencias accionables**. Se regenera solo al añadir o quitar datos.
5. **Dashboard tipo app, por apartados:** cada panel se navega desde la
   barra lateral como una aplicación de verdad — **Resumen** (KPIs con badge,
   análisis & alertas con tareas marcables, donut por categoría, gráficos y
   próximos eventos), **Agenda** (todos los eventos por día), **un apartado
   por cada categoría de datos** (Finanzas, Clientes, Personas, Inventario…)
   con tablas estilo app (buscador, avatares con iniciales y pastillas de
   estado) y **Fuentes** (gestión de los datos conectados). Tema negro con
   acento verde lima configurable por el chatbot.
6. **Conexión oficial con Google (pendiente):** importar Gmail, Google
   Calendar y Google Sheets está implementado en el código
   (`src/lib/google.js` y `ConexionesGoogle.jsx`) pero todavía no está
   enganchado a la interfaz; se activará más adelante.
7. **Chatbot inteligente:** un asistente flotante (funciona con la API key de
   Gemini de cada usuario) que:
   - responde preguntas sobre los datos del panel («¿cuántos proveedores
     nuevos han llegado esta semana?»),
   - edita el estilo visual (tema claro/oscuro, color de acento),
   - edita la información (renombra el panel o las fuentes, corrige métricas,
     edita tablas y eventos, quita fuentes…).
8. **Edición manual completa:** todo se puede personalizar sin IA —
   **tablas manuales** desde cero con plantillas (proveedores, clientes,
   citas, gastos, inventario, equipo), editor de tablas (celdas, filas,
   columnas), métricas, renombrar fuentes y cambiarlas de categoría, añadir
   /editar/borrar citas en la Agenda, modo edición del Resumen (KPIs,
   titular, alertas y tareas propias) y modal "Personalizar" (nombre, emoji,
   tema claro/oscuro y color de acento).
9. **Modo ejemplo:** botón "Datos de ejemplo" para ver la demo completa sin
   API key ni archivos reales.

## Configuración

Copia `.env.example` a `.env` y rellena lo que vayas a usar. Las tres
integraciones son independientes: cada una se activa con sus variables.

### 1. Supabase — cuentas y guardado en la nube

1. Crea un proyecto gratuito en <https://supabase.com>.
2. En el **SQL Editor**, ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql)
   (crea la tabla `paneles` con Row Level Security por usuario).
3. En **Settings → API**, copia la URL y la `anon key` a:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
4. Opcional: en **Authentication → Providers → Email** puedes desactivar
   "Confirm email" para que las cuentas entren sin verificación (útil en
   demos).

### 2. Google — Gmail, Calendar y Sheets (pendiente, más adelante)

El botón "Conectar Google" ya está implementado (`src/lib/google.js` y
`ConexionesGoogle.jsx`), pero de momento no está configurado: sin
`VITE_GOOGLE_CLIENT_ID` el modal simplemente avisa de que falta configurarlo,
sin romper el resto de la app. Cuando se retome este paso, hará falta:

1. En <https://console.cloud.google.com> crear un proyecto y activar las
   APIs: **Gmail API, Google Calendar API, Google Sheets API y Google Drive
   API**.
2. Configurar la pantalla de consentimiento OAuth (tipo External; añadir la
   cuenta como test user mientras la app no esté verificada).
3. Crear unas credenciales **OAuth Client ID → Web application** con los
   orígenes autorizados de JavaScript: `http://localhost:5173` y el dominio
   de producción.
4. Añadir el client id como `VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com`.

La conexión pide solo permisos de **lectura** (gmail.readonly,
calendar.readonly, spreadsheets.readonly, drive.metadata.readonly) y el token
vive en el navegador (~1 hora); nunca pasa por ningún servidor propio.

### 3. Gemini — la IA

Cada usuario puede poner su propia API key desde el botón "API key" de la
barra lateral (se guarda en su navegador), o puedes fijarla para todos con
`VITE_GEMINI_API_KEY`. La key gratuita se crea en
<https://aistudio.google.com/apikey>.

> ⚠️ **Seguridad:** al no haber backend propio, la key de Gemini viaja/vive
> en el navegador. Para producción de verdad, mueve la llamada a Gemini a una
> función serverless.

## Tecnología

- **React + Vite**
- **Supabase** (`@supabase/supabase-js`): autenticación email+contraseña y
  tabla `paneles` (JSONB) con RLS
- **xlsx** para parsear Excel/CSV en el navegador
- **API de Google Gemini** (`gemini-2.5-flash` por defecto, configurable
  con `VITE_GEMINI_MODEL`): análisis de fuentes, detección del tipo de panel,
  resumen global y chatbot
- Interfaz íntegramente en **español**, tema oscuro/claro con acento
  personalizable (el chatbot puede cambiarlo)

## Scripts

```bash
npm install      # instalar dependencias
npm run dev      # servidor de desarrollo (http://localhost:5173)
npm run build    # build de producción
npm run preview  # previsualizar el build
```

## Deploy a Vercel

Importa el repo en Vercel apuntando a la rama
`claude/ai-dashboard-gmail-chatbot-6kttjp`. Añade en **Settings →
Environment Variables** las variables del `.env` que uses
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y opcionalmente
`VITE_GEMINI_API_KEY`) y pulsa **Redeploy** (Vite incrusta las variables en
tiempo de build). `VITE_GOOGLE_CLIENT_ID` se añadirá cuando se configure la
conexión con Google (ver sección anterior).

## Estructura de carpetas

```
supabase/
  schema.sql                 Tabla "paneles" + políticas RLS (ejecutar en Supabase)
src/
  App.jsx                    Estado y lógica principal (sesión, paneles, fuentes, chatbot)
  index.css                  Sistema de diseño (tokens, tema oscuro y claro)
  lib/
    gemini.js                Gemini: analizar fuentes + análisis conjunto del panel
    chatbot.js               Chatbot: contexto del panel + acciones que puede ejecutar
    supabase.js              Cuentas y guardado de paneles en la nube
    google.js                OAuth de Google + lectores de Gmail/Calendar/Sheets
    parseArchivo.js          Parseo de Excel/CSV, .ics/texto y base64
    categorias.js            Categorías fijas del panel y su color
    almacen.js               Persistencia local (modo local y API key)
    ejemplo.js               Datos simulados del modo ejemplo
    visuales.js              Colores estables por nombre (avatares)
  components/
    PantallaAcceso.jsx       Crear cuenta / iniciar sesión (obligatorio)
    Sidebar.jsx              Navegación por apartados, selector de paneles, cuenta
    Cabecera.jsx             Barra superior: título del apartado + acciones
    Panel.jsx                Enrutador de apartados del dashboard
    VistaResumen.jsx         Apartado Resumen: KPIs, análisis, donut, eventos
    VistaAgenda.jsx          Apartado Agenda: eventos agrupados por día
    VistaCategoria.jsx       Apartado por categoría: tablas estilo app
    VistaFuentes.jsx         Apartado Fuentes: gestión de datos conectados
    AsistenteCreacion.jsx    Formulario por pasos al crear un panel (perfil)
    AnalisisIA.jsx           Análisis & alertas: titular, conexiones, tareas
    Kpis.jsx                 Fila de cifras clave con badge de tendencia
    GraficoFuentes.jsx       Barras de registros por fuente
    GraficoDonut.jsx         Donut de registros por categoría
    GraficoCategorias.jsx    Barra apilada de registros por categoría
    ProximosEventos.jsx      Lista de próximos eventos (Resumen)
    ConexionesGoogle.jsx     Modal de conexión con Gmail/Calendar/Sheets (pendiente)
    Chatbot.jsx              Asistente flotante (preguntas + edición del panel)
    TarjetaFuente.jsx        Tarjeta por fuente con métricas y tabla desplegable
    ModalApiKey.jsx          Modal para introducir la API key de Gemini
    Iconos.jsx               Iconos SVG inline
    ErrorBoundary.jsx        Pantalla de error legible si algo revienta
```
