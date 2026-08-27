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

// GET /api/pedidos — lista pedidos de hoy
router.get('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const limite   = parseInt(req.query.limite) || 50

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const { data: pedidos, error } = await supabase
    .from('pedidos')
    .select(`
      id, numero_pedido, canal, estado,
      observaciones, creado_en,
      pedido_items (
        cantidad, precio_unitario, observacion,
        productos ( nombre )
      ),
      cobros ( monto, estado, metodo )
    `)
    .gte('creado_en', hoy.toISOString())
    .order('creado_en', { ascending: false })
    .limit(limite)

  if (error) return res.status(500).json({ error: error.message })

  // Calcula total de cada pedido
  const pedidosConTotal = pedidos.map(p => ({
    ...p,
    total: p.pedido_items?.reduce((s, i) =>
      s + (i.cantidad * i.precio_unitario), 0) || 0
  }))

  res.json({ pedidos: pedidosConTotal })
})

// GET /api/pedidos/:id — detalle de un pedido
router.get('/:id', auth, async (req, res) => {
  const supabase = getSupabase()

  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select(`
      id, numero_pedido, canal, estado, observaciones, creado_en,
      pedido_items (
        id, cantidad, precio_unitario, observacion,
        productos ( id, nombre, precio )
      ),
      cobros ( id, monto, estado, metodo )
    `)
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Pedido no encontrado' })
  res.json({ pedido })
})

// POST /api/pedidos — crear nuevo pedido
router.post('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { canal, observaciones, items } = req.body

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un producto' })
  }

  // Crea el pedido
  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      canal,
      observaciones,
      estado: 'recibido',
      usuario_id: req.usuario.id
    })
    .select()
    .single()

  if (errorPedido) return res.status(500).json({ error: errorPedido.message })

  // Agrega los items
  const itemsParaInsertar = items.map(i => ({
    pedido_id:      pedido.id,
    producto_id:    i.producto_id,
    cantidad:       i.cantidad,
    precio_unitario: i.precio_unitario,
    observacion:    i.observacion || null
  }))

  const { error: errorItems } = await supabase
    .from('pedido_items')
    .insert(itemsParaInsertar)

  if (errorItems) return res.status(500).json({ error: errorItems.message })

  res.json({ ok: true, pedido })
})

// PATCH /api/pedidos/:id/estado — actualizar estado
router.patch('/:id/estado', auth, async (req, res) => {
  const supabase = getSupabase()
  const { estado } = req.body

  const estadosValidos = [
    'recibido','confirmado','en_preparacion','listo','entregado','cancelado'
  ]
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }

  // Al confirmar el pedido, descuenta el stock de insumos según la receta
  if (estado === 'confirmado') {
    const { data: items, error: errorItems } = await supabase
      .from('pedido_items')
      .select('producto_id, cantidad')
      .eq('pedido_id', req.params.id)

    if (errorItems) return res.status(500).json({ error: errorItems.message })

    for (const item of items) {
      const { data: receta } = await supabase
        .from('producto_insumos')
        .select('insumo_id, cantidad_usada')
        .eq('producto_id', item.producto_id)

      if (!receta) continue

      for (const ing of receta) {
        const { data: insumo } = await supabase
          .from('insumos')
          .select('cantidad_actual')
          .eq('id', ing.insumo_id)
          .single()

        if (!insumo) continue

        const nuevaCantidad = insumo.cantidad_actual - (ing.cantidad_usada * item.cantidad)

        await supabase
          .from('insumos')
          .update({ cantidad_actual: nuevaCantidad })
          .eq('id', ing.insumo_id)
      }
    }
  }

  const { error } = await supabase
    .from('pedidos')
    .update({ estado, actualizado_en: new Date().toISOString() })
    .eq('id', req.params.id)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true })
})

module.exports = router