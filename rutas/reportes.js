const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')
const { requireSeccion } = require('./requireSeccion')

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

function totalItems(items) {
  return items?.reduce((s, i) => s + i.cantidad * Number(i.precio_unitario), 0) || 0
}

// GET /api/reportes?desde=&hasta=&canal= — estadísticas de ventas del rango elegido
router.get('/', auth, requireSeccion('reportes'), async (req, res) => {
  const supabase = getSupabase()
  const { desde, hasta, canal } = req.query

  let query = supabase
    .from('pedidos')
    .select(`
      id, numero_pedido, canal, estado, creado_en,
      pedido_items ( cantidad, precio_unitario, productos ( nombre, categoria ), pedido_item_extras ( nombre ) )
    `)
    .order('creado_en', { ascending: true })

  if (desde) query = query.gte('creado_en', new Date(desde + 'T00:00:00').toISOString())
  if (hasta) query = query.lte('creado_en', new Date(hasta + 'T23:59:59').toISOString())
  if (canal) query = query.eq('canal', canal)

  const { data: pedidos, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const validos = pedidos.filter(p => p.estado !== 'cancelado')
  const cancelados = pedidos.length - validos.length

  const totalVentas = validos.reduce((s, p) => s + totalItems(p.pedido_items), 0)
  const totalPedidos = validos.length
  const ticketPromedio = totalPedidos ? totalVentas / totalPedidos : 0

  const porDiaMap = {}
  validos.forEach(p => {
    const dia = p.creado_en.slice(0, 10)
    porDiaMap[dia] = (porDiaMap[dia] || 0) + totalItems(p.pedido_items)
  })
  const ventasPorDia = Object.entries(porDiaMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([fecha, total]) => ({ fecha, total }))

  const porCanalMap = {}
  validos.forEach(p => { porCanalMap[p.canal] = (porCanalMap[p.canal] || 0) + totalItems(p.pedido_items) })
  const ventasPorCanal = Object.entries(porCanalMap).map(([canal, total]) => ({ canal, total }))

  const porCategoriaMap = {}
  const porProductoMap = {}
  const porExtraMap = {}
  validos.forEach(p => {
    p.pedido_items?.forEach(i => {
      const nombre = i.productos?.nombre || '—'
      const cat = i.productos?.categoria || 'Otros'
      const sub = i.cantidad * Number(i.precio_unitario)

      if (!porProductoMap[nombre]) porProductoMap[nombre] = { cantidad: 0, total: 0 }
      porProductoMap[nombre].cantidad += i.cantidad
      porProductoMap[nombre].total += sub

      porCategoriaMap[cat] = (porCategoriaMap[cat] || 0) + sub

      i.pedido_item_extras?.forEach(e => { porExtraMap[e.nombre] = (porExtraMap[e.nombre] || 0) + 1 })
    })
  })

  const topProductos = Object.entries(porProductoMap)
    .map(([nombre, v]) => ({ nombre, ...v }))
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10)

  const topExtras = Object.entries(porExtraMap)
    .map(([nombre, veces]) => ({ nombre, veces }))
    .sort((a, b) => b.veces - a.veces)
    .slice(0, 8)

  const ventasPorCategoria = Object.entries(porCategoriaMap).map(([categoria, total]) => ({ categoria, total }))

  res.json({
    totalVentas, totalPedidos, ticketPromedio, cancelados,
    ventasPorDia, ventasPorCanal, ventasPorCategoria, topProductos, topExtras
  })
})

// GET /api/reportes/cierre?desde=&hasta= — cierre de caja: desglose por método
// de pago, distinguiendo lo ya confirmado de lo que todavía está pendiente de
// verificar (transferencias). Sin desde/hasta, cierra el día de hoy.
router.get('/cierre', auth, requireSeccion('reportes'), async (req, res) => {
  const supabase = getSupabase()
  const hoy = new Date().toISOString().slice(0, 10)
  const desde = req.query.desde || hoy
  const hasta = req.query.hasta || desde

  const { data: cobros, error } = await supabase
    .from('cobros')
    .select('id, monto, metodo, estado, creado_en, pedidos ( numero_pedido, canal )')
    .gte('creado_en', desde + 'T00:00:00')
    .lte('creado_en', hasta + 'T23:59:59')
    .order('creado_en', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const metodos = ['efectivo', 'tarjeta', 'transferencia']
  const porMetodo = metodos.map(metodo => {
    const filas = cobros.filter(c => c.metodo === metodo)
    const confirmados = filas.filter(c => c.estado !== 'pendiente')
    const pendientes = filas.filter(c => c.estado === 'pendiente')
    return {
      metodo,
      confirmado: { monto: confirmados.reduce((s, c) => s + Number(c.monto), 0), cantidad: confirmados.length },
      pendiente: { monto: pendientes.reduce((s, c) => s + Number(c.monto), 0), cantidad: pendientes.length }
    }
  })

  const totalConfirmado = porMetodo.reduce((s, m) => s + m.confirmado.monto, 0)
  const totalPendiente = porMetodo.reduce((s, m) => s + m.pendiente.monto, 0)
  const cantidadCobros = cobros.length

  const { data: canceladosRaw } = await supabase
    .from('pedidos')
    .select('id, pedido_items ( cantidad, precio_unitario )')
    .eq('estado', 'cancelado')
    .gte('creado_en', desde + 'T00:00:00')
    .lte('creado_en', hasta + 'T23:59:59')

  const cancelados = {
    cantidad: canceladosRaw?.length || 0,
    total: canceladosRaw?.reduce((s, p) => s + totalItems(p.pedido_items), 0) || 0
  }

  res.json({
    desde, hasta,
    porMetodo, totalConfirmado, totalPendiente,
    totalGeneral: totalConfirmado + totalPendiente,
    cantidadCobros, cancelados
  })
})

module.exports = router
