const express  = require('express')
const bcrypt   = require('bcrypt')
const jwt      = require('jsonwebtoken')
const rateLimit = require('express-rate-limit')
const { getSupabase } = require('./db')

const router = express.Router()

// Máximo 10 intentos de login por IP cada 15 minutos — sin esto, nada impide
// probar contraseñas por fuerza bruta contra /api/auth/login.
const limitadorLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' }
})

// POST /api/auth/login
router.post('/login', limitadorLogin, async (req, res) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Email y contraseña requeridos' })
  }

  try {
    const supabase = getSupabase()

    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('email', email.toLowerCase())
      .eq('activo', true)
      .limit(1)

    // Mismo mensaje para "no existe" y "contraseña incorrecta" — a propósito,
    // para no dejarle a un atacante confirmar qué emails están dados de alta.
    const CREDENCIALES_INVALIDAS = { error: 'Email o contraseña incorrectos' }

    if (error || !usuarios || usuarios.length === 0) {
      return res.status(401).json(CREDENCIALES_INVALIDAS)
    }

    const usuario = usuarios[0]
    const ok = await bcrypt.compare(password, usuario.password_hash)

    if (!ok) {
      return res.status(401).json(CREDENCIALES_INVALIDAS)
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    // El encargado necesita saber qué secciones tiene habilitadas desde que entra
    let permisos = {}
    if (usuario.rol === 'encargado') {
      const { data: filas } = await supabase.from('permisos_encargado').select('seccion, permitido')
      filas?.forEach(p => { permisos[p.seccion] = p.permitido })
    }

    res.json({
      token,
      usuario: {
        id:     usuario.id,
        nombre: usuario.nombre,
        email:  usuario.email,
        rol:    usuario.rol
      },
      permisos
    })

  } catch (err) {
    console.error('Error completo:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

module.exports = router