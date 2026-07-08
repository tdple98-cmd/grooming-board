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

## Cost optimization
- **Lean constants**: Colors, groomer list, step labels all in lib/constants.js
- **Split App.jsx**: Primitives in components/Primitives.jsx; helpers in lib/
  - When you read a file, Claude only loads imported dependencies
  - Example: fixing a button only reads Button component, not the full App
- **Profile context**: Run `/context` to see what gets loaded when you edit a file
- **Settings blocks**: .claude/settings.json blocks Square sync files, node_modules, etc.
