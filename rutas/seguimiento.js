const express = require('express')
const { getSupabase } = require('./db')

const router = express.Router()

// GET /api/seguimiento/:numero — estado público de un pedido, sin login.
// Pensado para que el cliente consulte con el número que le dieron en caja.
router.get('/:numero', async (req, res) => {
  const supabase = getSupabase()
  const numero = parseInt(req.params.numero)

  if (!numero) return res.status(400).json({ error: 'Número de pedido inválido' })

  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select(`
      numero_pedido, canal, estado, creado_en,
      pedido_items ( cantidad, precio_unitario, productos ( nombre ) ),
      cobros ( metodo, estado )
    `)
    .eq('numero_pedido', numero)
    .single()

  if (error || !pedido) {
    return res.status(404).json({ error: 'No encontramos un pedido con ese número' })
  }

  const items = pedido.pedido_items?.map(i => ({
    cantidad: i.cantidad,
    nombre: i.productos?.nombre || 'Producto'
  })) || []

  const total = pedido.pedido_items?.reduce((s, i) => s + i.cantidad * Number(i.precio_unitario), 0) || 0
  const cobro = pedido.cobros?.[0] || null

  res.json({
    numero_pedido: pedido.numero_pedido,
    canal: pedido.canal,
    estado: pedido.estado,
    creado_en: pedido.creado_en,
    items,
    total,
    cobro: cobro ? { metodo: cobro.metodo, estado: cobro.estado } : null
  })
})

module.exports = router
