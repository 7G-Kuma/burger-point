const express = require('express')
const jwt     = require('jsonwebtoken')
const { createClient } = require('@supabase/supabase-js')

const router = express.Router()

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)
}

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
  res.json({ productos: data })
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
  res.json({ ok: true, producto: data })
})

module.exports = router