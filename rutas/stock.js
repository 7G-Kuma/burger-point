// Calcula cuántas unidades de cada producto se pueden preparar todavía,
// según el insumo más escaso de su receta (producto_insumos).
// Devuelve un mapa { producto_id: unidadesDisponibles }. Un producto sin
// receta cargada no aparece en el mapa (sin control de stock para ese caso).
async function obtenerDisponibilidad(supabase, productoIds = null) {
  let query = supabase
    .from('producto_insumos')
    .select('producto_id, cantidad_usada, insumos ( cantidad_actual )')

  if (productoIds) query = query.in('producto_id', productoIds)

  const { data: recetas, error } = await query
  if (error) throw error

  const itemsPorProducto = {}
  for (const r of recetas || []) {
    if (!r.insumos) continue
    if (!itemsPorProducto[r.producto_id]) itemsPorProducto[r.producto_id] = []
    itemsPorProducto[r.producto_id].push(r)
  }

  const disponibilidad = {}
  for (const [productoId, items] of Object.entries(itemsPorProducto)) {
    disponibilidad[productoId] = Math.min(
      ...items.map(i => Math.floor(Number(i.insumos.cantidad_actual) / Number(i.cantidad_usada)))
    )
  }
  return disponibilidad
}

module.exports = { obtenerDisponibilidad }
