# Burger Point — Sistema de Gestión

Analista/Desarrollador: Pedro. Stack: Node.js · Express 4 · Supabase (PostgreSQL, São Paulo, proyecto `wvarebdeatfdlmeojzvq`) · desplegado en Render (plan free, elegido para no generar costo antes de presentar el proyecto — Railway queda como opción paga para más adelante si se necesita 24/7 sin sleep).

**URL en producción**: https://burger-point-vtlu.onrender.com — se duerme tras 15 min sin tráfico, primer request siguiente tarda 30-60s en responder (comportamiento normal del plan free, no es un error).

## Estado general: Fase 1 a 6 completas y desplegadas

| # | Parte | Estado |
|---|-------|--------|
| 1 | Configuración inicial (Node, GitHub, Supabase, tablas) | ✅ Completada |
| 2 | Servidor base + Login (Express 4, JWT, roles) | ✅ Completada |
| 3 | Panel del propietario (estadísticas, alertas) | ✅ Completada |
| 4 | Módulo de Pedidos (caja, carrito, menú) | ✅ Completada |
| 5 | Vista de Cocina + Reparto | ✅ Completada — probada en circuito integral |
| 6 | Módulo de Cobros + Deploy | ✅ Completada — en producción en Render |

Probado en vivo el 2026-09-03: caja crea pedido → cobro por transferencia queda pendiente → cocina prepara y marca listo → reparto verifica la transferencia y marca entregado → panel refleja ventas/cobrado/alertas correctamente. Repetido con la `service_role` key activa y confirmado que el descuento de stock ahora funciona (`Queso azul` 2.00→1.00 y `Carne (medallón)` 80.00→79.00 al confirmar un Blue Cheese).

## Estructura

```
server.js            # carga .env si existe (Railway inyecta env vars directo, sin archivo .env), monta rutas, sirve public/
rutas/
  db.js              # cliente Supabase centralizado — prefiere SUPABASE_SERVICE_KEY, cae a SUPABASE_KEY
  stock.js           # calcula unidades disponibles por producto según el insumo más escaso de su receta
  auth.js            # POST /api/auth/login
  panel.js           # GET /api/panel/estadisticas + /alertas
  pedidos.js         # GET/POST/PATCH /api/pedidos (valida stock al crear, descuenta insumos al confirmar)
  productos.js       # GET/POST /api/productos (incluye `disponible` por producto)
  incidencias.js     # POST /api/incidencias (BR-04)
  cobros.js          # POST /api/cobros, PATCH /api/cobros/:id/verificar
  seguimiento.js     # GET /api/seguimiento/:numero — PÚBLICO, sin auth, para que el cliente consulte su pedido
  registro.js        # GET /api/registro — historial completo con filtros, solo propietario/encargado
public/
  img/logo.svg       # logo propio (badge circular con hamburguesa), usado como favicon en las 6 páginas
  index.html         # login — link a seguimiento.html para el cliente
  panel.html         # propietario/encargado
  caja.html          # caja/encargado — crea pedidos, muestra stock por producto (bloquea si no alcanza), cobra y genera boleta
  cocina.html        # cocina — temporizador, cambio de estado, registro de errores
  reparto.html       # reparto — entregas del turno, verificar transferencia pendiente
  seguimiento.html   # pública, sin login — el cliente ve el estado de su pedido por número
  registro.html      # propietario/encargado — historial completo, filtros, detalle y boleta de cada pedido
.claude/launch.json  # config para levantar el servidor desde el preview del editor
```

## Base de datos (Supabase, proyecto wvarebdeatfdlmeojzvq)

Tablas: `usuarios`, `productos`, `insumos`, `pedidos`, `pedido_items`, `cobros`, `incidencias`, `producto_insumos`. **RLS activado en las 8** (sin políticas — deniega anon/authenticated, `service_role` bypasea por diseño).

Usuarios de equipo ya creados: `admin@burgerpoint.com` (propietario), `caja@burgerpoint.com` (María), `cocina@burgerpoint.com` (Carola), `reparto@burgerpoint.com` (Juan).

## Deploy (Render)

Servicio `burger-point-vtlu` conectado directo al repo de GitHub (`7G-Kuma/burger-point`, rama `main`) — cada push a `main` redeploya solo. Build command `npm install`, start command `node server.js`, plan Free.

Variables de entorno cargadas en Render → pestaña Environment (independientes del `.env` local, no se sincronizan solas): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET`. Si se rota alguna en el futuro hay que actualizarla en los dos lugares.

Bug real encontrado y resuelto durante el primer deploy (2026-09-03): las variables no habían quedado cargadas en Render (`SUPABASE_URL: FALTA` en los logs) — el login tiraba 500 (`supabaseUrl is required`). Se resolvió cargándolas en la pestaña Environment del dashboard.

**Próximo paso, si se necesita 24/7 sin el sleep de 15 min** (por ejemplo después de presentar el proyecto): migrar a Railway u otro plan pago — el código ya es compatible tal cual (mismas env vars, respeta `process.env.PORT`).

## Stock visible en caja (2026-09-03)

`rutas/stock.js` calcula, para cada producto, `floor(insumo.cantidad_actual / cantidad_usada)` sobre cada insumo de su receta (`producto_insumos`) y toma el mínimo — ese es el cuello de botella real. `caja.html` muestra "Quedan N" / "Agotado" en cada botón, deshabilita el producto sin stock, tapea la cantidad que se puede sumar al carrito, y se refresca solo cada 15s y después de cada cobro (que es el momento real en que se descuenta insumos, ver `pedidos.js`). `POST /api/pedidos` valida el mismo cálculo server-side antes de crear el pedido, como segunda barrera.

Se cargaron recetas de prueba para `Agua` → `Agua (botella)` y `Gaseosa` → `Gaseosa (botella)` (antes no tenían insumo asociado, por eso no mostraban stock). Datos de stock actuales son los que ya había en la tabla `insumos` más algunos ajustados a mano para la demo: `Queso azul` bajo (Blue Cheese casi agotado) y `Aceite de trufa` en 0 (Papas Parmesano & Trufa agotada) — sirven para mostrar los tres estados (normal/bajo/agotado) al presentar.

**Importante sobre el momento del descuento**: el stock se descuenta cuando caja confirma el cobro (pedido pasa a `confirmado`), no cuando cocina marca "listo". Se decidió así porque el descuento ya estaba implementado en ese punto del flujo desde antes — funcionalmente el efecto es el mismo que pedía el usuario (la caja ve que se agotó algo después de que se vendió), solo que se reserva el insumo al aceptar el pedido en vez de al terminar de cocinarlo.

## Identidad visual y logo (2026-09-03)

Logo propio en `public/img/logo.svg` (badge circular, hamburguesa ilustrada en flat design, gradiente naranja/amarillo de marca) — reemplaza el emoji 🍔 que se usaba antes, y sirve de favicon en las 6 páginas. `estilos.css` suma `Space Grotesk` como fuente de títulos (sobre DM Sans/DM Mono que ya estaban), fondo con gradiente radial sutil, botones primarios con degradé y sombra, tarjetas con `box-shadow`, navbar con blur — mismo esquema de color oscuro/naranja, más pulido. Cambios centralizados en `estilos.css`; cada página solo cambió el navbar (logo + wordmark) y el link de fuentes de Google (sumó `Space+Grotesk`).

## Seguimiento de pedido para el cliente (2026-09-03)

`public/seguimiento.html` — página pública (sin login), el cliente ingresa el número de pedido (el mismo `numero_pedido` que ve caja) y ve un stepper visual con 5 pasos que cambian de label según el canal: Recibido → Confirmado → Cocinando → **Listo para retirar** (presencial/whatsapp) o **En camino** (delivery) → Entregado/Retirado. Estado `cancelado` muestra una tarjeta roja aparte, sin stepper. Se auto-refresca cada 10s hasta llegar a un estado terminal (entregado/cancelado). Soporta `?numero=N` en la URL para linkear directo.

Respaldado por `rutas/seguimiento.js` — `GET /api/seguimiento/:numero`, sin middleware de auth (el cliente no tiene cuenta). Devuelve estado, canal, items, total y el método/estado del cobro. Bajo riesgo de exponer esto sin auth: `pedidos` no guarda ningún dato personal del cliente (ni nombre ni teléfono), solo lo operativo.

Falta (no pedido todavía, posible mejora futura): compartirle el link/número al cliente automáticamente al crear el pedido en caja — hoy caja tendría que decírselo de palabra o por WhatsApp a mano.

## Registro de pedidos, boleta en PDF y navegación entre perfiles (2026-09-03)

- **Registro completo** (`registro.html` + `rutas/registro.js`, solo propietario/encargado): historial de todos los pedidos (no solo los de hoy), con filtros por fecha/estado/canal, tiles de resumen (pedidos, facturado, cancelados, con incidencias) y un detalle por pedido (items, precios, quién atendió, cobro, observaciones, incidencias, timestamps de creado/actualizado).
- **Boleta en PDF** (`GET /api/pedidos/:id/boleta`, con `pdfkit`): comprobante de una página con logo, datos del pedido, tabla de items con subtotales, total, método/estado de pago, observaciones e incidencias si las hay. Accesible desde el modal de `caja.html` (botón "🧾 Ver boleta", en cualquier estado del pedido) y desde el detalle en `registro.html`. Se abre en pestaña nueva vía `verBoleta()` en `app.js` — importante: esa función abre la pestaña **antes** del `fetch`, porque abrirla después de un `await` hace que el navegador la bloquee como popup.
- **Navegación entre perfiles**: `renderNavSwitcher()` en `app.js` agrega al navbar los links a Panel/Caja/Cocina/Reparto/Registro cuando el usuario logueado es `propietario` o `encargado` (esos roles ya podían entrar a cualquier vista por el `requireAuth` de cada página — lo que faltaba era la forma de llegar sin escribir la URL a mano).
- Al debuggear la boleta aparecieron PDFs truncados (solo el header) en las primeras pruebas — se descartó como bug real: fue una carrera al cargar las fuentes de PDFKit por disparar dos pedidos de la misma boleta casi en simultáneo durante las pruebas. Con una sola descarga por vez (el caso real de uso) genera el PDF completo siempre; se verificó con cuatro métodos distintos (archivo, http plano, Express+curl, fetch del navegador).

## Notas técnicas conocidas

- Usar **CMD**, no PowerShell, para `npm`/`node` (bloqueo de scripts de PowerShell en este entorno).
- Express fijado en v4 — Express 5 rompía el ciclo de vida del servidor.
- `server.js` carga `.env` manualmente solo si el archivo existe — en Render/Railway las variables ya vienen en `process.env` sin archivo `.env` (antes tiraba ENOENT y crasheaba el deploy; corregido 2026-09-03).
- Puerto 3000 ocupado en local → `taskkill /F /IM node.exe`.
- Probar login limpio en ventana de incógnito (localStorage puede tener sesión vieja).

## Seguridad — resuelto 2026-09-03

- ✅ **JWT_SECRET rotado** — el valor viejo, expuesto en el historial de GitHub, ya no sirve para firmar ni validar tokens.
- ✅ **RLS habilitado en las 8 tablas de `public`** (antes solo `producto_insumos` la tenía). La anon key (expuesta en GitHub) ya no puede leer ni escribir nada vía la API de Supabase.
- ✅ **Backend migrado a `SUPABASE_SERVICE_KEY`** vía `rutas/db.js` (bypasea RLS, nunca se expone al navegador). Confirmado funcionando end-to-end y que arregló el descuento de stock.
- La anon key en sí no se rotó (no hay endpoint para eso vía las herramientas disponibles) — no hace falta: con RLS activo queda inutilizable para terceros aunque siga expuesta en el historial viejo de git.
- `.env` y `node_modules/` estaban commiteados en git y ya se habían subido a GitHub antes de agregar `.gitignore` (corregido el 2026-09-03). El commit viejo en el historial sigue teniendo los valores originales (ya rotados/neutralizados) — reescribir el historial de git (`git filter-repo` + force-push) sigue disponible como limpieza opcional, no se hizo sin pedir permiso explícito por ser destructivo.

## Credenciales de desarrollo (seed)

| Rol | Email | Password |
|-----|-------|----------|
| Propietario | admin@burgerpoint.com | admin1234 |
| Caja (María) | caja@burgerpoint.com | test1234 *(reseteada para pruebas el 2026-09-03)* |
| Cocina (Carola) | cocina@burgerpoint.com | test1234 *(reseteada para pruebas el 2026-09-03)* |
| Reparto (Juan) | reparto@burgerpoint.com | test1234 *(reseteada para pruebas el 2026-09-03)* |
