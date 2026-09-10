const fs   = require('fs')
const path = require('path')

// Carga manual del .env sin dotenv (si existe — en Railway las variables
// ya vienen inyectadas en process.env y no hay archivo .env)
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=')
      if (idx > 0) {
        const key = trimmed.substring(0, idx).trim()
        const val = trimmed.substring(idx + 1).trim()
        process.env[key] = val
      }
    }
  })
}

const express = require('express')
const app     = express()
const PORT    = process.env.PORT || 3000

app.use(express.json())

// El link que se comparte con clientes es el dominio raíz — que muestre el
// menú digital directamente, no el login de staff (que sigue en /index.html).
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'menu.html'))
})

app.use(express.static(path.join(__dirname, 'public'), { index: false }))

/// Rutas de la API
const authRutas      = require('./rutas/auth')
const panelRutas     = require('./rutas/panel')
const pedidosRutas   = require('./rutas/pedidos')
const productosRutas = require('./rutas/productos')
const cobrosRutas    = require('./rutas/cobros')
const incidenciasRutas = require('./rutas/incidencias')
const seguimientoRutas = require('./rutas/seguimiento')
const registroRutas   = require('./rutas/registro')
const insumosRutas    = require('./rutas/insumos')
const menuRutas       = require('./rutas/menu')
const permisosRutas   = require('./rutas/permisos')
const { router: actividadRutas } = require('./rutas/actividad')
const { router: promocionesRutas } = require('./rutas/promociones')

app.use('/api/auth',      authRutas)
app.use('/api/panel',     panelRutas)
app.use('/api/pedidos',   pedidosRutas)
app.use('/api/productos', productosRutas)
app.use('/api/cobros',    cobrosRutas)
app.use('/api/incidencias', incidenciasRutas)
app.use('/api/seguimiento', seguimientoRutas)
app.use('/api/registro',  registroRutas)
app.use('/api/insumos',   insumosRutas)
app.use('/api/menu',      menuRutas)
app.use('/api/permisos',  permisosRutas)
app.use('/api/actividad', actividadRutas)
app.use('/api/promociones', promocionesRutas)

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, mensaje: 'Servidor Burger Point funcionando' })
})

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`)
})