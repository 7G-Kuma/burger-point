const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')
const { registrarActividad } = require('./actividad')

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

// POST /api/incidencias — cualquier rol de staff logueado (caja, cocina,
// reparto, encargado, propietario) reporta un problema sobre un pedido
router.post('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { pedido_id, tipo, descripcion } = req.body
  const { error } = await supabase
    .from('incidencias')
    .insert({ pedido_id, tipo, descripcion, usuario_id: req.usuario.id, origen: 'staff' })
  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Registró una incidencia (${tipo})`)

  res.json({ ok: true })
})

// POST /api/incidencias/publica — PÚBLICO, sin login. El cliente deja una
// queja o sugerencia directamente desde el menú digital, esté o no atada a un
// pedido puntual (no hace falta haber pedido para poder quejarse)
router.post('/publica', async (req, res) => {
  const supabase = getSupabase()
  const { nombre, telefono, numero_pedido, mensaje } = req.body

  if (!nombre?.trim() || !mensaje?.trim()) {
    return res.status(400).json({ error: 'Contanos tu nombre y el mensaje' })
  }

  let pedido_id = null
  if (numero_pedido) {
    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id')
      .eq('numero_pedido', numero_pedido)
      .single()
    pedido_id = pedido?.id || null
  }

  const { error } = await supabase
    .from('incidencias')
    .insert({
      pedido_id,
      tipo: 'queja_cliente',
      descripcion: mensaje.trim(),
      origen: 'cliente',
      cliente_nombre: nombre.trim(),
      cliente_telefono: telefono?.trim() || null
    })

  if (error) return res.status(500).json({ error: error.message })

  res.json({ ok: true })
})

module.exports = router
