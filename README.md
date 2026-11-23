# Ledger
<<<<<<< HEAD
Ledger es una aplicación web para controlar gastos fijos, deudas, préstamos y próximos pagos mensuales.
=======

Control personal de **suscripciones**, **deudas** y **préstamos otorgados**. Minimalista, mobile-first, instalable como PWA.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind · Lucide · Recharts · Supabase (Postgres + Auth + RLS) · Resend · Vercel Cron.

## Estructura

```
ledger/
├─ supabase/schema.sql            # tablas, enums, índices, triggers, RPC y políticas RLS
├─ public/
│  ├─ manifest.json  sw.js  offline.html
│  └─ icon.svg  icon-192.png  icon-512.png  icon-maskable-512.png
├─ src/
│  ├─ middleware.ts               # protege rutas (sesión Supabase)
│  ├─ lib/                        # utils (fechas/moneda), tipos, clientes Supabase, refresh
│  ├─ components/                 # ui, app-shell (sidebar + bottom bar + FAB), campana,
│  │                              # formularios (pago, obligación, préstamo, abono), quick-add
│  └─ app/
│     ├─ login/                   # magic link o email+contraseña
│     ├─ auth/callback/route.ts
│     ├─ (app)/                   # Resumen · Obligaciones · Préstamos · Bitácora
│     └─ api/
│        ├─ cron/reminders/route.ts   # correo diario con vencimientos (Resend)
│        └─ export/route.ts           # CSV / JSON
├─ vercel.json                    # cron diario 13:00 UTC (07:00 El Salvador)
└─ .env.example
```

## Puesta en marcha (local)

### 1. Supabase
1. Crea un proyecto en <https://supabase.com>.
2. **SQL Editor → New query**, pega todo `supabase/schema.sql` y ejecuta. Es idempotente en lo razonable (usa `if not exists` / `drop ... if exists`).
3. **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` (luego tu dominio de producción).
   - *Redirect URLs*: añade `http://localhost:3000/auth/callback` y `https://TU-DOMINIO/auth/callback`.
4. **Authentication → Providers → Email**: deja activo. Para uso personal puedes desactivar "Confirm email" si usas contraseña.
5. **Project Settings → API**: copia `Project URL`, `anon public` y `service_role`.

### 2. Variables de entorno
```bash
cp .env.example .env.local
```
| Variable | Dónde se obtiene | Notas |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase › API | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase › API | pública; la protege RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase › API | **solo servidor**, nunca con prefijo `NEXT_PUBLIC_` |
| `RESEND_API_KEY` | <https://resend.com/api-keys> | |
| `RESEND_FROM` | dominio verificado en Resend | con `onboarding@resend.dev` solo puedes enviarte a tu propio correo |
| `CRON_SECRET` | `openssl rand -hex 32` | protege `/api/cron/reminders` |
| `NEXT_PUBLIC_SITE_URL` | tu URL | se usa en el botón del correo |
| `APP_TIMEZONE` | opcional | por defecto `America/El_Salvador` |

### 3. Ejecutar
```bash
npm install
npm run dev        # http://localhost:3000
```
Crea tu cuenta en `/login` y empieza a registrar datos.

> El Service Worker solo se registra en producción (`npm run build && npm start`).

## Despliegue en producción (Vercel)

1. Sube el repo a GitHub y en Vercel: **Add New → Project → Import**.
2. En **Settings → Environment Variables** agrega todas las variables de la tabla (entornos *Production* y *Preview*). Usa `NEXT_PUBLIC_SITE_URL=https://tu-dominio`.
3. **Deploy.** `vercel.json` registra el cron automáticamente.
4. Vuelve a Supabase → *URL Configuration* y pon la URL de producción en *Site URL* y en *Redirect URLs*.
5. Verifica el cron manualmente:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" "https://tu-dominio/api/cron/reminders?dry=1"   # sin enviar
   curl -H "Authorization: Bearer $CRON_SECRET" "https://tu-dominio/api/cron/reminders"          # envía correos
   ```
   Sin el header devuelve `401`.
6. En Resend, verifica tu dominio (DNS SPF/DKIM) y cambia `RESEND_FROM` a `Ledger <avisos@tu-dominio>`.

**Horario del cron:** `0 13 * * *` = 13:00 UTC = 07:00 en El Salvador. El plan Hobby de Vercel permite cron **una vez al día**, que es justo lo que se necesita.

## Instalar como app (PWA)

- **iOS (Safari):** Compartir → *Añadir a pantalla de inicio*.
- **Android (Chrome):** menú ⋮ → *Instalar aplicación*.

## Cómo funciona

- **Marcar como pagada:** llama a la función SQL `register_payment`, que en una sola transacción crea el registro en `payment_logs`, recalcula `next_due_date` según el ciclo y, si es pago único o la deuda ya se cubrió, pasa a `paid_off`.
- **Fecha/hora editable:** todos los formularios usan `datetime-local`, por defecto *ahora*, y se guardan en UTC. Editar un registro actualiza `updated_at` (trigger) y la bitácora muestra **(Editado)** cuando difiere de `created_at`.
- **Préstamos:** `amount_returned` y `status` se calculan solos por triggers a partir de `lent_repayments`; "Liquidar total" rellena el saldo pendiente.
- **Seguridad:** RLS en las 4 tablas (`user_id = auth.uid()`), `user_id` toma `auth.uid()` por defecto, y los anónimos no tienen permisos.

## Decisiones y límites a tener en cuenta

- `lent_repayments` incluye `user_id` (no estaba en el diseño original) para simplificar RLS.
- Eliminar un pago de la bitácora **no** revierte la `next_due_date` de la obligación (la app lo avisa al confirmar).
- Los KPI suman montos sin convertir monedas; está pensado para uso en una sola moneda (USD por defecto).
- Notificaciones: implementadas por **correo (Resend)** y campana interna. El Service Worker ya trae los handlers de `push`, pero **no** hay suscripción ni envío Web Push todavía (requiere claves VAPID y una tabla de suscripciones).
- Tras `register_payment`, si una cuota estaba muy atrasada, avanza **un** ciclo por pago registrado.

## Añadir shadcn/ui (opcional)

Los componentes de `src/components/ui.tsx` siguen la misma convención de tokens (`--background`, `--border`, …). Si prefieres shadcn completo: `npx shadcn@latest init` y reemplaza los imports de `@/components/ui`.
>>>>>>> d25190e (feat: add payments chart component for visualizing monthly payments)
