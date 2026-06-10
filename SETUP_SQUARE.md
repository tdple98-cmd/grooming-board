# Square Bookings sync (Phase 2 / M3)

Pull Square Appointments into Supabase `dogs` + `appointments`. Times shown in **Australia/Melbourne** (AEST/AEDT).

## Architecture

```
Staff browser (Vercel app)
  → reads appointments from Supabase (M1)
  → optional: POST /api/square/sync (manual sync button)

Vercel serverless /api/square/sync
  → Square Bookings API (token server-side only)
  → upsert dogs + appointments via Supabase service role
```

**Never** put the Square access token in the frontend or git.

---

## Prerequisites

| Step | Status |
|------|--------|
| Supabase schema run (`appointments.square_booking_id`) | Done |
| Staff auth working on Vercel | Done |
| **M1:** App loads/saves board data from Supabase (not `SEED`) | **Required before sync is visible** |
| Square sandbox onboarded to Appointments | You do this below |

---

## Step 1 — Secure your credentials

You shared sandbox credentials in chat. **Rotate the sandbox access token** in Square Developer Dashboard after setup, then use the new token only in env vars.

**Local:** add to `.env.local` (never commit):

```env
# Square (server-side only — do NOT prefix with VITE_)
SQUARE_ACCESS_TOKEN=your_sandbox_access_token
SQUARE_ENVIRONMENT=sandbox
SQUARE_APPLICATION_ID=sandbox-sq0idb-...

# Supabase service role (server-side only — for sync writes)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

**Vercel → Settings → Environment Variables** (Production):

| Variable | Notes |
|----------|--------|
| `SQUARE_ACCESS_TOKEN` | Sandbox token now; production token later |
| `SQUARE_ENVIRONMENT` | `sandbox` or `production` |
| `SQUARE_APPLICATION_ID` | Optional, for reference |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `VITE_SUPABASE_URL` | Already set |
| `VITE_SUPABASE_ANON_KEY` | Already set |

Redeploy after adding server-side vars.

---

## Step 2 — Onboard Square sandbox to Appointments

1. [Square Developer Dashboard](https://developer.squareup.com/apps) → your app → **Sandbox test accounts**
2. Open the **Square Dashboard** for the sandbox seller (link from developer console)
3. Enable **Appointments** / subscribe to Appointments Plus (sandbox is free for testing)
4. Create at least one **bookable service** (e.g. Full Groom, Wash & Tidy)
5. Create **test bookings** for today/tomorrow in sandbox Appointments

Verify API access:

```bash
npm run test:square
```

Should list locations and today's bookings.

---

## Step 3 — Test sync locally (Vercel CLI)

Install Vercel CLI if needed: `npm i -g vercel`

```bash
vercel dev
```

Then (while logged in as staff, or with sync secret — see api):

```bash
curl -X POST http://localhost:3000/api/square/sync -H "Content-Type: application/json" -d "{\"date\":\"2026-06-09\"}"
```

Check **Supabase → Table Editor → appointments** for rows with `square_booking_id` set.

---

## Step 4 — Map Square → board fields

| Board field | Square source |
|-------------|---------------|
| `appointments.square_booking_id` | `booking.id` |
| `appointments.appointment_date` | `booking.start_at` → Melbourne date |
| `appointments.drop_time` | `start_at` → `h:mm a` Melbourne |
| `appointments.pick_time` | `start_at` + segment duration |
| `appointments.service` | Catalog item name from `appointment_segments` |
| `appointments.groomer` | Team member display name |
| `appointments.status` | `booked` (staff move status on board) |
| `dogs.owner_name` | Customer `given_name` + `family_name` |
| `dogs.phone` | Customer `phone_number` |
| `dogs.name` | Parsed from `customer_note` or `"Pet"` placeholder* |

\*Grooming salons often put the **dog name in the booking note**. Confirm how The Poodle Specialist enters pet names in Square and adjust `api/lib/mapBooking.js` if they use a custom field.

**Cancelled** Square bookings → appointment removed or status `noshow` (handled in sync).

---

## Step 5 — M1 frontend (must complete for board to show real data)

The board still uses `useState(SEED)`. After sync writes to Supabase, update `App.jsx` to:

1. Load today's `appointments` joined with `dogs`
2. Replace `update()` / `setStatus()` with Supabase `.update()`
3. Add a **Sync from Square** button (calls `POST /api/square/sync`)

Until M1 is done, sync will populate the database but the UI will still show sample dogs.

---

## Step 6 — Production cutover

1. Create **production** Square access token (not sandbox)
2. Set `SQUARE_ENVIRONMENT=production` in Vercel
3. Swap `SQUARE_ACCESS_TOKEN` to production value
4. Optional: Vercel Cron → `POST /api/square/sync` every 15 minutes

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Square API 401` | Wrong or expired access token |
| `Square API 403` | Sandbox not onboarded to Appointments |
| Empty bookings list | No sandbox appointments in date range; create test bookings |
| Sync OK but board unchanged | M1 not implemented — still on SEED data |
| `service_role` RLS errors | Use `SUPABASE_SERVICE_ROLE_KEY` in API only |
