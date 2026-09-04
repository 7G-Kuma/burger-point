# Burger Point — Sistema de Gestión

Analista/Desarrollador: Pedro. Stack: Node.js · Express 4 · Supabase (PostgreSQL, São Paulo, proyecto `wvarebdeatfdlmeojzvq`) · Railway (deploy en curso).

## Estado general: Fase 2 — Partes 1 a 6 completas, falta solo el deploy a Railway

| # | Parte | Estado |
|---|-------|--------|
| 1 | Configuración inicial (Node, GitHub, Supabase, tablas) | ✅ Completada |
| 2 | Servidor base + Login (Express 4, JWT, roles) | ✅ Completada |
| 3 | Panel del propietario (estadísticas, alertas) | ✅ Completada |
| 4 | Módulo de Pedidos (caja, carrito, menú) | ✅ Completada |
| 5 | Vista de Cocina + Reparto | ✅ Completada — probada en circuito integral |
| 6 | Módulo de Cobros + Deploy a Railway | 🔶 Cobros completo, seguridad cerrada — deploy pendiente (requiere cuenta del usuario) |

Probado en vivo el 2026-09-03: caja crea pedido → cobro por transferencia queda pendiente → cocina prepara y marca listo → reparto verifica la transferencia y marca entregado → panel refleja ventas/cobrado/alertas correctamente. Repetido con la `service_role` key activa y confirmado que el descuento de stock ahora funciona (`Queso azul` 2.00→1.00 y `Carne (medallón)` 80.00→79.00 al confirmar un Blue Cheese).

## Estructura

```
server.js            # carga .env si existe (Railway inyecta env vars directo, sin archivo .env), monta rutas, sirve public/
rutas/
  db.js              # cliente Supabase centralizado — prefiere SUPABASE_SERVICE_KEY, cae a SUPABASE_KEY
  auth.js            # POST /api/auth/login
  panel.js           # GET /api/panel/estadisticas + /alertas
  pedidos.js         # GET/POST/PATCH /api/pedidos (incluye descuento de insumos al confirmar)
  productos.js       # GET/POST /api/productos
  incidencias.js     # POST /api/incidencias (BR-04)
  cobros.js          # POST /api/cobros, PATCH /api/cobros/:id/verificar
public/
  index.html         # login
  panel.html         # propietario/encargado
  caja.html          # caja/encargado — crea pedidos y cobra (efectivo/tarjeta/transferencia)
  cocina.html        # cocina — temporizador, cambio de estado, registro de errores
  reparto.html       # reparto — entregas del turno, verificar transferencia pendiente
.claude/launch.json  # config para levantar el servidor desde el preview del editor
```

## Base de datos (Supabase, proyecto wvarebdeatfdlmeojzvq)

Tablas: `usuarios`, `productos`, `insumos`, `pedidos`, `pedido_items`, `cobros`, `incidencias`, `producto_insumos`. **RLS activado en las 8** (sin políticas — deniega anon/authenticated, `service_role` bypasea por diseño).

Usuarios de equipo ya creados: `admin@burgerpoint.com` (propietario), `caja@burgerpoint.com` (María), `cocina@burgerpoint.com` (Carola), `reparto@burgerpoint.com` (Juan).

## Próximos pasos

**Deploy a Railway (en curso, requiere cuenta del usuario — ver guía que se le dio en el chat):**
1. Crear cuenta en railway.app y conectar el repo de GitHub (`7G-Kuma/burger-point`)
2. Variables de entorno en Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `JWT_SECRET` (no hace falta `PORT`, Railway lo inyecta solo y `server.js` ya lo respeta)
3. Deploy — queda en una URL pública
4. Prueba final desde un celular fuera de la red local

## Notas técnicas conocidas

- Usar **CMD**, no PowerShell, para `npm`/`node` (bloqueo de scripts de PowerShell en este entorno).
- Express fijado en v4 — Express 5 rompía el ciclo de vida del servidor.
- `server.js` carga `.env` manualmente solo si el archivo existe — en Railway las variables ya vienen en `process.env` sin archivo `.env` (antes tiraba ENOENT y crasheaba el deploy; corregido 2026-09-03).
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
