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
  console.log('>>> PATCH estado recibido:', JSON.stringify(estado))

  const estadosValidos = [
    'recibido','confirmado','en_preparacion','listo','entregado','cancelado'
  ]
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }

  if (estado === 'confirmado') {
    console.log('>>> Buscando items del pedido:', req.params.id)

    const { data: items, error: errorItems } = await supabase
      .from('pedido_items')
      .select('producto_id, cantidad')
      .eq('pedido_id', req.params.id)

    console.log('>>> Items encontrados:', JSON.stringify(items))
    if (errorItems) console.log('>>> ERROR items:', JSON.stringify(errorItems))
    if (errorItems) return res.status(500).json({ error: errorItems.message })

    for (const item of items) {
      const { data: receta, error: errorReceta } = await supabase
        .from('producto_insumos')
        .select('insumo_id, cantidad_usada')
        .eq('producto_id', item.producto_id)

      console.log('>>> Receta para producto', item.producto_id, ':', JSON.stringify(receta))
      if (errorReceta) console.log('>>> ERROR receta:', JSON.stringify(errorReceta))

      if (!receta) continue

      for (const ing of receta) {
        const { data: insumo, error: errorInsumo } = await supabase
          .from('insumos')
          .select('cantidad_actual')
          .eq('id', ing.insumo_id)
          .single()

        console.log('>>> Insumo actual:', JSON.stringify(insumo))
        if (errorInsumo) console.log('>>> ERROR insumo:', JSON.stringify(errorInsumo))

        if (!insumo) continue

        const nuevaCantidad = insumo.cantidad_actual - (ing.cantidad_usada * item.cantidad)
        console.log('>>> Nueva cantidad calculada:', nuevaCantidad)

        const { error: errorUpdate } = await supabase
          .from('insumos')
          .update({ cantidad_actual: nuevaCantidad })
          .eq('id', ing.insumo_id)

        if (errorUpdate) console.log('>>> ERROR update:', JSON.stringify(errorUpdate))
        else console.log('>>> Update OK para insumo', ing.insumo_id)
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