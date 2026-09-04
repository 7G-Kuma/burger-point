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
public/
  index.html         # login
  panel.html         # propietario/encargado
  caja.html          # caja/encargado — crea pedidos, muestra stock por producto (bloquea si no alcanza) y cobra (efectivo/tarjeta/transferencia)
  cocina.html        # cocina — temporizador, cambio de estado, registro de errores
  reparto.html       # reparto — entregas del turno, verificar transferencia pendiente
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
