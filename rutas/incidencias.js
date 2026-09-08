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

router.post('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const { pedido_id, tipo, descripcion } = req.body
  const { error } = await supabase
    .from('incidencias')
    .insert({ pedido_id, tipo, descripcion, usuario_id: req.usuario.id })
  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Registró una incidencia (${tipo})`)

  res.json({ ok: true })
})

module.exports = router