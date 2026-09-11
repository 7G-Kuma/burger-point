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

async function ventasEnRango(supabase, desde, hasta) {
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('creado_en, estado, pedido_items ( cantidad, precio_unitario )')
    .gte('creado_en', desde + 'T00:00:00')
    .lte('creado_en', hasta + 'T23:59:59')
  return { pedidos: pedidos || [] }
}

// "Lo esperado" para un solo día = promedio de venta de las últimas `semanas`
// ocurrencias del mismo día de la semana (así un viernes se compara con otros
// viernes, no con el promedio general que mezcla días flojos y fuertes)
async function esperadoMismoDiaSemana(supabase, fechaIso, semanas = 8) {
  const fechaObj = new Date(fechaIso + 'T00:00:00')
  const fechasComparables = []
  for (let i = 1; i <= semanas; i++) {
    const d = new Date(fechaObj)
    d.setDate(d.getDate() - i * 7)
    fechasComparables.push(d.toISOString().slice(0, 10))
  }

  const { pedidos } = await ventasEnRango(supabase, fechasComparables[fechasComparables.length - 1], fechasComparables[0])

  const porDia = {}
  pedidos.forEach(p => {
    if (p.estado === 'cancelado') return
    const dia = p.creado_en.slice(0, 10)
    if (!fechasComparables.includes(dia)) return
    porDia[dia] = (porDia[dia] || 0) + totalItems(p.pedido_items)
  })

  const diasConVentas = Object.keys(porDia)
  const muestras = diasConVentas.length
  const esperado = muestras ? diasConVentas.reduce((s, d) => s + porDia[d], 0) / semanas : 0
  return { esperado, muestras }
}

// "Lo esperado" para un rango de varios días = el total del período inmediatamente
// anterior, de la misma cantidad de días
async function esperadoPeriodoAnterior(supabase, desde, hasta) {
  const desdeObj = new Date(desde + 'T00:00:00')
  const hastaObj = new Date(hasta + 'T00:00:00')
  const dias = Math.round((hastaObj - desdeObj) / 86400000) + 1

  const finAnterior = new Date(desdeObj); finAnterior.setDate(finAnterior.getDate() - 1)
  const inicioAnterior = new Date(finAnterior); inicioAnterior.setDate(inicioAnterior.getDate() - (dias - 1))
  const iso = d => d.toISOString().slice(0, 10)

  const { pedidos } = await ventasEnRango(supabase, iso(inicioAnterior), iso(finAnterior))
  const esperado = pedidos.filter(p => p.estado !== 'cancelado').reduce((s, p) => s + totalItems(p.pedido_items), 0)
  return { esperado, muestras: esperado > 0 ? 1 : 0 }
}

const METODO_TEXTO = { efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia' }

// Arma la frase en español para que el propietario no tenga que interpretar
// el gráfico — clasifica el día en una escala de "muy por debajo" a "muy por
// encima" de lo esperado, con un margen de ±8% considerado normal.
function generarResumen({ totalVentas, totalPedidos, esperado, muestras, porMetodo, cancelados, incidencias }) {
  if (muestras === 0) {
    let texto = totalPedidos > 0
      ? `Se vendieron $${totalVentas.toLocaleString('es-AR')} en ${totalPedidos} pedido${totalPedidos === 1 ? '' : 's'}. Todavía no hay suficiente historial para saber si es más o menos de lo habitual.`
      : `No hubo ventas en este rango.`
    if (incidencias?.length > 0) {
      texto += ` Se reportaron ${incidencias.length} incidencia${incidencias.length === 1 ? '' : 's'} — revisalas abajo.`
    }
    return { texto, categoria: 'sin_datos', variacion: null }
  }

  const variacion = esperado > 0 ? ((totalVentas - esperado) / esperado) * 100 : (totalVentas > 0 ? 100 : 0)

  let categoria, calificativo
  if (variacion >= 20)       { categoria = 'muy_por_encima'; calificativo = 'bastante por encima de lo esperado 🎉' }
  else if (variacion >= 8)   { categoria = 'por_encima';     calificativo = 'un poco por encima de lo esperado 📈' }
  else if (variacion > -8)   { categoria = 'normal';         calificativo = 'dentro de lo normal, como se esperaba' }
  else if (variacion > -20)  { categoria = 'por_debajo';     calificativo = 'un poco por debajo de lo esperado 📉' }
  else                       { categoria = 'muy_por_debajo'; calificativo = 'bastante por debajo de lo esperado ⚠️' }

  let texto = `Se vendieron $${totalVentas.toLocaleString('es-AR')} en ${totalPedidos} pedido${totalPedidos === 1 ? '' : 's'}, ${calificativo} (lo habitual para este período ronda los $${Math.round(esperado).toLocaleString('es-AR')}).`

  const metodoTop = [...porMetodo].sort((a, b) => b.confirmado.monto - a.confirmado.monto)[0]
  if (metodoTop && metodoTop.confirmado.monto > 0) {
    texto += ` La mayor parte se cobró en ${METODO_TEXTO[metodoTop.metodo]}.`
  }
  if (cancelados?.cantidad > 0) {
    texto += ` Hubo ${cancelados.cantidad} pedido${cancelados.cantidad === 1 ? '' : 's'} cancelado${cancelados.cantidad === 1 ? '' : 's'}.`
  }
  if (incidencias?.length > 0) {
    texto += ` Se reportaron ${incidencias.length} incidencia${incidencias.length === 1 ? '' : 's'} — revisalas abajo.`
  }

  return { texto, categoria, variacion: Math.round(variacion) }
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

  // Incidencias/quejas del rango — las carga el staff (cualquier rol, sobre un
  // pedido) o directamente el cliente desde el menú digital (con o sin pedido
  // asociado). Visible para propietario y encargado (ambos dirigen al
  // personal — caja, cocina, reparto — y necesitan verlas para gestionar)
  const { data: incidenciasRaw } = await supabase
    .from('incidencias')
    .select('id, tipo, descripcion, creado_en, origen, cliente_nombre, cliente_telefono, pedidos ( numero_pedido ), usuarios ( nombre )')
    .gte('creado_en', desde + 'T00:00:00')
    .lte('creado_en', hasta + 'T23:59:59')
    .order('creado_en', { ascending: false })

  const incidencias = (incidenciasRaw || []).map(i => ({
    id: i.id,
    tipo: i.tipo,
    descripcion: i.descripcion,
    creado_en: i.creado_en,
    origen: i.origen || 'staff',
    numero_pedido: i.pedidos?.numero_pedido || null,
    reportado_por: i.origen === 'cliente'
      ? (i.cliente_nombre || 'Cliente') + (i.cliente_telefono ? ` (${i.cliente_telefono})` : '')
      : (i.usuarios?.nombre || null)
  }))

  // "Lo esperado" — un solo día se compara contra el mismo día de la semana;
  // un rango de varios días, contra el período inmediatamente anterior
  const { esperado, muestras } = desde === hasta
    ? await esperadoMismoDiaSemana(supabase, desde)
    : await esperadoPeriodoAnterior(supabase, desde, hasta)

  const resumen = generarResumen({
    totalVentas: totalConfirmado + totalPendiente,
    totalPedidos: cantidadCobros,
    esperado, muestras, porMetodo, cancelados, incidencias
  })

  res.json({
    desde, hasta,
    porMetodo, totalConfirmado, totalPendiente,
    totalGeneral: totalConfirmado + totalPendiente,
    cantidadCobros, cancelados, incidencias, resumen
  })
})

module.exports = router
