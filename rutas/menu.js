const express = require('express')
const { getSupabase } = require('./db')
const { obtenerDisponibilidad } = require('./stock')
const { aplicarPromociones } = require('./promociones')
const { upsertCliente } = require('./clientes')

const router = express.Router()

// GET /api/menu — menú público, sin login, para que el cliente arme su pedido
router.get('/', async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('productos')
    .select('id, nombre, precio, descripcion, producto_extras ( extras ( id, nombre, precio, activo ) )')
    .eq('activo', true)
    .order('nombre')

  if (error) return res.status(500).json({ error: error.message })

  const disponibilidad = await obtenerDisponibilidad(supabase)
  const conPromos = await aplicarPromociones(supabase, data)
  const productos = conPromos.map(p => ({
    ...p,
    disponible: disponibilidad[p.id] ?? null,
    extras: p.producto_extras?.map(pe => pe.extras).filter(e => e?.activo) || []
  }))
  productos.forEach(p => delete p.producto_extras)

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

  // El precio se toma del producto (+ extras elegidos) en el servidor — nunca del
  // cliente, para que no se pueda falsear
  const { data: productosRaw, error: errorProductos } = await supabase
    .from('productos')
    .select('id, precio, activo, producto_extras ( extras ( id, nombre, precio, activo ) )')
    .in('id', items.map(i => i.producto_id))

  if (errorProductos) return res.status(500).json({ error: errorProductos.message })
  if (productosRaw.some(p => !p.activo) || productosRaw.length !== new Set(items.map(i => i.producto_id)).size) {
    return res.status(400).json({ error: 'Uno de los productos ya no está disponible' })
  }

  // precio_final ya viene con el descuento de cualquier promoción activa aplicado
  const productos = await aplicarPromociones(supabase, productosRaw)

  const canal = tipo_entrega === 'delivery' ? 'delivery' : 'online'

  // Arma/actualiza el perfil del cliente por teléfono en cada pedido — así el
  // registro de clientes se arma solo, tenga o no un "perfil" explícito armado
  // desde el login del menú
  const clienteId = await upsertCliente(supabase, {
    telefono: cliente_telefono.trim(),
    nombre: cliente_nombre.trim()
  })

  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      canal,
      observaciones: observaciones || null,
      estado: 'recibido',
      usuario_id: null,
      cliente_id: clienteId,
      cliente_nombre: cliente_nombre.trim(),
      cliente_telefono: cliente_telefono.trim(),
      cliente_direccion: tipo_entrega === 'delivery' ? cliente_direccion.trim() : null
    })
    .select()
    .single()

  if (errorPedido) return res.status(500).json({ error: errorPedido.message })

  // Solo se aceptan extras que el producto realmente ofrece — cualquier otro
  // extra_id mandado por el cliente se ignora en vez de romper el pedido
  const extrasElegidosPorItem = items.map(i => {
    const producto = productos.find(p => p.id === i.producto_id)
    const disponibles = producto.producto_extras?.map(pe => pe.extras).filter(e => e?.activo) || []
    const elegidos = (i.extra_ids || [])
      .map(id => disponibles.find(e => e.id === id))
      .filter(Boolean)
    return { producto, elegidos }
  })

  const itemsParaInsertar = items.map((i, idx) => {
    const { producto, elegidos } = extrasElegidosPorItem[idx]
    const extrasTotal = elegidos.reduce((s, e) => s + Number(e.precio), 0)
    return {
      pedido_id: pedido.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
      precio_unitario: Number(producto.precio_final) + extrasTotal,
      observacion: i.observacion || null
    }
  })

  const { data: itemsInsertados, error: errorItems } = await supabase
    .from('pedido_items')
    .insert(itemsParaInsertar)
    .select()

  if (errorItems) return res.status(500).json({ error: errorItems.message })

  const filasExtras = itemsInsertados.flatMap((item, idx) =>
    extrasElegidosPorItem[idx].elegidos.map(e => ({
      pedido_item_id: item.id,
      extra_id: e.id,
      nombre: e.nombre,
      precio: e.precio
    }))
  )

  if (filasExtras.length > 0) {
    const { error: errorExtras } = await supabase.from('pedido_item_extras').insert(filasExtras)
    if (errorExtras) return res.status(500).json({ error: errorExtras.message })
  }

  res.json({ ok: true, pedido })
})

module.exports = router
