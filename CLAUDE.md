# Burger Point — Sistema de Gestión

Analista/Desarrollador: Pedro. Stack: Node.js · Express 4 · Supabase (PostgreSQL, São Paulo) · Railway (deploy pendiente).

## Estado general: Fase 2 activa (Parte 5 en curso, Parte 6 pendiente)

| # | Parte | Estado |
|---|-------|--------|
| 1 | Configuración inicial (Node, GitHub, Supabase, tablas) | ✅ Completada |
| 2 | Servidor base + Login (Express 4, JWT, roles) | ✅ Completada |
| 3 | Panel del propietario (estadísticas, alertas) | ✅ Completada |
| 4 | Módulo de Pedidos (caja, carrito, menú) | ✅ Completada |
| 5 | Vista de Cocina + Reparto | 🔶 En curso |
| 6 | Módulo de Cobros + Deploy a Railway | ⏳ Pendiente |

## Estructura

```
server.js            # carga .env manual (fs.readFileSync, sin dotenv), monta rutas, sirve public/
rutas/
  auth.js            # POST /api/auth/login
  panel.js           # GET /api/panel (estadísticas + alertas)
  pedidos.js         # GET/POST/PATCH /api/pedidos
  productos.js       # GET/POST /api/productos
  incidencias.js     # POST /api/incidencias (BR-04)
  cobros.js          # /api/cobros — PENDIENTE de implementar
public/
  index.html         # login
  panel.html          # propietario/encargado
  caja.html            # caja/encargado
  cocina.html          # cocina
  reparto.html         # PENDIENTE de crear
```

## Base de datos (Supabase)

Tablas activas: `usuarios` (roles + bcrypt), `productos` (7 items), `insumos` (stock + umbral mínimo), `pedidos`, `pedido_items`, `cobros`, `incidencias`.

Cada ruta crea su propio cliente Supabase con `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY)` por request.

## Próximos pasos (orden)

**Parte 5:**
1. Probar `cocina.html` con el servidor corriendo — pedidos activos con temporizador
2. Probar botones "Iniciar preparación" / "Listo para entregar" en `rutas/pedidos.js`
3. Probar botón de error → registra en `incidencias`
4. Crear `public/reparto.html` — entregas del turno con estado de cobro
5. Prueba integral: caja → cocina → reparto

**Parte 6:**
1. Implementar `rutas/cobros.js` (efectivo/transferencia vinculado a pedido)
2. Formulario de cobro en `caja.html` al confirmar entrega
3. Alerta de transferencia sin confirmar a los 30 min (`rutas/panel.js`)
4. Crear usuarios de equipo (caja, cocina, reparto) vía SQL en Supabase
5. Conectar repo a Railway, configurar variables de entorno, deploy

## Notas técnicas conocidas

- Usar **CMD**, no PowerShell, para `npm`/`node` (bloqueo de scripts de PowerShell en este entorno).
- Express fijado en v4 — Express 5 rompía el ciclo de vida del servidor.
- `.env` se carga manualmente en `server.js` (sin librería `dotenv`).
- Puerto 3000 ocupado → `taskkill /F /IM node.exe`.
- Probar login limpio en ventana de incógnito (localStorage puede tener sesión vieja).

## Seguridad — pendiente de acción del usuario

`.env` y `node_modules/` estaban commiteados en git y ya se subieron a GitHub antes de agregar `.gitignore` (corregido el 2026-09-03, quedan sin trackear desde ahora). El commit anterior en el historial todavía contiene `SUPABASE_KEY` y `JWT_SECRET` — rotar ambos desde el dashboard de Supabase (Project Settings → API) y generar un `JWT_SECRET` nuevo es responsabilidad del usuario.

## Credenciales de desarrollo (seed)

Propietario: `admin@burgerpoint.com` / `admin1234` → `panel.html`. Caja/Cocina/Reparto: por crear (Parte 6.4).
