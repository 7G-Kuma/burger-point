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

// Cierra sesión
function cerrarSesion() {
  localStorage.removeItem('bp_token')
  localStorage.removeItem('bp_usuario')
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

// Protege páginas — redirige al login si no hay sesión
function requireAuth(rolesPermitidos = []) {
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
  return true
}