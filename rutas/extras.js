const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')
const { requireSeccion } = require('./requireSeccion')
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

// GET /api/extras — todos los extras (activos e inactivos), con los productos que los ofrecen
router.get('/', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('extras')
    .select('id, nombre, precio, activo, creado_en, producto_extras ( producto_id, productos ( nombre ) )')
    .order('creado_en', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ extras: data })
})

// POST /api/extras — crea un extra y lo asocia a uno o más productos
router.post('/', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { nombre, precio, producto_ids } = req.body

  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (precio === undefined || Number(precio) < 0) {
    return res.status(400).json({ error: 'El precio no puede ser negativo (0 = gratis)' })
  }
  if (!producto_ids || producto_ids.length === 0) {
    return res.status(400).json({ error: 'Elegí al menos un producto para este extra' })
  }

  const { data: extra, error: errorExtra } = await supabase
    .from('extras')
    .insert({ nombre: nombre.trim(), precio })
    .select()
    .single()

  if (errorExtra) return res.status(500).json({ error: errorExtra.message })

  const filas = producto_ids.map(producto_id => ({ producto_id, extra_id: extra.id }))
  const { error: errorRel } = await supabase.from('producto_extras').insert(filas)
  if (errorRel) return res.status(500).json({ error: errorRel.message })

  await registrarActividad(supabase, req.usuario, `Creó el extra "${extra.nombre}" (${extra.precio > 0 ? '$' + Number(extra.precio).toLocaleString('es-AR') : 'gratis'})`)

  res.json({ ok: true, extra })
})

// PATCH /api/extras/:id — editar nombre, precio, activo y/o los productos asociados
router.patch('/:id', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { nombre, precio, activo, producto_ids } = req.body

  const cambios = {}
  if (nombre !== undefined) cambios.nombre = nombre.trim()
  if (precio !== undefined) cambios.precio = precio
  if (activo !== undefined) cambios.activo = activo

  if (Object.keys(cambios).length > 0) {
    const { error } = await supabase.from('extras').update(cambios).eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
  }

  if (producto_ids) {
    await supabase.from('producto_extras').delete().eq('extra_id', req.params.id)
    const filas = producto_ids.map(producto_id => ({ producto_id, extra_id: req.params.id }))
    const { error: errorRel } = await supabase.from('producto_extras').insert(filas)
    if (errorRel) return res.status(500).json({ error: errorRel.message })
  }

  const { data: extra } = await supabase.from('extras').select('nombre').eq('id', req.params.id).single()
  await registrarActividad(supabase, req.usuario, `Editó el extra "${extra?.nombre}"`)

  res.json({ ok: true })
})

// DELETE /api/extras/:id
router.delete('/:id', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { data: extra } = await supabase.from('extras').select('nombre').eq('id', req.params.id).single()

  const { error } = await supabase.from('extras').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Eliminó el extra "${extra?.nombre}"`)

  res.json({ ok: true })
})

module.exports = router
