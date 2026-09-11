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

  // Operativas quedan siempre a la vista; el resto (back-office) se agrupa en
  // un desplegable "Gestión" para que el navbar no se llene de links a medida
  // que se suman secciones nuevas
  const operativas = [
    { href: '/panel.html',   icono: '📊', label: 'Panel',   seccion: 'panel' },
    { href: '/caja.html',    icono: '🛒', label: 'Caja',    seccion: 'caja' },
    { href: '/cocina.html',  icono: '🔥', label: 'Cocina',  seccion: 'cocina' },
    { href: '/reparto.html', icono: '🛵', label: 'Reparto', seccion: 'reparto' }
  ].filter(v => usuario.rol === 'propietario' || tienePermiso(v.seccion))

  const gestion = [
    { href: '/inventario.html', icono: '📦', label: 'Inventario', seccion: 'inventario' },
    { href: '/registro.html',   icono: '🧾', label: 'Registro',   seccion: 'registro' },
    { href: '/productos.html',  icono: '💲', label: 'Precios',    seccion: 'productos' },
    { href: '/clientes.html',   icono: '👥', label: 'Clientes',   seccion: 'clientes' },
    { href: '/reportes.html',   icono: '📈', label: 'Reportes',   seccion: 'reportes' }
  ].filter(v => usuario.rol === 'propietario' || tienePermiso(v.seccion))

  if (usuario.rol === 'propietario') {
    gestion.push({ href: '/permisos.html', icono: '🔐', label: 'Permisos' })
  }

  const actual = location.pathname
  const enlace = v => `<a href="${v.href}" class="nav-switch-link ${actual === v.href ? 'active' : ''}">${v.icono} ${v.label}</a>`

  const gestionActiva = gestion.some(v => v.href === actual)
  const menuGestion = gestion.length === 0 ? '' : `
    <div class="nav-dropdown" id="nav-gestion">
      <button type="button" class="nav-dropdown-trigger ${gestionActiva ? 'active' : ''}" onclick="toggleNavGestion(event)">⚙️ Gestión ▾</button>
      <div class="nav-dropdown-menu" id="nav-gestion-menu">
        <div class="nav-dropdown-label">Gestión</div>
        ${gestion.map(enlace).join('')}
      </div>
    </div>`

  cont.innerHTML = `
    <button class="nav-toggle" id="nav-toggle" onclick="toggleNavMenu()" aria-label="Menú">☰</button>
    <div class="nav-links" id="nav-links">${operativas.map(enlace).join('')}${menuGestion}</div>
  `

  document.addEventListener('click', e => {
    const panel = document.getElementById('nav-links')
    const toggle = document.getElementById('nav-toggle')
    if (!panel?.classList.contains('abierto')) return
    if (panel.contains(e.target) || toggle?.contains(e.target)) return
    panel.classList.remove('abierto')
  })

  document.addEventListener('click', e => {
    const menu = document.getElementById('nav-gestion-menu')
    const dropdown = document.getElementById('nav-gestion')
    if (!menu?.classList.contains('abierto')) return
    if (dropdown?.contains(e.target)) return
    menu.classList.remove('abierto')
  })
}

// Abre/cierra el desplegable "Gestión" del navbar (Inventario/Registro/Precios/etc.)
function toggleNavGestion(e) {
  e.stopPropagation()
  document.getElementById('nav-gestion-menu')?.classList.toggle('abierto')
}

// ── REPORTAR INCIDENCIA (compartido entre caja/cocina/reparto) ──
// Se inyecta en el DOM la primera vez que se usa, así ninguna página
// necesita el HTML del modal de antemano — solo llamar a esta función.
let _incidenciaPedidoId = null

function abrirModalIncidencia(pedidoId, numeroPedido) {
  let modal = document.getElementById('modal-incidencia-global')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'modal-incidencia-global'
    modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:300;align-items:center;justify-content:center;padding:20px;'
    modal.innerHTML = `
      <div class="card" style="width:100%;max-width:360px;">
        <div class="card-header">
          <h3>Reportar incidencia</h3>
          <button onclick="cerrarModalIncidencia()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;">✕</button>
        </div>
        <p id="incidencia-modal-pedido" style="margin-bottom:12px;"></p>
        <div class="input-group">
          <label>Tipo</label>
          <select id="incidencia-tipo">
            <option value="error_cocina">Error de cocina</option>
            <option value="entrega_fallida">Entrega fallida</option>
            <option value="stock_faltante">Falta de stock</option>
            <option value="queja_cliente">Queja del cliente</option>
            <option value="cancelacion">Cancelación</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div class="input-group mt-8">
          <label>Qué pasó</label>
          <input type="text" id="incidencia-descripcion" placeholder="Describilo brevemente">
        </div>
        <button class="btn btn-primary btn-full mt-16" onclick="confirmarIncidencia()">Registrar</button>
      </div>`
    document.body.appendChild(modal)
  }
  _incidenciaPedidoId = pedidoId
  document.getElementById('incidencia-modal-pedido').textContent = numeroPedido ? `Pedido #${numeroPedido}` : 'Sin pedido asociado'
  document.getElementById('incidencia-tipo').value = 'error_cocina'
  document.getElementById('incidencia-descripcion').value = ''
  modal.style.display = 'flex'
}

function cerrarModalIncidencia() {
  const modal = document.getElementById('modal-incidencia-global')
  if (modal) modal.style.display = 'none'
}

async function confirmarIncidencia() {
  const tipo = document.getElementById('incidencia-tipo').value
  const descripcion = document.getElementById('incidencia-descripcion').value.trim()
  if (!descripcion) { toast('Describí qué pasó', 'warning'); return }

  const data = await api('/api/incidencias', {
    method: 'POST',
    body: JSON.stringify({ pedido_id: _incidenciaPedidoId, tipo, descripcion })
  })

  if (data?.ok) {
    toast('Incidencia registrada ✓', 'ok')
    cerrarModalIncidencia()
  } else {
    toast(data?.error || 'Error al registrar la incidencia', 'danger')
  }
}

// Abre/cierra el menú de navegación colapsado en pantallas chicas
function toggleNavMenu() {
  document.getElementById('nav-links')?.classList.toggle('abierto')
}