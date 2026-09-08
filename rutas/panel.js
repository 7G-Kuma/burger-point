const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')
const { requireSeccion } = require('./requireSeccion')

const router = express.Router()

// Middleware — verifica token
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

// GET /api/panel/estadisticas
router.get('/estadisticas', auth, requireSeccion('panel'), async (req, res) => {
  const supabase = getSupabase()

  // Inicio del día de hoy
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('estado, creado_en')
    .gte('creado_en', hoy.toISOString())

  const { data: cobros } = await supabase
    .from('cobros')
    .select('monto, estado')
    .gte('creado_en', hoy.toISOString())

  const total_pedidos  = pedidos?.length || 0
  const cancelados     = pedidos?.filter(p => p.estado === 'cancelado').length || 0
  const activos        = pedidos?.filter(p =>
    ['recibido','confirmado','en_preparacion','listo'].includes(p.estado)
  ).length || 0

  const cobrado  = cobros?.filter(c => c.estado !== 'pendiente')
    .reduce((s, c) => s + Number(c.monto), 0) || 0
  const pendiente = cobros?.filter(c => c.estado === 'pendiente')
    .reduce((s, c) => s + Number(c.monto), 0) || 0
  const ventas   = cobrado + pendiente

  res.json({ total_pedidos, cancelados, activos, ventas, cobrado, pendiente })
})

// GET /api/panel/alertas
router.get('/alertas', auth, requireSeccion('panel'), async (req, res) => {
  const supabase = getSupabase()
  const alertas  = []

  // Transferencias pendientes hace más de 30 min
  const hace30 = new Date(Date.now() - 30 * 60 * 1000)
  const { data: transferencias } = await supabase
    .from('cobros')
    .select('id, monto, creado_en')
    .eq('estado', 'pendiente')
    .eq('metodo', 'transferencia')
    .lt('creado_en', hace30.toISOString())

  if (transferencias?.length > 0) {
    alertas.push({
      tipo: 'warning',
      icono: '💸',
      titulo: `${transferencias.length} transferencia(s) sin verificar`,
      descripcion: 'Llevan más de 30 minutos pendientes de confirmación'
    })
  }

  // Stock crítico
  const { data: insumos } = await supabase
    .from('insumos')
    .select('nombre, cantidad_actual, cantidad_minima')

  const criticos = insumos?.filter(i => i.cantidad_actual <= i.cantidad_minima) || []
  criticos.forEach(i => {
    alertas.push({
      tipo: 'danger',
      icono: '📦',
      titulo: `Stock crítico: ${i.nombre}`,
      descripcion: `Solo quedan ${i.cantidad_actual} ${i.unidad || 'unidades'}`
    })
  })

  res.json({ alertas })
})

module.exports = router