const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')

const router = express.Router()

function auth(req, res, next) {
  const header = req.headers.authorization
  if (!header) return res.status(401).json({ error: 'Sin token' })
  try {
    req.usuario = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET)
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido' })
  }
}

function soloPropietario(req, res, next) {
  if (req.usuario.rol !== 'propietario') {
    return res.status(403).json({ error: 'Solo el propietario puede editar la configuración del negocio' })
  }
  next()
}

const CAMPOS_EDITABLES = [
  'nombre_fantasia', 'tagline', 'logo_url', 'color_acento',
  'razon_social', 'cuit', 'domicilio', 'condicion_iva',
  'ingresos_brutos', 'inicio_actividades', 'punto_venta'
]

// GET /api/negocio — PÚBLICO, sin auth: lo necesitan el menú digital, el
// login, seguimiento.html, etc. para pintar nombre/logo/color antes de que
// haya ninguna sesión.
router.get('/', async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('negocio')
    .select('*')
    .eq('id', true)
    .single()

  if (error || !data) return res.status(500).json({ error: 'No se pudo leer la configuración del negocio' })
  res.json(data)
})

// PATCH /api/negocio — solo propietario. Blanqueo total del negocio (nombre,
// logo, tagline, color de marca) y de los datos fiscales que se imprimen en
// la factura — así el sistema se puede revender a otra hamburguesería sin
// tocar código, solo completando este formulario desde /configuracion.html.
router.patch('/', auth, soloPropietario, async (req, res) => {
  const supabase = getSupabase()
  const cambios = {}

  for (const campo of CAMPOS_EDITABLES) {
    if (req.body[campo] !== undefined) {
      const valor = String(req.body[campo]).trim()
      if (!valor) return res.status(400).json({ error: `${campo} no puede quedar vacío` })
      cambios[campo] = valor
    }
  }

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se mandó ningún campo para actualizar' })
  }

  cambios.actualizado_en = new Date().toISOString()

  const { data, error } = await supabase
    .from('negocio')
    .update(cambios)
    .eq('id', true)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json(data)
})

module.exports = router
