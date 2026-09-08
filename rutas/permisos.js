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
    return res.status(403).json({ error: 'Solo el propietario puede administrar permisos' })
  }
  next()
}

// GET /api/permisos — mapa { seccion: permitido }, lo puede leer cualquier usuario logueado
// (lo necesita el propio encargado al loguearse para saber qué ve)
router.get('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('permisos_encargado')
    .select('seccion, permitido')

  if (error) return res.status(500).json({ error: error.message })

  const mapa = {}
  data.forEach(p => { mapa[p.seccion] = p.permitido })
  res.json({ permisos: mapa })
})

// PATCH /api/permisos/:seccion — solo propietario puede tocar esto
router.patch('/:seccion', auth, soloPropietario, async (req, res) => {
  const supabase = getSupabase()
  const { permitido } = req.body

  if (typeof permitido !== 'boolean') {
    return res.status(400).json({ error: 'permitido debe ser true o false' })
  }

  const { error } = await supabase
    .from('permisos_encargado')
    .update({ permitido, actualizado_en: new Date().toISOString() })
    .eq('seccion', req.params.seccion)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

module.exports = router
