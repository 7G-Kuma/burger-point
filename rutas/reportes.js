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

module.exports = router
