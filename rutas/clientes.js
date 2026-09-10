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

// Crea o actualiza el cliente por teléfono y le engancha el pedido. Se llama
// desde rutas/menu.js en cada pedido online, exista o no un "perfil" explícito
// — así el registro de clientes se arma solo, sin depender de que alguien use
// el login del menú. Devuelve el id del cliente para guardarlo en el pedido.
async function upsertCliente(supabase, { telefono, nombre, fecha_nacimiento }) {
  const { data: existente } = await supabase.from('clientes').select('id, fecha_nacimiento').eq('telefono', telefono).single()

  if (existente) {
    const cambios = { nombre, ultima_visita: new Date().toISOString() }
    if (fecha_nacimiento && !existente.fecha_nacimiento) cambios.fecha_nacimiento = fecha_nacimiento
    await supabase.from('clientes').update(cambios).eq('id', existente.id)
    return existente.id
  }

  const { data: nuevo } = await supabase
    .from('clientes')
    .insert({ telefono, nombre, fecha_nacimiento: fecha_nacimiento || null })
    .select('id')
    .single()
  return nuevo?.id || null
}

// GET /api/clientes/buscar?telefono=... — PÚBLICO, para que el menú digital
// reconozca a un cliente que vuelve (no expone nada más que su nombre y si
// tiene cumpleaños cargado)
router.get('/buscar', async (req, res) => {
  const telefono = req.query.telefono?.trim()
  if (!telefono) return res.status(400).json({ error: 'Falta el teléfono' })

  const supabase = getSupabase()
  const { data } = await supabase
    .from('clientes')
    .select('nombre, fecha_nacimiento')
    .eq('telefono', telefono)
    .single()

  res.json({ existe: !!data, nombre: data?.nombre || null, fecha_nacimiento: data?.fecha_nacimiento || null })
})

// POST /api/clientes — PÚBLICO, crea el perfil del cliente desde el menú digital
router.post('/', async (req, res) => {
  const { telefono, nombre, fecha_nacimiento } = req.body
  if (!telefono?.trim() || !nombre?.trim()) {
    return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' })
  }

  const supabase = getSupabase()
  const { data: existente } = await supabase.from('clientes').select('id').eq('telefono', telefono.trim()).single()
  if (existente) {
    return res.status(400).json({ error: 'Ya existe un perfil con ese teléfono' })
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({ telefono: telefono.trim(), nombre: nombre.trim(), fecha_nacimiento: fecha_nacimiento || null })
    .select()
    .single()

  if (error) return res.status(500).json({ error: error.message })
  res.json({ ok: true, cliente: data })
})

// GET /api/clientes — panel del propietario/encargado: lista con pedidos y gastado
router.get('/', auth, requireSeccion('clientes'), async (req, res) => {
  const supabase = getSupabase()

  const { data: clientes, error } = await supabase
    .from('clientes')
    .select('id, nombre, telefono, fecha_nacimiento, creado_en, ultima_visita')
    .order('ultima_visita', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })

  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('cliente_id, estado, pedido_items ( cantidad, precio_unitario )')
    .not('cliente_id', 'is', null)

  const statsPorCliente = {}
  pedidos?.forEach(p => {
    if (p.estado === 'cancelado') return
    if (!statsPorCliente[p.cliente_id]) statsPorCliente[p.cliente_id] = { pedidos: 0, gastado: 0 }
    statsPorCliente[p.cliente_id].pedidos += 1
    statsPorCliente[p.cliente_id].gastado += p.pedido_items?.reduce((s, i) => s + i.cantidad * Number(i.precio_unitario), 0) || 0
  })

  const clientesConStats = clientes.map(c => ({
    ...c,
    pedidos: statsPorCliente[c.id]?.pedidos || 0,
    gastado: statsPorCliente[c.id]?.gastado || 0
  }))

  res.json({ clientes: clientesConStats })
})

// PATCH /api/clientes/:id — corregir nombre o fecha de nacimiento a mano
router.patch('/:id', auth, requireSeccion('clientes'), async (req, res) => {
  const supabase = getSupabase()
  const { nombre, fecha_nacimiento } = req.body

  const cambios = {}
  if (nombre !== undefined) cambios.nombre = nombre.trim()
  if (fecha_nacimiento !== undefined) cambios.fecha_nacimiento = fecha_nacimiento || null

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se envió ningún cambio' })
  }

  const { data, error } = await supabase.from('clientes').update(cambios).eq('id', req.params.id).select().single()
  if (error) return res.status(500).json({ error: error.message })

  await registrarActividad(supabase, req.usuario, `Editó el perfil del cliente "${data.nombre}"`)

  res.json({ ok: true, cliente: data })
})

module.exports = { router, upsertCliente }
