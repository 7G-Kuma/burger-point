// ── HELPERS GLOBALES ── //

// Muestra un toast (notificación emergente)
function toast(mensaje, tipo = 'ok') {
  const t = document.getElementById('toast')
  if (!t) return
  t.textContent = mensaje
  t.className = `show ${tipo}`
  setTimeout(() => { t.className = '' }, 3500)
}

// Obtiene el token guardado
function getToken() {
  return localStorage.getItem('bp_token')
}

// Obtiene el usuario actual
function getUsuario() {
  const u = localStorage.getItem('bp_usuario')
  return u ? JSON.parse(u) : null
}

// Obtiene el mapa de permisos del encargado guardado al loguearse ({ seccion: true/false })
function getPermisos() {
  const p = localStorage.getItem('bp_permisos')
  return p ? JSON.parse(p) : {}
}

// ¿Puede el usuario actual acceder a esta sección? Propietario siempre puede.
// Para el encargado depende de permisos_encargado (ausente = permitido, por compatibilidad).
function tienePermiso(seccion) {
  const usuario = getUsuario()
  if (!usuario) return false
  if (usuario.rol === 'propietario') return true
  if (usuario.rol !== 'encargado') return true // otros roles no se rigen por esta tabla
  const permisos = getPermisos()
  return permisos[seccion] !== false
}

// Cierra sesión
function cerrarSesion() {
  localStorage.removeItem('bp_token')
  localStorage.removeItem('bp_usuario')
  localStorage.removeItem('bp_permisos')
  window.location.href = '/index.html'
}

// Llama a la API con autenticación automática
async function api(ruta, opciones = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...opciones.headers
  }
  const res = await fetch(ruta, { ...opciones, headers })
  if (res.status === 401) {
    cerrarSesion()
    return
  }
  return res.json()
}

// Formatea fecha a texto legible
function formatFecha(fecha) {
  return new Date(fecha).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

// Genera el badge HTML según el estado del pedido
function badgeEstado(estado) {
  const labels = {
    recibido: 'Recibido',
    confirmado: 'Confirmado',
    en_preparacion: 'En preparación',
    listo: 'Listo ✓',
    entregado: 'Entregado',
    cancelado: 'Cancelado'
  }
  return `<span class="badge badge-${estado}">${labels[estado] || estado}</span>`
}

// Protege páginas — redirige al login si no hay sesión.
// `seccion` es opcional: si se pasa, además de tener el rol correcto, un
// encargado necesita que el propietario le haya habilitado esa sección.
function requireAuth(rolesPermitidos = [], seccion = null) {
  const token = getToken()
  const usuario = getUsuario()
  if (!token || !usuario) {
    window.location.href = '/index.html'
    return false
  }
  if (rolesPermitidos.length > 0 && !rolesPermitidos.includes(usuario.rol)) {
    window.location.href = '/index.html'
    return false
  }
  if (seccion && usuario.rol === 'encargado' && !tienePermiso(seccion)) {
    window.location.href = '/index.html'
    return false
  }
  return true
}

// Abre la factura en PDF de un pedido en una pestaña nueva.
// La pestaña se abre ANTES del await: si se abre después, el navegador
// la bloquea como popup porque ya se perdió el gesto del usuario.
async function verFactura(pedidoId) {
  const ventana = window.open('', '_blank')
  const token = getToken()
  const res = await fetch(`/api/pedidos/${pedidoId}/factura`, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  })
  if (!res.ok) {
    toast('No se pudo generar la factura', 'danger')
    ventana?.close()
    return
  }
  const blob = await res.blob()
  if (ventana) ventana.location.href = URL.createObjectURL(blob)
}

// Beep corto para alertar pedidos nuevos, sin depender de un archivo de audio
function sonarAlerta() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {}
}

// Pinta el selector de vistas para propietario/encargado (acceso a todos los perfiles)
function renderNavSwitcher() {
  const cont = document.getElementById('nav-switcher')
  const usuario = getUsuario()
  if (!cont || !usuario) return
  if (!['propietario', 'encargado'].includes(usuario.rol)) return

  const vistas = [
    { href: '/panel.html',      icono: '📊', label: 'Panel',      seccion: 'panel' },
    { href: '/caja.html',       icono: '🛒', label: 'Caja',       seccion: 'caja' },
    { href: '/cocina.html',     icono: '🔥', label: 'Cocina',     seccion: 'cocina' },
    { href: '/reparto.html',    icono: '🛵', label: 'Reparto',    seccion: 'reparto' },
    { href: '/inventario.html', icono: '📦', label: 'Inventario', seccion: 'inventario' },
    { href: '/registro.html',   icono: '🧾', label: 'Registro',   seccion: 'registro' },
    { href: '/productos.html',  icono: '💲', label: 'Precios',    seccion: 'productos' }
  ].filter(v => usuario.rol === 'propietario' || tienePermiso(v.seccion))

  if (usuario.rol === 'propietario') {
    vistas.push({ href: '/permisos.html', icono: '🔐', label: 'Permisos' })
  }

  const actual = location.pathname

  cont.innerHTML = vistas.map(v => `
    <a href="${v.href}" class="nav-switch-link ${actual === v.href ? 'active' : ''}">${v.icono} ${v.label}</a>
  `).join('')
}