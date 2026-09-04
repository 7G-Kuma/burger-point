const express = require('express')
const jwt     = require('jsonwebtoken')
const PDFDocument = require('pdfkit')
const { getSupabase } = require('./db')
const { obtenerDisponibilidad } = require('./stock')

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
      cobros ( id, monto, estado, metodo )
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

// GET /api/pedidos/:id/boleta — genera el comprobante del pedido en PDF
router.get('/:id/boleta', auth, async (req, res) => {
  const supabase = getSupabase()

  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select(`
      numero_pedido, canal, estado, observaciones, creado_en,
      usuarios ( nombre ),
      pedido_items ( cantidad, precio_unitario, observacion, productos ( nombre ) ),
      cobros ( monto, estado, metodo ),
      incidencias ( tipo, descripcion, creado_en )
    `)
    .eq('id', req.params.id)
    .single()

  if (error || !pedido) return res.status(404).json({ error: 'Pedido no encontrado' })

  const total = pedido.pedido_items?.reduce((s, i) => s + i.cantidad * Number(i.precio_unitario), 0) || 0
  const cobro = pedido.cobros?.[0]

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="boleta-${pedido.numero_pedido}.pdf"`)
  doc.pipe(res)

  doc.circle(70, 65, 22).fill('#e8832a')
  doc.fillColor('#1a1108').font('Helvetica-Bold').fontSize(15).text('BP', 58, 56)

  doc.fillColor('#1a1108').font('Helvetica-Bold').fontSize(22).text('BURGER POINT', 105, 45)
  doc.fillColor('#8a7d6e').font('Helvetica').fontSize(10).text('Comprobante de pedido', 105, 70)

  doc.fillColor('#1a1108').font('Helvetica-Bold').fontSize(14).text(`Pedido #${pedido.numero_pedido}`, 350, 45, { width: 195, align: 'right' })
  doc.fillColor('#8a7d6e').font('Helvetica').fontSize(9)
    .text(new Date(pedido.creado_en).toLocaleString('es-AR'), 350, 65, { width: 195, align: 'right' })

  doc.moveTo(50, 105).lineTo(545, 105).strokeColor('#ddd').stroke()

  let y = 122
  doc.font('Helvetica').fontSize(10).fillColor('#555')
  doc.text(`Canal: ${pedido.canal}`, 50, y)
  doc.text(`Estado: ${pedido.estado}`, 300, y)
  y += 16
  doc.text(`Atendido por: ${pedido.usuarios?.nombre || '—'}`, 50, y)
  if (cobro) doc.text(`Pago: ${cobro.metodo} (${cobro.estado})`, 300, y)
  y += 32

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1108')
  doc.text('Cant', 50, y)
  doc.text('Producto', 90, y)
  doc.text('P. Unit', 350, y, { width: 80, align: 'right' })
  doc.text('Subtotal', 450, y, { width: 95, align: 'right' })
  y += 15
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke()
  y += 10

  doc.font('Helvetica').fontSize(10).fillColor('#333')
  pedido.pedido_items?.forEach(item => {
    const subtotal = item.cantidad * Number(item.precio_unitario)
    doc.text(String(item.cantidad), 50, y)
    doc.text(item.productos?.nombre || 'Producto', 90, y, { width: 250 })
    doc.text(`$${Number(item.precio_unitario).toLocaleString('es-AR')}`, 350, y, { width: 80, align: 'right' })
    doc.text(`$${subtotal.toLocaleString('es-AR')}`, 450, y, { width: 95, align: 'right' })
    y += 18
    if (item.observacion) {
      doc.fillColor('#e8832a').fontSize(9).text(`⚠ ${item.observacion}`, 90, y, { width: 250 })
      doc.fillColor('#333').fontSize(10)
      y += 16
    }
  })

  doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke()
  y += 12
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1108')
  doc.text('TOTAL', 350, y, { width: 80, align: 'right' })
  doc.text(`$${total.toLocaleString('es-AR')}`, 450, y, { width: 95, align: 'right' })
  y += 34

  if (pedido.observaciones) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1108').text('Observaciones:', 50, y)
    y += 14
    doc.font('Helvetica').fontSize(10).fillColor('#555').text(pedido.observaciones, 50, y, { width: 495 })
    y += 28
  }

  if (pedido.incidencias?.length) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#d94f3d').text('Incidencias registradas:', 50, y)
    y += 14
    doc.font('Helvetica').fontSize(9).fillColor('#555')
    pedido.incidencias.forEach(inc => {
      doc.text(`• ${inc.tipo}: ${inc.descripcion || ''} (${new Date(inc.creado_en).toLocaleString('es-AR')})`, 55, y, { width: 490 })
      y += 14
    })
  }

  doc.font('Helvetica').fontSize(9).fillColor('#8a7d6e')
    .text('Gracias por elegir Burger Point', 50, 780, { width: 495, align: 'center' })

  doc.end()
})

// POST /api/pedidos — crear nuevo pedido
router.post('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { canal, observaciones, items } = req.body

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

  const estadosValidos = [
    'recibido','confirmado','en_preparacion','listo','entregado','cancelado'
  ]
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' })
  }

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