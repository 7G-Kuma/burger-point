const express = require('express')
const jwt     = require('jsonwebtoken')
const { getSupabase } = require('./db')
const { obtenerDisponibilidad } = require('./stock')
const { registrarActividad } = require('./actividad')
const { requireSeccion } = require('./requireSeccion')
const { aplicarPromociones } = require('./promociones')

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

// GET /api/productos
router.get('/', auth, async (req, res) => {
  const supabase = getSupabase()
  const soloActivos = req.query.todos !== 'true'
  let query = supabase.from('productos').select('*').order('nombre')
  if (soloActivos) query = query.eq('activo', true)
  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })

  const disponibilidad = await obtenerDisponibilidad(supabase)
  const conPromos = await aplicarPromociones(supabase, data)
  const productos = conPromos.map(p => ({
    ...p,
    // null = sin receta de insumos cargada, no se controla el stock de ese producto
    disponible: disponibilidad[p.id] ?? null
  }))

  res.json({ productos })
})

// POST /api/productos — agregar producto al menú
router.post('/', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { nombre, precio, descripcion, categoria } = req.body
  if (!nombre || !precio) return res.status(400).json({ error: 'Nombre y precio requeridos' })
  const { data, error } = await supabase
    .from('productos')
    .insert({ nombre, precio, descripcion: descripcion || null, categoria: categoria || 'Otros' })
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Agregó el producto "${data.nombre}" al menú`)

  res.json({ ok: true, producto: data })
})

// PATCH /api/productos/:id — editar precio, nombre, descripción o disponibilidad en el menú
router.patch('/:id', auth, requireSeccion('productos'), async (req, res) => {
  const supabase = getSupabase()
  const { nombre, precio, descripcion, activo, categoria } = req.body

  const cambios = {}
  if (nombre !== undefined) cambios.nombre = nombre
  if (precio !== undefined) {
    if (Number(precio) <= 0) return res.status(400).json({ error: 'El precio tiene que ser mayor a cero' })
    cambios.precio = precio
  }
  if (descripcion !== undefined) cambios.descripcion = descripcion
  if (activo !== undefined) cambios.activo = activo
  if (categoria !== undefined) cambios.categoria = categoria

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se envió ningún cambio' })
  }

  const { data: anterior } = await supabase.from('productos').select('nombre, precio').eq('id', req.params.id).single()

  const { data, error } = await supabase
    .from('productos')
    .update(cambios)
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })

  if (precio !== undefined && anterior && Number(anterior.precio) !== Number(precio)) {
    await registrarActividad(supabase, req.usuario, `Cambió el precio de "${anterior.nombre}" de $${Number(anterior.precio).toLocaleString('es-AR')} a $${Number(precio).toLocaleString('es-AR')}`)
  } else if (activo !== undefined) {
    await registrarActividad(supabase, req.usuario, `${activo ? 'Reactivó' : 'Ocultó'} el producto "${data.nombre}" del menú`)
  } else {
    await registrarActividad(supabase, req.usuario, `Editó el producto "${data.nombre}"`)
  }

  res.json({ ok: true, producto: data })
})

module.exports = router