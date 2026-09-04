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

// POST /api/cobros — registrar un cobro para un pedido
router.post('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { pedido_id, monto, metodo } = req.body

    const metodosValidos = ['efectivo', 'transferencia', 'tarjeta']
  if (!pedido_id || !monto || !metodosValidos.includes(metodo)) {
    return res.status(400).json({ error: 'Datos de cobro incompletos o inválidos' })
  }

  // Evita cobrar dos veces el mismo pedido
  const { data: existente } = await supabase
    .from('cobros')
    .select('id')
    .eq('pedido_id', pedido_id)
    .limit(1)

  if (existente && existente.length > 0) {
    return res.status(400).json({ error: 'Este pedido ya tiene un cobro registrado' })
  }

    const estadoCobro = (metodo === 'efectivo' || metodo === 'tarjeta') ? 'cobrado' : 'pendiente'

  const { data: cobro, error } = await supabase
    .from('cobros')
    .insert({
      pedido_id,
      monto,
      metodo,
      estado: estadoCobro,
      usuario_id: req.usuario.id
    })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, cobro })
})

// PATCH /api/cobros/:id/verificar — marca una transferencia como verificada
router.patch('/:id/verificar', auth, async (req, res) => {
  const supabase = getSupabase()
  const { error } = await supabase
    .from('cobros')
    .update({ estado: 'verificado' })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

module.exports = router