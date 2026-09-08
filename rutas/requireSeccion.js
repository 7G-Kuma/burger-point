const { getSupabase } = require('./db')

// Middleware factory: el propietario siempre pasa. El encargado pasa solo si
// el propietario le habilitó esa sección en permisos_encargado. Cualquier
// otro rol queda afuera (estas rutas son de administración).
function requireSeccion(seccion) {
  return async (req, res, next) => {
    if (req.usuario.rol === 'propietario') return next()

    if (req.usuario.rol === 'encargado') {
      const supabase = getSupabase()
      const { data } = await supabase
        .from('permisos_encargado')
        .select('permitido')
        .eq('seccion', seccion)
        .single()

      if (data?.permitido) return next()
      return res.status(403).json({ error: 'No tenés acceso a esta sección' })
    }

    return res.status(403).json({ error: 'No tenés permiso para ver esto' })
  }
}

module.exports = { requireSeccion }
