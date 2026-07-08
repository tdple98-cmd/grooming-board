# The Poodle Specialist — Grooming Board

Real-time kanban board for managing dog grooming appointments. Groomers track dogs through check-in → grooming → ready; owners see their dog's status and pick-up time.

## Stack
React 18 + Vite, Supabase (Auth + Realtime), Vercel edge functions (API).

## Run
- Dev: `npm run dev` (Vite on 5173)
- API: `npm run dev:api` (Vercel functions on 5173)
- Build: `npm run build`

## Key files
- **App.jsx** — kanban board UI, step/tag/groom definitions, photo galleries
- **api/\*** — edge functions (Supabase auth, dog records, grooming specs)
- **components/\*** — auth, forms, UI widgets
- **hooks/useBoard.js** — realtime sync from Supabase
- **contexts/AuthContext.jsx** — session state

## Color palette
`C` object in App.jsx. Never hardcode colors — reference `C.cream`, `C.gold`, etc.

## Data model
- **Dogs**: booked → checkedin → grooming → ready (or noshow)
- **Groom specs**: cut, coat, temperament, health (saved per dog)
- **Tags**: cut (gold), watch (rose), svc (green) — notes during grooming
- **Groomers**: Thanh, Wendy, Trang, Michelle, Lynn, Sandy, Fei, Claire

## Don't
- Don't hardcode colors or groomer names — use App.jsx constants
- Don't add state outside AuthContext/useBoard — sync with Supabase first
- Don't edit `public/` — static assets
