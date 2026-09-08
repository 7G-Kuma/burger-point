const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')
const { requireSeccion } = require('./requireSeccion')
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

// GET /api/insumos — stock actual de cada insumo, con su estado
router.get('/', auth, requireSeccion('inventario'), async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('insumos')
    .select('*')
    .order('nombre')

  if (error) return res.status(500).json({ error: error.message })

  const insumos = data.map(i => ({
    ...i,
    estado: Number(i.cantidad_actual) <= 0
      ? 'agotado'
      : Number(i.cantidad_actual) <= Number(i.cantidad_minima)
        ? 'bajo'
        : 'normal'
  }))

  res.json({ insumos })
})

// GET /api/insumos/movimientos — historial de ingresos/ajustes de stock
router.get('/movimientos', auth, requireSeccion('inventario'), async (req, res) => {
  const supabase = getSupabase()
  const limite = Math.min(parseInt(req.query.limite) || 50, 200)

  const { data, error } = await supabase
    .from('movimientos_stock')
    .select('id, tipo, cantidad, nota, creado_en, insumos ( nombre, unidad ), usuarios ( nombre )')
    .order('creado_en', { ascending: false })
    .limit(limite)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ movimientos: data })
})

// POST /api/insumos/:id/ingreso — registrar entrada de mercadería
router.post('/:id/ingreso', auth, requireSeccion('inventario'), async (req, res) => {
  const supabase = getSupabase()
  const { cantidad, nota } = req.body

  if (!cantidad || Number(cantidad) <= 0) {
    return res.status(400).json({ error: 'La cantidad tiene que ser mayor a cero' })
  }

  const { data: insumo, error: errorInsumo } = await supabase
    .from('insumos')
    .select('nombre, cantidad_actual')
    .eq('id', req.params.id)
    .single()

  if (errorInsumo || !insumo) return res.status(404).json({ error: 'Insumo no encontrado' })

  const nuevaCantidad = Number(insumo.cantidad_actual) + Number(cantidad)

  const { error: errorUpdate } = await supabase
    .from('insumos')
    .update({ cantidad_actual: nuevaCantidad })
    .eq('id', req.params.id)

  if (errorUpdate) return res.status(500).json({ error: errorUpdate.message })

  const { error: errorMov } = await supabase
    .from('movimientos_stock')
    .insert({
      insumo_id: req.params.id,
      tipo: 'ingreso',
      cantidad,
      nota: nota || null,
      usuario_id: req.usuario.id
    })

  if (errorMov) return res.status(500).json({ error: errorMov.message })

  await registrarActividad(supabase, req.usuario, `Registró un ingreso de ${cantidad} en "${insumo.nombre}"`)

  res.json({ ok: true, cantidad_actual: nuevaCantidad })
})

module.exports = router
