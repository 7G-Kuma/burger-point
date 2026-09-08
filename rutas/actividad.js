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

// Registra una acción del encargado para que el propietario la vea en su panel.
// No hace nada si quien actuó no es encargado (al propietario no le hace falta notificarse a sí mismo).
async function registrarActividad(supabase, usuario, accion) {
  if (!usuario || usuario.rol !== 'encargado') return
  await supabase.from('actividad').insert({
    usuario_id: usuario.id,
    rol: usuario.rol,
    accion
  })
}

// GET /api/actividad — solo propietario, últimas acciones del encargado
router.get('/', auth, async (req, res) => {
  if (req.usuario.rol !== 'propietario') {
    return res.status(403).json({ error: 'Solo el propietario puede ver la actividad' })
  }

  const supabase = getSupabase()
  const limite = Math.min(parseInt(req.query.limite) || 30, 100)

  const { data, error } = await supabase
    .from('actividad')
    .select('id, rol, accion, creado_en, usuarios ( nombre )')
    .order('creado_en', { ascending: false })
    .limit(limite)

  if (error) return res.status(500).json({ error: error.message })
  res.json({ actividad: data })
})

module.exports = { router, registrarActividad }
