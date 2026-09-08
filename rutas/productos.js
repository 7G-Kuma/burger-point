const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')
const { obtenerDisponibilidad } = require('./stock')
const { registrarActividad } = require('./actividad')

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

// GET /api/productos
router.get('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  if (error) return res.status(500).json({ error: error.message })

  const disponibilidad = await obtenerDisponibilidad(supabase)
  const productos = data.map(p => ({
    ...p,
    // null = sin receta de insumos cargada, no se controla el stock de ese producto
    disponible: disponibilidad[p.id] ?? null
  }))

  res.json({ productos })
})

// POST /api/productos — agregar producto al menú
router.post('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { nombre, precio } = req.body
  if (!nombre || !precio) return res.status(400).json({ error: 'Nombre y precio requeridos' })
  const { data, error } = await supabase
    .from('productos')
    .insert({ nombre, precio })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Agregó el producto "${data.nombre}" al menú`)

  res.json({ ok: true, producto: data })
})

module.exports = router