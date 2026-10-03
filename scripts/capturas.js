// Uso: node scripts/capturas.js [carpeta] [filtro-regex]   (después de demo-actividad.js)
// Saca capturas nítidas de la app controlando Edge headless por CDP (sin librerías).
const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

const BASE = process.env.BASE_URL || 'http://localhost:3000'
const DIR = process.argv[2] || path.join(__dirname, '.salida')
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PORT = 9333
const sleep = ms => new Promise(r => setTimeout(r, ms))

const SOLO = process.argv[3] ? new RegExp(process.argv[3]) : null
const sesion = JSON.parse(fs.readFileSync(DIR + '/token.json', 'utf8'))
const pedidos = JSON.parse(fs.readFileSync(DIR + '/pedidos-demo.json', 'utf8'))
const nroListo = pedidos.find(p => p.fin === 'listo').numero

const MOVIL = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }
const ESCRITORIO = { width: 1440, height: 900, deviceScaleFactor: 1.5, mobile: false }

// { archivo, vista, url, espera, js (se ejecuta después de cargar) }
const SHOTS = [
  { f: 'movil-01-menu-inicio', v: MOVIL, u: '/', espera: 3500 },
  { f: 'movil-02-menu-productos', v: MOVIL, u: '/', espera: 3500, js: 'window.scrollTo(0, 470)' },
  { f: 'movil-03-menu-personalizar', v: MOVIL, u: '/', espera: 3500,
    js: `const b = productos.find(p => p.nombre === 'Bacon Cheese'); agregarAlCarrito(b.id)` },
  { f: 'movil-04-menu-pedido', v: MOVIL, u: '/', espera: 3500,
    js: `['Papas Clásicas','Agua'].forEach(n => agregarAlCarrito(productos.find(p => p.nombre === n).id));
         document.getElementById('card-pedido').scrollIntoView({block:'start'}); window.scrollBy(0,-12)` },
  { f: 'movil-05-seguimiento', v: MOVIL, u: `/seguimiento.html?numero=${nroListo}`, espera: 3500 },
  { f: 'movil-06-caja-pedidos', v: MOVIL, u: '/caja.html', auth: true, espera: 4000,
    js: `document.getElementById('pedidos-lista').scrollIntoView({block:'start'}); window.scrollBy(0,-90)` },
  { f: 'movil-07-cocina', v: MOVIL, u: '/cocina.html', auth: true, espera: 3500 },
  { f: 'movil-08-reparto', v: MOVIL, u: '/reparto.html', auth: true, espera: 3500 },
  { f: 'movil-09-panel', v: MOVIL, u: '/panel.html', auth: true, espera: 4000 },
  { f: 'escritorio-01-panel', v: ESCRITORIO, u: '/panel.html', auth: true, espera: 4500 },
  { f: 'escritorio-02-caja', v: ESCRITORIO, u: '/caja.html', auth: true, espera: 4500 },
  { f: 'escritorio-03-cocina', v: ESCRITORIO, u: '/cocina.html', auth: true, espera: 4000 },
  { f: 'escritorio-04-reparto', v: ESCRITORIO, u: '/reparto.html', auth: true, espera: 4000 },
  { f: 'escritorio-05-reportes', v: ESCRITORIO, u: '/reportes.html', auth: true, espera: 5000,
    js: `document.getElementById('f-desde').value='2026-09-02'; document.getElementById('f-hasta').value='2026-09-11'; cargarReportes();` , tras: 3500 },
  { f: 'escritorio-06-inventario', v: ESCRITORIO, u: '/inventario.html', auth: true, espera: 4000 },
  { f: 'escritorio-07-clientes', v: ESCRITORIO, u: '/clientes.html', auth: true, espera: 4000 },
  { f: 'escritorio-08-registro', v: ESCRITORIO, u: '/registro.html', auth: true, espera: 4500 },
  { f: 'escritorio-09-configuracion', v: ESCRITORIO, u: '/configuracion.html', auth: true, espera: 4000 },
  { f: 'escritorio-10-menu', v: ESCRITORIO, u: '/', espera: 3500, js: 'window.scrollTo(0, 380)' }
]

;(async () => {
  const perfil = DIR + '/perfil-edge'
  const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
    '--remote-allow-origins=*', `--user-data-dir=${perfil}`, 'about:blank'
  ], { stdio: 'ignore' })

  let targets
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break } catch {}
    await sleep(500)
  }
  const pagina = targets.find(t => t.type === 'page')
  const ws = new WebSocket(pagina.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))

  let nextId = 1
  const pendientes = new Map()
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data)
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id)(m); pendientes.delete(m.id) }
  })
  const send = (method, params = {}) => new Promise(res => {
    const id = nextId++
    pendientes.set(id, res)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evalJS = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true })).result

  await send('Page.enable')

  // sesión de staff en localStorage del origen de la app
  await send('Page.navigate', { url: BASE + '/favicon.ico' })
  await sleep(1200)
  await evalJS(`localStorage.setItem('bp_token', ${JSON.stringify(sesion.token)});
    localStorage.setItem('bp_usuario', ${JSON.stringify(JSON.stringify(sesion.usuario))});
    localStorage.setItem('bp_permisos', ${JSON.stringify(JSON.stringify(sesion.permisos))})`)

  for (const s of SHOTS.filter(x => !SOLO || SOLO.test(x.f))) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: s.v.width, height: s.v.height, deviceScaleFactor: s.v.deviceScaleFactor, mobile: s.v.mobile
    })
    await send('Page.navigate', { url: BASE + s.u })
    await sleep(s.espera)
    if (s.js) { const r = await evalJS(s.js); if (r.exceptionDetails) console.log('  js error en', s.f, r.exceptionDetails.text) ; await sleep(s.tras || 900) }
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    fs.writeFileSync(`${DIR}/${s.f}.png`, Buffer.from(shot.result.data, 'base64'))
    console.log('ok', s.f)
  }

  ws.close()
  edge.kill()
})().catch(e => { console.error('ERROR', e); process.exit(1) })
