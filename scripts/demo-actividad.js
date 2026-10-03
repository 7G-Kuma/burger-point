// Uso: node scripts/demo-actividad.js   (con el servidor local corriendo en :3000)
// OJO: escribe en la base a la que apunte el .env — hoy es la de producción/demo.
// Crea actividad "de hoy" por la API real (mismo flujo que usa el sistema),
// con clientes ficticios, para poder sacar capturas con pantallas vivas.
const fs = require('fs')
const path = require('path')
const BASE = process.env.BASE_URL || 'http://localhost:3000'
const out = process.argv[2] || path.join(__dirname, '.salida')
fs.mkdirSync(out, { recursive: true })

const cred = fs.readFileSync(path.join(__dirname, '..', 'CREDENCIALES.md'), 'utf8')
const password = cred.match(/admin@burgerpoint\.com \| (\S+)/)[1]

async function j(url, opts = {}) {
  const res = await fetch(BASE + url, opts)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} -> ${res.status} ${JSON.stringify(data)}`)
  return data
}

;(async () => {
  const login = await j('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@burgerpoint.com', password })
  })
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.token }
  fs.writeFileSync(path.join(out, 'token.json'), JSON.stringify({ token: login.token, usuario: login.usuario, permisos: login.permisos || {} }))

  const { productos } = await j('/api/menu')
  const P = n => {
    const p = productos.find(x => x.nombre === n)
    if (!p) throw new Error('No existe el producto: ' + n)
    return p
  }
  const extra = (prod, nombre) => prod.extras.find(e => e.nombre.toLowerCase().includes(nombre))?.id

  const bacon = P('Bacon Cheese'), clasica = P('Clásica'), doble = P('Doble Smash')
  const pClas = P('Papas Clásicas'), pCheddar = P('Papas Cheddar & Bacon')
  const coca = P('Coca-Cola 500ml'), fanta = P('Fanta 500ml'), sprite = P('Sprite 500ml'), pepsi = P('Pepsi 500ml'), agua = P('Agua')

  const x = (prod, cantidad = 1, extras = []) => ({ producto_id: prod.id, cantidad, extra_ids: extras.filter(Boolean) })

  // estado final deseado por pedido
  const plan = [
    { c: ['Lucía Fernández', '1155550101'], t: 'retiro', items: [x(bacon, 1, [extra(bacon, 'bacon')]), x(pClas), x(coca)], fin: 'recibido' },
    { c: ['Martín Gómez', '1155550102', 'Av. Rivadavia 4521, CABA'], t: 'delivery', items: [x(clasica, 2), x(fanta)], fin: 'recibido' },
    { c: ['Camila Rossi', '1155550103'], t: 'retiro', items: [x(doble), x(pCheddar), x(pepsi)], fin: 'confirmado', metodo: 'tarjeta' },
    { c: ['Joaquín Pérez', '1155550104', 'Honduras 3890, CABA'], t: 'delivery', items: [x(bacon, 2, [extra(bacon, 'queso')]), x(sprite, 2)], fin: 'en_preparacion', metodo: 'efectivo' },
    { c: ['Sofía Acosta', '1155550105'], t: 'retiro', items: [x(clasica), x(agua)], fin: 'en_preparacion', metodo: 'transferencia' },
    { c: ['Tomás Herrera', '1155550106', 'Güemes 2210, CABA'], t: 'delivery', items: [x(doble, 2), x(pClas)], fin: 'listo', metodo: 'efectivo' },
    { c: ['Valentina Ruiz', '1155550107'], t: 'retiro', items: [x(bacon), x(coca)], fin: 'entregado', metodo: 'tarjeta' },
    { c: ['Nicolás Silva', '1155550108', 'Scalabrini Ortiz 1650, CABA'], t: 'delivery', items: [x(clasica, 2), x(pCheddar)], fin: 'entregado', metodo: 'efectivo' }
  ]

  const ORDEN = ['recibido', 'confirmado', 'en_preparacion', 'listo', 'entregado']
  const creados = []

  for (const p of plan) {
    const r = await j('/api/menu/pedido', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tipo_entrega: p.t, cliente_nombre: p.c[0], cliente_telefono: p.c[1], cliente_direccion: p.c[2] || undefined,
        items: p.items
      })
    })
    const pedido = r.pedido || r
    const id = pedido.id || r.pedido_id
    const numero = pedido.numero_pedido || r.numero_pedido
    creados.push({ id, numero, fin: p.fin })

    if (p.fin !== 'recibido') {
      const det = await j(`/api/pedidos/${id}`, { headers: H })
      const total = det.pedido.pedido_items.reduce((s, i) => s + i.cantidad * Number(i.precio_unitario), 0)
      await j('/api/cobros', { method: 'POST', headers: H, body: JSON.stringify({ pedido_id: id, monto: total, metodo: p.metodo }) })
      for (const e of ORDEN.slice(1, ORDEN.indexOf(p.fin) + 1)) {
        await j(`/api/pedidos/${id}/estado`, { method: 'PATCH', headers: H, body: JSON.stringify({ estado: e }) })
      }
    }
    console.log('pedido', numero, '->', p.fin)
  }
  fs.writeFileSync(path.join(out, 'pedidos-demo.json'), JSON.stringify(creados, null, 2))
  console.log('OK', creados.length)
})().catch(e => { console.error('ERROR', e.message); process.exit(1) })
