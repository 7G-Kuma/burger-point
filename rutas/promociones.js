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

// Suma a cada producto su precio con descuento si tiene una promoción activa
// (activa = habilitada y dentro de fecha_inicio/fecha_fin, si tienen). Si un
// producto queda alcanzado por más de una promo activa, se aplica la de mayor
// porcentaje. `productos` necesita al menos { id, precio }.
async function aplicarPromociones(supabase, productos) {
  if (!productos || productos.length === 0) return productos

  const ahora = new Date().toISOString()
  const { data: promos } = await supabase
    .from('promociones')
    .select('id, nombre, porcentaje, promocion_productos ( producto_id )')
    .eq('activo', true)
    .or(`fecha_inicio.is.null,fecha_inicio.lte.${ahora}`)
    .or(`fecha_fin.is.null,fecha_fin.gte.${ahora}`)

  const mejorPorProducto = {}
  promos?.forEach(promo => {
    promo.promocion_productos?.forEach(({ producto_id }) => {
      const actual = mejorPorProducto[producto_id]
      if (!actual || promo.porcentaje > actual.porcentaje) {
        mejorPorProducto[producto_id] = { porcentaje: promo.porcentaje, nombre: promo.nombre }
      }
    })
  })

  return productos.map(p => {
    const promo = mejorPorProducto[p.id]
    if (!promo) return { ...p, precio_final: p.precio, descuento_porcentaje: null, promocion_nombre: null }
    const precio_final = Math.round(Number(p.precio) * (1 - promo.porcentaje / 100))
    return { ...p, precio_final, descuento_porcentaje: promo.porcentaje, promocion_nombre: promo.nombre }
  })
}

// GET /api/promociones — todas las promos (activas e inactivas), con los productos que alcanzan
router.get('/', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('promociones')
    .select('id, nombre, porcentaje, activo, fecha_inicio, fecha_fin, creado_en, promocion_productos ( producto_id, productos ( nombre ) )')
    .order('creado_en', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  res.json({ promociones: data })
})

// POST /api/promociones — crea una promo y la asocia a uno o más productos
router.post('/', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { nombre, porcentaje, producto_ids, fecha_inicio, fecha_fin } = req.body

  if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' })
  if (!porcentaje || porcentaje <= 0 || porcentaje > 100) {
    return res.status(400).json({ error: 'El porcentaje tiene que estar entre 1 y 100' })
  }
  if (!producto_ids || producto_ids.length === 0) {
    return res.status(400).json({ error: 'Elegí al menos un producto para la promoción' })
  }

  const { data: promo, error: errorPromo } = await supabase
    .from('promociones')
    .insert({
      nombre: nombre.trim(),
      porcentaje,
      fecha_inicio: fecha_inicio || null,
      fecha_fin: fecha_fin || null
    })
    .select()
    .single()

  if (errorPromo) return res.status(500).json({ error: errorPromo.message })

  const filas = producto_ids.map(producto_id => ({ promocion_id: promo.id, producto_id }))
  const { error: errorRel } = await supabase.from('promocion_productos').insert(filas)
  if (errorRel) return res.status(500).json({ error: errorRel.message })

  await registrarActividad(supabase, req.usuario, `Creó la promoción "${promo.nombre}" (-${promo.porcentaje}%)`)

  res.json({ ok: true, promocion: promo })
})

// PATCH /api/promociones/:id — editar (activo, nombre, porcentaje, fechas, productos)
router.patch('/:id', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { nombre, porcentaje, producto_ids, fecha_inicio, fecha_fin, activo } = req.body

  const cambios = {}
  if (nombre !== undefined) cambios.nombre = nombre.trim()
  if (porcentaje !== undefined) cambios.porcentaje = porcentaje
  if (fecha_inicio !== undefined) cambios.fecha_inicio = fecha_inicio || null
  if (fecha_fin !== undefined) cambios.fecha_fin = fecha_fin || null
  if (activo !== undefined) cambios.activo = activo

  if (Object.keys(cambios).length > 0) {
    const { error } = await supabase.from('promociones').update(cambios).eq('id', req.params.id)
    if (error) return res.status(500).json({ error: error.message })
  }

  if (producto_ids) {
    await supabase.from('promocion_productos').delete().eq('promocion_id', req.params.id)
    const filas = producto_ids.map(producto_id => ({ promocion_id: req.params.id, producto_id }))
    const { error: errorRel } = await supabase.from('promocion_productos').insert(filas)
    if (errorRel) return res.status(500).json({ error: errorRel.message })
  }

  const { data: promo } = await supabase.from('promociones').select('nombre').eq('id', req.params.id).single()
  if (activo !== undefined) {
    await registrarActividad(supabase, req.usuario, `${activo ? 'Activó' : 'Desactivó'} la promoción "${promo?.nombre}"`)
  } else {
    await registrarActividad(supabase, req.usuario, `Editó la promoción "${promo?.nombre}"`)
  }

  res.json({ ok: true })
})

// DELETE /api/promociones/:id
router.delete('/:id', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { data: promo } = await supabase.from('promociones').select('nombre').eq('id', req.params.id).single()

  const { error } = await supabase.from('promociones').delete().eq('id', req.params.id)
  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Eliminó la promoción "${promo?.nombre}"`)

  res.json({ ok: true })
})

module.exports = { router, aplicarPromociones }
