# Burger Point — Sistema de Gestión

Analista/Desarrollador: Pedro. Stack: Node.js · Express 4 · Supabase (PostgreSQL, São Paulo, proyecto `wvarebdeatfdlmeojzvq`) · Railway (deploy pendiente).

## Estado general: Fase 2 — Partes 1 a 6 funcionalmente completas, falta el deploy

| # | Parte | Estado |
|---|-------|--------|
| 1 | Configuración inicial (Node, GitHub, Supabase, tablas) | ✅ Completada |
| 2 | Servidor base + Login (Express 4, JWT, roles) | ✅ Completada |
| 3 | Panel del propietario (estadísticas, alertas) | ✅ Completada |
| 4 | Módulo de Pedidos (caja, carrito, menú) | ✅ Completada |
| 5 | Vista de Cocina + Reparto | ✅ Completada — probada en circuito integral |
| 6 | Módulo de Cobros + Deploy a Railway | 🔶 Cobros completo — deploy pendiente |

Probado en vivo el 2026-09-03: caja crea pedido → cobro por transferencia queda pendiente → cocina prepara y marca listo → reparto verifica la transferencia y marca entregado → panel refleja ventas/cobrado/alertas correctamente.

## Estructura

```
server.js            # carga .env manual (fs.readFileSync, sin dotenv), monta rutas, sirve public/
rutas/
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

Tablas: `usuarios`, `productos`, `insumos`, `pedidos`, `pedido_items`, `cobros`, `incidencias`, `producto_insumos`.

El cliente Supabase está centralizado en `rutas/db.js`: usa `SUPABASE_SERVICE_KEY` si está configurada, y si no cae a `SUPABASE_KEY` (anon). Todavía corre con la anon key porque `SUPABASE_SERVICE_KEY` no está seteada (ver seguridad abajo).

Usuarios de equipo ya creados: `admin@burgerpoint.com` (propietario), `caja@burgerpoint.com` (María), `cocina@burgerpoint.com` (Carola), `reparto@burgerpoint.com` (Juan).

## Próximos pasos (orden)

**Parte 6 — deploy a Railway (pendiente, requiere cuenta del usuario):**
1. Crear cuenta en railway.app y conectar el repo de GitHub (`7G-Kuma/burger-point`)
2. Configurar variables de entorno en Railway: `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET`, `PORT`
3. Deploy — queda en una URL pública
4. Prueba final desde un celular fuera de la red local

## Notas técnicas conocidas

- Usar **CMD**, no PowerShell, para `npm`/`node` (bloqueo de scripts de PowerShell en este entorno).
- Express fijado en v4 — Express 5 rompía el ciclo de vida del servidor.
- `.env` se carga manualmente en `server.js` (sin librería `dotenv`).
- Puerto 3000 ocupado → `taskkill /F /IM node.exe`.
- Probar login limpio en ventana de incógnito (localStorage puede tener sesión vieja).
- El descuento de stock en `pedidos.js` (al confirmar un pedido) consulta `producto_insumos`, pero esa tabla tiene RLS activado sin políticas — con la anon key la consulta siempre devuelve vacío, así que el descuento de stock **no está funcionando realmente**. Se resuelve junto con el punto de seguridad de abajo (pasar el backend a la service_role key).

## Seguridad

- ✅ **JWT_SECRET rotado** (2026-09-03) — el valor viejo, expuesto en el historial de GitHub, ya no sirve para firmar ni validar tokens. Está solo en el `.env` local (gitignored).
- ✅ **Cliente Supabase centralizado** en `rutas/db.js`, listo para preferir `SUPABASE_SERVICE_KEY` en cuanto exista.
- ⏳ **Bloqueado — falta la service_role key del usuario**: `.env` tiene una línea comentada `SUPABASE_SERVICE_KEY=` lista para completar (Dashboard de Supabase → Project Settings → API → `service_role` secret). En cuanto esté, se aplica la migración que habilita RLS en las 7 tablas sin políticas (`usuarios`, `productos`, `insumos`, `pedidos`, `pedido_items`, `cobros`, `incidencias` — `producto_insumos` ya la tiene). Con RLS activo y sin políticas, la anon key (la que quedó expuesta en GitHub) no puede leer ni escribir nada vía la API de Supabase, y el backend sigue funcionando porque `service_role` bypasea RLS por diseño. Esto también arregla el descuento de stock roto (ver nota técnica abajo).
- La anon key en sí no se rotó (no hay endpoint para eso vía las herramientas disponibles) — no hace falta: una vez con RLS activo, esa key queda inutilizable para terceros aunque siga expuesta en el historial viejo de git.
- `.env` y `node_modules/` estaban commiteados en git y ya se habían subido a GitHub antes de agregar `.gitignore` (corregido el 2026-09-03). El commit viejo en el historial sigue teniendo los valores originales — reescribir el historial de git (`git filter-repo` + force-push) es una opción para borrarlos del todo, pero es una operación destructiva que no se hizo sin pedir permiso explícito.

## Credenciales de desarrollo (seed)

| Rol | Email | Password |
|-----|-------|----------|
| Propietario | admin@burgerpoint.com | admin1234 |
| Caja (María) | caja@burgerpoint.com | test1234 *(reseteada para pruebas el 2026-09-03)* |
| Cocina (Carola) | cocina@burgerpoint.com | test1234 *(reseteada para pruebas el 2026-09-03)* |
| Reparto (Juan) | reparto@burgerpoint.com | test1234 *(reseteada para pruebas el 2026-09-03)* |
