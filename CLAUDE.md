# Burger Point — Sistema de Gestión

Analista/Desarrollador: Pedro. Stack: Node.js · Express 4 · Supabase (PostgreSQL, São Paulo, proyecto `wvarebdeatfdlmeojzvq`) · desplegado en Render (plan free, elegido para no generar costo antes de presentar el proyecto — Railway queda como opción paga para más adelante si se necesita 24/7 sin sleep).

**URL en producción**: https://burger-point-vtlu.onrender.com — se duerme tras 15 min sin tráfico, primer request siguiente tarda 30-60s en responder (comportamiento normal del plan free, no es un error). Es el link que se comparte con clientes: la raíz del sitio sirve el **menú digital** directamente (`GET /` → `menu.html`, desde el 2026-09-10). El **login de staff** vive en `/index.html` — no es la puerta de entrada por defecto, se llega por el link "🔑 Soy del staff" en el menú o escribiendo la URL directo.

## Estado general (al 2026-09-10)

Las 6 fases del plan original (configuración, login+roles, panel, pedidos/caja, cocina+reparto, cobros+deploy) están completas y en producción desde el 2026-09-03. Desde entonces se agregó bastante más de lo planeado originalmente — stock visible, rediseño visual + logo, seguimiento del cliente, registro/historial admin, factura numerada persistente, inventario con ingresos, menú digital de autoservicio con auto-notificación a caja, contenido real (descripciones + fotos) del menú, un rol de encargado real con permisos por sección y notificación de actividad al propietario, precios editables + promociones con descuento automático, un pulido general de la experiencia móvil, y personalización de productos (extras) + variantes de bebida por marca y tamaño. Cada uno tiene su propia sección fechada más abajo, en orden cronológico — es la forma más confiable de saber qué existe y por qué.

**Para retomar el trabajo**: el usuario pidió una ronda nueva de mejoras el 2026-09-10 (ver "Pendiente — ronda de mejoras 2026-09-10" al final del documento) — hechos: pulido móvil, separar el menú digital del login de staff, y personalización de productos + variantes de bebida. Queda un solo frente: **cuentas de cliente + fidelización** — es lo próximo, salvo que el usuario pida otra cosa.

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
  productos.js       # GET/POST/PATCH /api/productos (incluye `disponible` y precio con promo aplicada)
  promociones.js     # GET/POST/PATCH/DELETE /api/promociones + exporta aplicarPromociones(), usada por productos.js y menu.js
  incidencias.js     # POST /api/incidencias (BR-04)
  cobros.js          # POST /api/cobros, PATCH /api/cobros/:id/verificar
  seguimiento.js     # GET /api/seguimiento/:numero — PÚBLICO, sin auth, para que el cliente consulte su pedido
  registro.js        # GET /api/registro — historial completo con filtros, solo propietario/encargado
  insumos.js         # GET /api/insumos (+ /movimientos), POST /:id/ingreso — inventario, solo propietario/encargado
  menu.js            # GET /api/menu, POST /api/menu/pedido — PÚBLICO, sin auth, menú digital de autoservicio
  extras.js          # GET/POST/PATCH/DELETE /api/extras — aderezos/agregados por producto, solo propietario/encargado
  permisos.js        # GET /api/permisos (cualquier logueado), PATCH /api/permisos/:seccion (solo propietario)
  actividad.js       # GET /api/actividad (solo propietario) + exporta registrarActividad(), usada por otras rutas
  requireSeccion.js  # middleware factory — bloquea al encargado si el propietario no le habilitó esa sección
public/
  img/logo.svg       # logo propio (badge circular con hamburguesa), usado como favicon en las 6 páginas
  index.html         # login — links a menu.html y seguimiento.html para el cliente
  menu.html          # pública, sin login — el cliente arma su pedido, elige retiro/delivery y lo envía
  panel.html         # propietario/encargado
  caja.html          # caja/encargado — crea pedidos, muestra stock por producto (bloquea si no alcanza), cobra y genera factura
  cocina.html        # cocina — temporizador, cambio de estado, registro de errores
  reparto.html       # reparto — entregas del turno, verificar transferencia pendiente
  seguimiento.html   # pública, sin login — el cliente ve el estado de su pedido por número
  registro.html      # propietario/encargado — historial completo, filtros, detalle y factura de cada pedido
  inventario.html    # propietario/encargado — stock por insumo, registrar ingresos, historial de movimientos
  permisos.html      # solo propietario — habilita/bloquea qué secciones puede ver el encargado
  productos.html     # propietario/encargado — editar precios/visibilidad del menú y crear promociones
.claude/launch.json  # config para levantar el servidor desde el preview del editor
```

## Base de datos (Supabase, proyecto wvarebdeatfdlmeojzvq)

Tablas: `usuarios`, `productos`, `insumos`, `pedidos`, `pedido_items`, `cobros`, `incidencias`, `producto_insumos`, `facturas`, `movimientos_stock`, `permisos_encargado`, `actividad`, `promociones`, `promocion_productos`, `extras`, `producto_extras`, `pedido_item_extras`. **RLS activado en las 17** (sin políticas — deniega anon/authenticated, `service_role` bypasea por diseño).

`permisos_encargado`: una fila por sección (`panel`, `caja`, `cocina`, `reparto`, `inventario`, `registro`, `productos`) con `permitido boolean`. `actividad`: `usuario_id`, `rol`, `accion` (texto libre, ej. `Creó el pedido #24`), `creado_en` — solo se escribe cuando el actor es `encargado`.

`promociones`: `nombre`, `porcentaje` (1-100), `activo`, `fecha_inicio`/`fecha_fin` (ambas nullable = sin límite de fecha). `promocion_productos` es la tabla intermedia (una promo puede aplicar a varios productos). Si un producto queda alcanzado por más de una promo activa a la vez, se usa la de mayor porcentaje.

`extras`: `nombre`, `precio` (0 = gratis), `activo`. `producto_extras` es la tabla intermedia (qué productos ofrecen cada extra). `pedido_item_extras` guarda los extras elegidos en cada item de un pedido ya confirmado — `nombre`/`precio` quedan copiados ahí (igual que `pedido_items.precio_unitario`) para que la orden histórica no cambie si el extra se edita o se borra después; `extra_id` tiene `ON DELETE SET NULL` por lo mismo. **El precio de los extras ya viene sumado dentro de `pedido_items.precio_unitario`** (se calcula una sola vez en el servidor al crear el pedido) — `pedido_item_extras` es solo para mostrar qué se eligió, no hace falta sumarlo de nuevo en ningún cálculo de total.

`facturas`: `numero_factura` autoincremental (serial), vinculada a `pedido_id` + `cobro_id`, con `metodo_pago`/`estado_pago` copiados del cobro. Se crea automáticamente en `POST /api/cobros`. `movimientos_stock`: `tipo` ('ingreso'/'ajuste'), `cantidad`, `nota`, `usuario_id` — se crea en `POST /api/insumos/:id/ingreso`.

`pedidos.canal` ahora acepta `'online'` además de `presencial`/`whatsapp`/`delivery` (pedidos de autoservicio para retiro; si el cliente pide delivery desde el menú digital se usa el canal `delivery` normal). `pedidos` tiene además `cliente_nombre`, `cliente_telefono`, `cliente_direccion` (nullable — solo se completan en pedidos creados desde `menu.html`; los que carga el staff los dejan `null`, y eso es lo que usa el frontend para detectar "es un pedido online").

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

Respaldado por `rutas/seguimiento.js` — `GET /api/seguimiento/:numero`, sin middleware de auth (el cliente no tiene cuenta). Devuelve estado, canal, items, total y el método/estado del cobro.

Nota de seguridad actualizada: desde que existe `menu.html`, `pedidos` **sí** guarda datos personales (`cliente_nombre`, `cliente_telefono`, `cliente_direccion`) para los pedidos de autoservicio. `GET /api/seguimiento/:numero` NO los devuelve (solo estado/canal/items/total) — si en algún momento se le agrega el nombre del cliente a esa respuesta para personalizar el saludo, hay que evaluar de nuevo si conviene exponerlo sin auth (numero_pedido es correlativo y fácil de adivinar/iterar).

## Registro de pedidos, navegación entre perfiles (2026-09-03)

- **Registro completo** (`registro.html` + `rutas/registro.js`, solo propietario/encargado): historial de todos los pedidos (no solo los de hoy), con filtros por fecha/estado/canal, tiles de resumen (pedidos, facturado, cancelados, con incidencias) y un detalle por pedido (items, precios, quién atendió, cobro, número de factura, observaciones, incidencias, timestamps de creado/actualizado).
- **Navegación entre perfiles**: `renderNavSwitcher()` en `app.js` agrega al navbar los links a Panel/Caja/Cocina/Reparto/Inventario/Registro cuando el usuario logueado es `propietario` o `encargado` (esos roles ya podían entrar a cualquier vista por el `requireAuth` de cada página — lo que faltaba era la forma de llegar sin escribir la URL a mano).
- Al debuggear la generación de PDF aparecieron documentos truncados (solo el header) en las primeras pruebas — se descartó como bug real: fue una carrera al cargar las fuentes de PDFKit por disparar dos pedidos del mismo documento casi en simultáneo durante las pruebas. Con una sola descarga por vez (el caso real de uso) genera el PDF completo siempre; se verificó con cuatro métodos distintos (archivo, http plano, Express+curl, fetch del navegador).

## Factura numerada persistente e inventario (2026-09-03)

- **Factura, no boleta**: `GET /api/pedidos/:id/factura` (con `pdfkit`) ya no es un PDF generado al vuelo desde el pedido — cada cobro (`POST /api/cobros`) emite una fila en `facturas` con número correlativo propio (`numero_factura`, ej. `#000018`), que es lo que el PDF muestra como "Factura N°". Si se verifica una transferencia (`PATCH /api/cobros/:id/verificar`) el `estado_pago` de la factura se actualiza junto con el cobro. Accesible desde el modal de `caja.html` ("🧾 Ver factura") y desde el detalle en `registro.html`. Se abre en pestaña nueva vía `verFactura()` en `app.js` — esa función abre la pestaña **antes** del `fetch`, porque abrirla después de un `await` hace que el navegador la bloquee como popup.
- Se hizo un backfill de facturas para los 17 cobros que ya existían antes de esta función (`#000001` a `#000017`); los pedidos #1 y #2 nunca tuvieron cobro y por eso no tienen factura (se ve "—" en el registro, es correcto).
- **Inventario** (`inventario.html` + `rutas/insumos.js`, solo propietario/encargado): tabla de todos los insumos ordenada por criticidad (agotado → bajo → normal), con botón "➕ Ingreso" por insumo que abre un modal (cantidad + nota opcional) y llama a `POST /api/insumos/:id/ingreso` — suma al `cantidad_actual` y deja un registro en `movimientos_stock`. Pestaña "Historial de ingresos" lista esos movimientos con quién lo cargó. Panel del propietario tiene un botón directo ("📦 Ver inventario") junto a las alertas de stock.

## Menú digital para clientes + auto-notificación a caja (2026-09-04)

- **`menu.html`** (público, sin login): catálogo con stock en vivo (mismo cálculo de `stock.js` que usa caja), carrito, elección de "Retiro en el local" o "Delivery", datos de contacto (nombre/teléfono, +dirección si es delivery). Al confirmar, muestra el número de pedido y un link directo a `seguimiento.html?numero=N`.
- **`rutas/menu.js`** (público): `GET /` arma el menú; `POST /pedido` crea el pedido con `usuario_id: null` y `canal` = `'online'` (retiro) o `'delivery'`. El precio de cada item se busca en el servidor (tabla `productos`), **nunca se confía en lo que mande el cliente** — si no fuera así, cualquiera podría mandar un precio inventado. Valida stock igual que `POST /api/pedidos`.
- **Automatización en caja**: `caja.html` ahora sondea `/api/pedidos` cada 8s (antes solo se refrescaba al crear/cobrar un pedido). Cuando aparece un pedido nuevo con `cliente_nombre` (o sea, de autoservicio) que no estaba en el sondeo anterior: suena un beep (`sonarAlerta()` en `app.js`, generado con la Web Audio API, sin archivo de sonido), aparece un toast "🌐 Pedido online #N — nombre", y la tarjeta del pedido queda resaltada con un borde animado un par de segundos. El modal del pedido muestra nombre/teléfono/dirección del cliente.
- Caja sigue siendo el filtro humano: un pedido online entra en estado `recibido` igual que uno cargado a mano, y todavía hace falta que caja elija el método de pago y confirme para que pase a cocina — lo que se automatizó es la **carga** del pedido y el **aviso**, no se salteó el control de caja sobre el cobro.
- Probado de punta a punta: pedido de delivery desde el menú → aparece resaltado en caja con los datos del cliente → caja confirma → stock se descuenta → factura se emite → `seguimiento.html` muestra "Confirmado, ya lo mandamos a cocina" con el paso "En camino" (o "Listo para retirar" si el canal es `online`).

## Contenido del menú digital: descripciones reales + fotos pendientes (2026-09-04)

- **`productos.descripcion`** (columna nueva): completada a mano para los 16 productos activos, redactada a partir de la receta real de cada uno (`producto_insumos` + `insumos`), no inventada — si el usuario cambia una receta, la descripción puede quedar desactualizada y conviene revisarla.
- **Sin generador de imágenes disponible en este entorno** — no se pudieron crear fotos ni renders realistas. En su lugar: `menu.html` ya tiene el layout listo para imagen (`producto-img` con fallback "Foto próximamente" si el archivo no existe) apuntando a `/img/productos/<slug>.jpg`, donde `<slug>` sale de `slugify(nombre)` en el propio `menu.html` (minúsculas, sin acentos, `&`→`y`, espacios→guiones). En cuanto exista el archivo con el nombre exacto, aparece solo, sin tocar código.
- **`docs/prompts-fotos-menu.md`**: un prompt de foto por producto (16), armado con los ingredientes reales de cada receta, más un párrafo de "estilo general" para que las 16 fotos queden visualmente consistentes entre sí. Pensado para pegar en Midjourney/DALL-E/Gemini y después subir el resultado con el nombre de archivo que indica la tabla del documento.

## Fotos del menú cargadas (2026-09-07)

Las 16 fotos generadas por el usuario con los prompts de arriba ya están en `public/img/productos/<slug>.jpg` y se ven en `menu.html` (confirmado en local, las 16 cargan sin fallback).

✅ **Resuelto (2026-09-07)**: las 8 fotos con "SPICY BURGER CO." se regeneraron con el prompt corregido (pidiendo explícitamente que cualquier texto de marca diga "Burger Point") y ya están reemplazadas en `public/img/productos/`. Las papas ahora dicen "Burger Point" correctamente; las bebidas (agua, gaseosa) no tienen texto de marca, lo cual también es válido. Las 16 fotos del menú quedaron consistentes.

Nota de proceso para el futuro: el usuario mandó las fotos corregidas pegándolas directo en el chat (no como archivo), lo cual no deja un archivo accesible en disco — hay que pedirle que las mande con `@"ruta\al\archivo"` (zip o carpeta) como la primera vez. También llegaron en un `.rar` (no `.zip`) con nombres genéricos de Gemini (`Gemini_Generated_Image_*.jpg`) — no hay `unrar`/`7z` instalados, pero sí `WinRAR` en `C:\Program Files\WinRAR\UnRAR.exe`, que sirve para extraerlo por línea de comandos. Hubo que abrir cada imagen para identificar a qué producto correspondía antes de renombrarla.

## Fotos del menú: 16 productos con imagen real (2026-09-07)

- Las 16 fotos generadas por IA (pedidas via `docs/prompts-fotos-menu.md`) ya están subidas a `public/img/productos/<slug>.jpg` — `menu.html` las muestra automáticamente (usa el mismo `slugify()` que ya tenía, no hizo falta tocar código).
- 8 de las 16 fotos de la primera tanda salieron con "SPICY BURGER CO." impreso en la imagen (marca inventada por el generador, a pesar de pedir "sin texto") — se detectó al inspeccionar cada imagen antes de subirla (no se publica nada sin abrirlo primero) y se regeneraron esas 8 con un prompt corregido. Las 8 correctas dicen "Burger Point" o no tienen texto. Si en algún momento hay que regenerar alguna, conviene reforzar en el prompt que evite cualquier marca/logo, no solo pedir "sin texto".

## Rol de encargado real + panel de permisos + notificación de actividad (2026-09-07)

- **`permisos_encargado`** (una fila por sección: `panel`, `caja`, `cocina`, `reparto`, `inventario`, `registro`) define qué puede ver el encargado. El propietario los edita desde `permisos.html` (switch por sección, `PATCH /api/permisos/:seccion`) — el propietario siempre tiene acceso a todo, esto solo restringe al encargado.
- **Enforcement en dos capas**: frontend (`requireAuth(roles, seccion)` en `app.js` redirige a login si el encargado no tiene el permiso; `renderNavSwitcher()` oculta del navbar las secciones bloqueadas) y backend (`requireSeccion(seccion)` en `rutas/requireSeccion.js`, montado en `panel.js`, `registro.js` e `insumos.js`). **Importante**: `caja.js`/`cocina`/`reparto` no tienen un archivo de rutas propio con lógica separada por rol — sus endpoints reales son `pedidos.js`/`cobros.js`/`incidencias.js`, que ya eran de acceso libre para cualquier usuario autenticado desde antes de esta feature (el control de "quién ve cada pantalla" es solo frontend ahí). Si en algún momento hace falta bloquear a nivel API también esas tres secciones, hay que decidir primero cómo separar sus rutas por rol sin romper caja/cocina/reparto actuales.
- **Actividad**: tabla `actividad` (`usuario_id`, `rol`, `accion`, `creado_en`). `registrarActividad()` en `rutas/actividad.js` es un helper que cualquier ruta puede llamar — solo escribe si el actor es `encargado` (al propietario no le hace falta notificarse a sí mismo). Está enganchado en: crear pedido, cambiar estado de pedido, cobrar, verificar transferencia, registrar incidencia, ingreso de stock, agregar producto. `GET /api/actividad` (solo propietario) alimenta un feed nuevo en `panel.html` ("🔐 Actividad del encargado"), visible solo si el usuario logueado es propietario.
- Probado de punta a punta con un usuario de prueba (`encargado@burgerpoint.com`, borrado después de probar): login como encargado devuelve sus permisos, el nav-switcher y `requireAuth` ocultan/bloquean las secciones deshabilitadas, un intento de golpear `/api/insumos` directo por API da 403 aunque se salte el frontend, y una acción del encargado (crear un pedido) aparece en el feed de actividad del propietario con su nombre y hora.

## Precios editables y promociones (2026-09-07)

- **`productos.html`** (propietario/encargado, permiso nuevo `productos` en `permisos_encargado`): pestaña "Precios" con tabla de todos los productos (activos y ocultos, `GET /api/productos?todos=true`), edición de nombre/precio/descripción/visibilidad vía `PATCH /api/productos/:id` (nuevo), y alta de productos nuevos. Pestaña "Promociones": crear un descuento por **porcentaje** sobre uno o más productos, con fecha de inicio/fin opcionales — activar/desactivar con un switch, eliminar.
- **El descuento es real, no un cartel**: `aplicarPromociones()` en `rutas/promociones.js` calcula `precio_final` en el servidor a partir de la promo activa con mayor porcentaje para cada producto, y ese valor es el que se usa — nunca el precio de lista — en los tres lugares donde se cobra: `GET /api/productos` (caja), `GET /api/menu` y `POST /api/menu/pedido` (menú digital del cliente). El cliente nunca puede mandar su propio precio; se recalcula siempre server-side. `caja.html` y `menu.html` muestran el precio viejo tachado + el nuevo cuando hay descuento.
- Se decidió por elección explícita del usuario: descuento automático real (no solo cartel de marketing) y solo tipo porcentaje por ahora (no monto fijo ni precio promocional fijo) — si en el futuro se necesita otro tipo de descuento, hay que sumar una columna `tipo` a `promociones` y extender `aplicarPromociones()`.
- Probado de punta a punta en local y limpiado después: promo de -20% sobre Blue Cheese ($8.500 → $6.800) se reflejó en caja, en el menú digital y en un pedido online real (verificado que `pedido_items.precio_unitario` quedó en 6800, no en el precio de lista). También se probó editar el precio de un producto y confirmarlo en la tabla.

Con esto se completaron las seis cosas grandes que el usuario pidió de una: inventario + factura, menú digital + auto-notificación, fotos del menú, rol de encargado + permisos + actividad, y precios + promociones.

## Pulido móvil (2026-09-10)

- **Navbar colapsable**: `#nav-switcher` (los links a Panel/Caja/Cocina/etc., generados por `renderNavSwitcher()` en `app.js`) antes se amontonaban y tapaban contenido en pantallas angostas. Ahora bajo los 860px se colapsan en un botón hamburguesa (`.nav-toggle`) que despliega un panel (`.nav-links.abierto`) debajo del navbar; se cierra solo al tocar afuera (listener agregado dentro de la misma `renderNavSwitcher()`). El subtítulo de cada página en el navbar (`· Cocina`, `· Inventario`, etc.) está ahora en un `<span class="navbar-subtitle">` y se oculta en mobile junto con el rol del usuario y el reloj de `cocina.html`, para que el logo + hamburguesa + Salir siempre entren en una sola línea.
- **Carrito accesible en Caja y Menú digital**: ambas páginas tenían el mismo problema — el carrito era una columna lateral que en mobile quedaba al final de una grilla larga de productos, había que scrollear mucho para verlo. Se agregó una barra fija abajo (`.cart-bar`, visible solo bajo el breakpoint de cada página) con cantidad de items + total, que al tocarla hace `scrollIntoView` hasta el carrito. Se actualiza desde `renderCarrito()` en cada página.
- **Tablas admin** (`productos.html`, `inventario.html`): la fila completa es clickeable para abrir el modal de editar/ingreso (antes había que acertarle al botón chico, que además quedaba parcialmente fuera de pantalla) — el botón se mantiene pero con `event.stopPropagation()`. Se agregó también un degradé sutil en el borde derecho de `.tabla-wrap` en mobile como indicio de que hay más columnas deslizando a la derecha (el scroll horizontal ya funcionaba, pero no era obvio que existía).
- Ajustes generales en la media query de `estilos.css` (`max-width:860px`): padding de `.main-content` y `.navbar`, tamaño de `h1`/`h2`, y botones `.qty-btn` más grandes (34px) en Caja y Menú digital para mejor touch target.
- Probado en viewport mobile (375×812) contra las 11 páginas del sistema — login, panel, caja (con carrito), cocina, reparto, registro (con modal de detalle), inventario, permisos, productos y menú digital (con carrito) — y verificado que a partir de 860px el navbar vuelve a mostrarse en línea sin hamburguesa, sin tocar el comportamiento de desktop.

## Separar el menú digital del login de staff (2026-09-10)

- **`GET /`** ahora sirve `menu.html` directamente (`server.js`), no `index.html`. `express.static` se montó con `{ index: false }` para que deje de auto-servir `index.html` en `/` — el login de staff sigue intacto en la ruta explícita `/index.html`, nada de su lógica cambió (ni el auto-redirect si ya hay sesión, ni `requireAuth`, ni `cerrarSesion()`, que siguen apuntando a `/index.html`).
- **`menu.html`** tiene un header nuevo (`.menu-nav` reestructurado con `.menu-nav-brand` + `.menu-nav-links`) con dos links discretos: "📦 Seguir mi pedido" (`/seguimiento.html`) y "🔑 Soy del staff" (`/index.html`) — así el personal todavía puede llegar al login sin escribir la URL a mano, pero ya no es lo primero que ve un cliente.
- Verificado en producción: la raíz del dominio muestra el menú, `/index.html` sigue funcionando igual que siempre (login, auto-redirect si ya hay sesión, `cerrarSesion()` vuelve ahí).

## Personalización de productos (extras) + variantes de bebida (2026-09-10)

- **Extras**: el cliente elige aderezos/agregados/quitados al tocar "+ Agregar" en `menu.html` para cualquier producto que tenga extras asociados — se abre un modal (`abrirModalExtras()`) con checkboxes y el precio de cada uno (0 = gratis). El precio final por unidad se calcula **siempre en el servidor** en `POST /api/menu/pedido` (producto.precio_final + suma de extras elegidos, validando que cada extra realmente esté asociado a ese producto vía `producto_extras` — cualquier `extra_id` inválido se ignora en vez de romper el pedido) y ya queda sumado dentro de `pedido_items.precio_unitario`, así que **no hay que tocar ningún cálculo de total existente** en el resto del sistema (panel, registro, factura, cobros) — todos siguen funcionando igual porque el precio unitario ya viene completo. `pedido_item_extras` es solo la copia de qué se eligió, para mostrarlo en cocina/caja/registro/factura.
- Carrito del cliente: un mismo producto con distintas combinaciones de extras queda como líneas separadas en el carrito (se identifican por `producto_id + extra_ids` ordenados, no solo por `producto_id`), así "Blue Cheese sin nada" y "Blue Cheese con extra bacon" no se mezclan en una sola línea con cantidad 2.
- **Administración de extras**: pestaña nueva "Extras" en `productos.html` (mismo permiso `productos`) — crear/editar/activar-desactivar/eliminar, y elegir a qué productos aplica cada uno desde un checklist, mismo patrón que la pestaña de Promociones.
- **Datos cargados como borrador inicial** (confirmado con el usuario, pero pensado para ajustarse después desde el panel): 13 extras en las 7 hamburguesas — 5 aderezos (ketchup/mostaza/mayonesa/BBQ/alioli, gratis), 4 "sin algo" (cebolla/pepinillos/tomate/lechuga, gratis), extra huevo (+$400), extra bacon (+$500), extra queso (+$400), agregar porción chica de papas (+$800).
- **Variantes de bebida**: se desactivó el producto genérico "Gaseosa" (`activo=false`, no se borró, para no romper pedidos históricos que lo referencian) y se creó un producto nuevo por cada combinación de marca × tamaño — Coca-Cola, Coca-Cola Zero, Sprite, Fanta, Pepsi, cada una en 500ml/750ml/1L —, cada uno con su propio insumo (`cantidad_actual` inicial 30, `cantidad_minima` 8) y su receta de 1 unidad en `producto_insumos`. Esto reutiliza el sistema de stock/inventario que ya existía sin tocar una línea de código — `inventario.html` y `stock.js` ya los tratan como cualquier otro insumo/producto. Precios cargados como borrador: 500ml $450, 750ml $650, 1L $850 (mismo precio para las 5 marcas).
- Probado de punta a punta en local y en producción: pedido con extras (verificado el precio calculado server-side, no el que arma el cliente) + una bebida nueva, extras visibles en cocina/caja/registro/factura PDF, y el stock de la bebida se descontó correctamente al confirmar el cobro. Datos de prueba limpiados después.
- **Corrección de UX pedida por el usuario el mismo día**: mostrar las 15 variantes como 15 tarjetas separadas en el menú lo llenaba de "Coca-Cola 500ml", "Coca-Cola 750ml", etc. — se agrupan en `menu.html` (`agruparBebidas()`, detecta el patrón `"Marca 500ml/750ml/1L"` en el nombre) en un solo cartel por marca ("Coca-Cola", "Coca-Cola Zero", "Sprite", "Fanta", "Pepsi") con "Desde $X"; al tocar "+ Agregar" se abre un selector de tamaño con el precio de cada uno y elegir uno agrega esa variante puntual. **Los 15 productos individuales en la base no cambiaron** — siguen siendo la forma en que se factura, se ve en cocina/caja/registro y se controla el stock; esto fue solo un cambio de presentación en el menú del cliente.

## Pendiente — ronda de mejoras 2026-09-10 (no implementado todavía)

El usuario pidió una tanda nueva de mejoras en un solo mensaje largo; se separó en frentes independientes y se acordó ir de a uno. **Hechos**: pulido móvil, separar el menú digital del login de staff, personalización de productos + variantes de bebida (todo arriba). **Queda uno solo**:

1. **Cuentas de cliente + fidelización**: el cliente se identifica en el menú digital con teléfono + nombre (decisión ya tomada: identificación liviana, sin contraseña — no una cuenta con login real). El objetivo es reconocerlo la próxima vez que pida y poder armar promociones dirigidas (cumpleaños, San Valentín, etc. — el usuario mencionó específicamente detectar "si una persona está pidiendo demasiado de un solo lugar" como señal de cliente frecuente). Falta diseñar: tabla `clientes` (teléfono como identificador único probablemente), cómo se relaciona con `pedidos` (hoy `cliente_nombre`/`cliente_telefono`/`cliente_direccion` son campos sueltos en `pedidos`, no hay tabla de clientes), y qué dispara una promo de cumpleaños (¿necesita fecha de nacimiento en el registro?).

## Notas técnicas conocidas

- Usar **CMD**, no PowerShell, para `npm`/`node` (bloqueo de scripts de PowerShell en este entorno).
- Express fijado en v4 — Express 5 rompía el ciclo de vida del servidor.
- `server.js` carga `.env` manualmente solo si el archivo existe — en Render/Railway las variables ya vienen en `process.env` sin archivo `.env` (antes tiraba ENOENT y crasheaba el deploy; corregido 2026-09-03).
- Puerto 3000 ocupado en local → `taskkill /F /IM node.exe`.
- Probar login limpio en ventana de incógnito (localStorage puede tener sesión vieja).

## Seguridad — resuelto 2026-09-03

- ✅ **JWT_SECRET rotado** — el valor viejo, expuesto en el historial de GitHub, ya no sirve para firmar ni validar tokens.
- ✅ **RLS habilitado en las 10 tablas de `public`** (antes solo `producto_insumos` la tenía; `facturas` y `movimientos_stock` nacieron ya con RLS activo). La anon key (expuesta en GitHub) ya no puede leer ni escribir nada vía la API de Supabase.
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
