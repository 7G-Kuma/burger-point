const express  = require('express')
const bcrypt   = require('bcrypt')
const jwt      = require('jsonwebtoken')
const { getSupabase } = require('./db')

const router = express.Router()

// POST /api/auth/login
router.post('/login', async (req, res) => {
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

    if (error || !usuarios || usuarios.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' })
    }

    const usuario = usuarios[0]
    const ok = await bcrypt.compare(password, usuario.password_hash)

    if (!ok) {
      return res.status(401).json({ error: 'Contraseña incorrecta' })
    }

    const token = jwt.sign(
      { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({
      token,
      usuario: {
        id:     usuario.id,
        nombre: usuario.nombre,
        email:  usuario.email,
        rol:    usuario.rol
      }
    })

  } catch (err) {
    console.error('Error completo:', err)
    res.status(500).json({ error: 'Error interno del servidor' })
  }
})

module.exports = router