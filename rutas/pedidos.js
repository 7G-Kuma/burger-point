const express = require('express')
const jwt     = require('jsonwebtoken')
const PDFDocument = require('pdfkit')
const { getSupabase } = require('./db')
const { obtenerDisponibilidad } = require('./stock')
const { registrarActividad } = require('./actividad')
const EMPRESA = require('./empresa')

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
      cliente_nombre, cliente_telefono, cliente_direccion,
      pedido_items (
        cantidad, precio_unitario, observacion,
        productos ( nombre ),
        pedido_item_extras ( nombre, precio )
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
      cliente_nombre, cliente_telefono, cliente_direccion,
      pedido_items (
        id, cantidad, precio_unitario, observacion,
        productos ( id, nombre, precio ),
        pedido_item_extras ( nombre, precio )
      ),
      cobros ( id, monto, estado, metodo )
    `)
    .eq('id', req.params.id)
    .single()

  if (error) return res.status(404).json({ error: 'Pedido no encontrado' })
  res.json({ pedido })
})

// GET /api/pedidos/:id/factura — genera la factura del pedido en PDF
router.get('/:id/factura', auth, async (req, res) => {
  const supabase = getSupabase()

  const { data: pedido, error } = await supabase
    .from('pedidos')
    .select(`
      numero_pedido, canal, estado, observaciones, creado_en,
      cliente_nombre, cliente_telefono, cliente_direccion,
      usuarios ( nombre ),
      pedido_items ( cantidad, precio_unitario, observacion, productos ( nombre ), pedido_item_extras ( nombre, precio ) ),
      cobros ( monto, estado, metodo ),
      incidencias ( tipo, descripcion, creado_en ),
      facturas ( numero_factura, creado_en )
    `)
    .eq('id', req.params.id)
    .single()

  if (error || !pedido) return res.status(404).json({ error: 'Pedido no encontrado' })

  const total = pedido.pedido_items?.reduce((s, i) => s + i.cantidad * Number(i.precio_unitario), 0) || 0
  const cobro = pedido.cobros?.[0]
  const factura = pedido.facturas?.[0]

  const doc = new PDFDocument({ size: 'A4', margin: 50 })
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="factura-${factura?.numero_factura ?? pedido.numero_pedido}.pdf"`)
  doc.pipe(res)

  // Sin cobro todavía no hay factura real (se emite recién en POST /api/cobros) —
  // no tiene sentido imprimir una Factura A con CAE para un pedido que no se cobró.
  if (!factura) {
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#141414').text('Burger Point', 50, 60)
    doc.font('Helvetica').fontSize(11).fillColor('#5c5c5c')
      .text(`Pedido #${pedido.numero_pedido} — todavía no fue cobrado`, 50, 90)
      .text('La factura se emite automáticamente al confirmar el cobro en caja.', 50, 108)
    doc.end()
    return
  }

  const fechaEmision = new Date(factura?.creado_en || pedido.creado_en)
  const numeroComprobante = String(factura?.numero_factura ?? pedido.numero_pedido).padStart(8, '0')

  // Neto/IVA discriminados a partir del total final (los precios del menú ya incluyen IVA) —
  // es lo que distingue a la Factura A de la B, que no discrimina el impuesto.
  const neto = total / 1.21
  const iva  = total - neto

  // CAE de demostración: no hay inscripción real en ARCA/AFIP para este proyecto,
  // así que se genera un número con formato válido (14 dígitos) pero sin validez fiscal.
  const cae = '70' + numeroComprobante.padStart(12, '0')
  const caeVencimiento = new Date(fechaEmision.getTime() + 10 * 24 * 60 * 60 * 1000)
  const fechaDDMMYYYY = f => `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`

  const NEGRO = '#141414', GRIS = '#5c5c5c', GRIS_CLARO = '#999'
  const IZQ = 50, DER = 545, ANCHO = DER - IZQ

  // ── ENCABEZADO: emisor / letra "A" / datos del comprobante ──
  doc.font('Helvetica-Bold').fontSize(15).fillColor(NEGRO).text(EMPRESA.razonSocial, IZQ, 48, { width: 245 })
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text(`Domicilio Comercial: ${EMPRESA.domicilio}`, IZQ, 68, { width: 245 })
    .text(`Condición frente al IVA: ${EMPRESA.condicionIva}`, IZQ, 80, { width: 245 })

  doc.rect(280, 45, 38, 48).strokeColor(NEGRO).lineWidth(1).stroke()
  doc.font('Helvetica-Bold').fontSize(26).fillColor(NEGRO).text('A', 280, 55, { width: 38, align: 'center' })
  doc.font('Helvetica').fontSize(7).text('COD. 01', 280, 87, { width: 38, align: 'center' })

  doc.font('Helvetica-Bold').fontSize(16).fillColor(NEGRO).text('FACTURA', 340, 48, { width: 205, align: 'right' })
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text(`Punto de Venta: ${EMPRESA.puntoVenta}   Comp. Nro: ${numeroComprobante}`, 340, 68, { width: 205, align: 'right' })
    .text(`Fecha de Emisión: ${fechaDDMMYYYY(fechaEmision)}`, 340, 80, { width: 205, align: 'right' })

  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS)
    .text(`CUIT: ${EMPRESA.cuit}    Ingresos Brutos: ${EMPRESA.ingresosBrutos}    Inicio de Actividades: ${EMPRESA.inicioActividades}`, IZQ, 112, { width: ANCHO })

  doc.moveTo(IZQ, 130).lineTo(DER, 130).strokeColor('#ccc').lineWidth(1).stroke()

  // ── RECEPTOR ──
  const tieneCliente = !!pedido.cliente_nombre
  let y = 142
  doc.font('Helvetica').fontSize(9).fillColor(GRIS)
  doc.text(`CUIT/CUIL: ${tieneCliente ? 'No informado' : '—'}`, IZQ, y); y += 14
  doc.text(`Apellido y Nombre / Razón Social: ${pedido.cliente_nombre || 'Consumidor Final'}`, IZQ, y); y += 14
  doc.text('Condición frente al IVA: Consumidor Final', IZQ, y); y += 14
  doc.text(`Domicilio: ${pedido.cliente_direccion || '—'}`, IZQ, y); y += 14
  doc.text(`Condición de venta: Contado${pedido.canal === 'delivery' ? ' (envío a domicilio)' : ''}`, IZQ, y); y += 20

  doc.moveTo(IZQ, y).lineTo(DER, y).strokeColor('#ccc').stroke()
  y += 16

  // ── DETALLE ──
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NEGRO)
  doc.text('Cant.', IZQ, y, { width: 40 })
  doc.text('Producto / Servicio', IZQ + 45, y, { width: 260 })
  doc.text('P. Unitario', IZQ + 305, y, { width: 90, align: 'right' })
  doc.text('Subtotal', IZQ + 395, y, { width: 100, align: 'right' })
  y += 14
  doc.moveTo(IZQ, y).lineTo(DER, y).strokeColor('#ccc').stroke()
  y += 10

  doc.font('Helvetica').fontSize(9).fillColor('#333')
  pedido.pedido_items?.forEach(item => {
    const subtotal = item.cantidad * Number(item.precio_unitario)
    doc.text(String(item.cantidad), IZQ, y, { width: 40 })
    doc.text(item.productos?.nombre || 'Producto', IZQ + 45, y, { width: 260 })
    doc.text(`$${Number(item.precio_unitario).toLocaleString('es-AR')}`, IZQ + 305, y, { width: 90, align: 'right' })
    doc.text(`$${subtotal.toLocaleString('es-AR')}`, IZQ + 395, y, { width: 100, align: 'right' })
    y += 15
    if (item.pedido_item_extras?.length) {
      const listaExtras = item.pedido_item_extras.map(e => Number(e.precio) > 0 ? `${e.nombre} (+$${Number(e.precio).toLocaleString('es-AR')})` : e.nombre).join(', ')
      doc.fillColor(GRIS_CLARO).fontSize(8).text(`+ ${listaExtras}`, IZQ + 45, y, { width: 260 })
      doc.fillColor('#333').fontSize(9)
      y += 13
    }
    if (item.observacion) {
      doc.fillColor(GRIS_CLARO).fontSize(8).text(`Nota: ${item.observacion}`, IZQ + 45, y, { width: 260 })
      doc.fillColor('#333').fontSize(9)
      y += 13
    }
  })

  y += 6
  doc.moveTo(IZQ, y).lineTo(DER, y).strokeColor('#ccc').stroke()
  y += 12

  // ── TOTALES CON IVA DISCRIMINADO (lo característico de la Factura A) ──
  doc.font('Helvetica').fontSize(9.5).fillColor(GRIS)
  doc.text('Importe Neto Gravado:', IZQ + 250, y, { width: 175, align: 'left' })
  doc.text(`$${neto.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, IZQ + 395, y, { width: 100, align: 'right' })
  y += 15
  doc.text('IVA 21%:', IZQ + 250, y, { width: 175, align: 'left' })
  doc.text(`$${iva.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, IZQ + 395, y, { width: 100, align: 'right' })
  y += 15
  doc.text('Importe Otros Tributos:', IZQ + 250, y, { width: 175, align: 'left' })
  doc.text('$0,00', IZQ + 395, y, { width: 100, align: 'right' })
  y += 18
  doc.moveTo(IZQ + 250, y).lineTo(DER, y).strokeColor(NEGRO).stroke()
  y += 8
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NEGRO)
  doc.text('Importe Total:', IZQ + 250, y, { width: 175, align: 'left' })
  doc.text(`$${total.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, IZQ + 395, y, { width: 100, align: 'right' })
  y += 34

  if (pedido.observaciones) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NEGRO).text('Observaciones:', IZQ, y)
    y += 13
    doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(pedido.observaciones, IZQ, y, { width: ANCHO })
    y += 26
  }

  // ── CAE (Código de Autorización Electrónico) ──
  doc.rect(IZQ, y, ANCHO, 34).strokeColor('#ccc').stroke()
  doc.font('Helvetica-Bold').fontSize(9).fillColor(NEGRO).text(`CAE N°: ${cae}`, IZQ + 10, y + 9)
  doc.font('Helvetica').fontSize(9).fillColor(GRIS)
    .text(`Fecha de Vto. de CAE: ${fechaDDMMYYYY(caeVencimiento)}`, IZQ + 260, y + 9, { width: 225, align: 'right' })

  doc.font('Helvetica').fontSize(7.5).fillColor(GRIS_CLARO)
    .text('Comprobante de uso académico/demostrativo — generado para el proyecto Burger Point, no válido como factura fiscal ante ARCA.', IZQ, 750, { width: ANCHO, align: 'center' })

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

  await registrarActividad(supabase, req.usuario, `Creó el pedido #${pedido.numero_pedido}`)

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

  const { data: actualizado, error } = await supabase
    .from('pedidos')
    .update({ estado, actualizado_en: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('numero_pedido')
    .single()

  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Cambió el pedido #${actualizado?.numero_pedido} a "${estado}"`)

  res.json({ ok: true })
})

module.exports = router