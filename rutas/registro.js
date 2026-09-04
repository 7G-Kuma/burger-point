const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')

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

function soloAdmin(req, res, next) {
  if (!['propietario', 'encargado'].includes(req.usuario.rol)) {
    return res.status(403).json({ error: 'No tenés permiso para ver el registro' })
  }
  next()
}

// GET /api/registro — historial completo de pedidos con filtros, para el panel de admin
router.get('/', auth, soloAdmin, async (req, res) => {
  const supabase = getSupabase()
  const { desde, hasta, estado, canal } = req.query
  const limite = Math.min(parseInt(req.query.limite) || 200, 500)

  let query = supabase
    .from('pedidos')
    .select(`
      id, numero_pedido, canal, estado, observaciones, creado_en, actualizado_en,
      usuarios ( nombre ),
      pedido_items ( id, cantidad, precio_unitario, observacion, productos ( nombre ) ),
      cobros ( id, monto, estado, metodo, creado_en ),
      incidencias ( id, tipo, descripcion, creado_en )
    `)
    .order('creado_en', { ascending: false })
    .limit(limite)

  if (desde) query = query.gte('creado_en', new Date(desde + 'T00:00:00').toISOString())
  if (hasta) query = query.lte('creado_en', new Date(hasta + 'T23:59:59').toISOString())
  if (estado) query = query.eq('estado', estado)
  if (canal) query = query.eq('canal', canal)

  const { data: pedidos, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const pedidosConTotal = pedidos.map(p => ({
    ...p,
    atendido_por: p.usuarios?.nombre || null,
    total: p.pedido_items?.reduce((s, i) => s + i.cantidad * Number(i.precio_unitario), 0) || 0
  }))

  res.json({ pedidos: pedidosConTotal })
})

module.exports = router
