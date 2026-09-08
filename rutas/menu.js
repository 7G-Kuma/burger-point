const express = require('express')
const { getSupabase } = require('./db')
const { obtenerDisponibilidad } = require('./stock')
const { aplicarPromociones } = require('./promociones')

const router = express.Router()

// GET /api/menu — menú público, sin login, para que el cliente arme su pedido
router.get('/', async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, precio, descripcion')
    .eq('activo', true)
    .order('nombre')

  if (error) return res.status(500).json({ error: error.message })

  const disponibilidad = await obtenerDisponibilidad(supabase)
  const conPromos = await aplicarPromociones(supabase, data)
  const productos = conPromos.map(p => ({
    ...p,
    disponible: disponibilidad[p.id] ?? null
  }))

  res.json({ productos })
})

// POST /api/menu/pedido — el cliente crea su propio pedido, sin login
router.post('/pedido', async (req, res) => {
  const supabase = getSupabase()
  const { tipo_entrega, cliente_nombre, cliente_telefono, cliente_direccion, observaciones, items } = req.body

  if (!cliente_nombre?.trim() || !cliente_telefono?.trim()) {
    return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' })
  }
  if (!['retiro', 'delivery'].includes(tipo_entrega)) {
    return res.status(400).json({ error: 'Elegí retiro en el local o delivery' })
  }
  if (tipo_entrega === 'delivery' && !cliente_direccion?.trim()) {
    return res.status(400).json({ error: 'La dirección es obligatoria para delivery' })
  }
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un producto' })
  }

  const disponibilidad = await obtenerDisponibilidad(supabase, items.map(i => i.producto_id))
  const sinStock = items.find(i => disponibilidad[i.producto_id] !== undefined && i.cantidad > disponibilidad[i.producto_id])
  if (sinStock) {
    const { data: producto } = await supabase.from('productos').select('nombre').eq('id', sinStock.producto_id).single()
    return res.status(400).json({
      error: `No hay stock suficiente de "${producto?.nombre || 'un producto'}" (quedan ${disponibilidad[sinStock.producto_id]})`
    })
  }

  // El precio se toma del producto en el servidor — nunca del cliente, para que no se pueda falsear
  const { data: productosRaw, error: errorProductos } = await supabase
    .from('productos')
    .select('id, precio, activo')
    .in('id', items.map(i => i.producto_id))

  if (errorProductos) return res.status(500).json({ error: errorProductos.message })
  if (productosRaw.some(p => !p.activo) || productosRaw.length !== new Set(items.map(i => i.producto_id)).size) {
    return res.status(400).json({ error: 'Uno de los productos ya no está disponible' })
  }

  // precio_final ya viene con el descuento de cualquier promoción activa aplicado
  const productos = await aplicarPromociones(supabase, productosRaw)

  const canal = tipo_entrega === 'delivery' ? 'delivery' : 'online'

  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      canal,
      observaciones: observaciones || null,
      estado: 'recibido',
      usuario_id: null,
      cliente_nombre: cliente_nombre.trim(),
      cliente_telefono: cliente_telefono.trim(),
      cliente_direccion: tipo_entrega === 'delivery' ? cliente_direccion.trim() : null
    })
    .select()
    .single()

  if (errorPedido) return res.status(500).json({ error: errorPedido.message })

  const itemsParaInsertar = items.map(i => {
    const producto = productos.find(p => p.id === i.producto_id)
    return {
      pedido_id: pedido.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario: producto.precio_final,
      observacion: i.observacion || null
    }
  })

  const { error: errorItems } = await supabase.from('pedido_items').insert(itemsParaInsertar)
  if (errorItems) return res.status(500).json({ error: errorItems.message })

  res.json({ ok: true, pedido })
})

module.exports = router
