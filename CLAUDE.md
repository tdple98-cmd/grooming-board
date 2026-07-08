# Project: <NAME>

<!--
  KEEP THIS FILE UNDER ~200 LINES. It loads into context on EVERY session,
  so every line here is paid for on every message. Only put things Claude
  can't infer from the code itself. Move workflow-specific playbooks
  (PR review steps, migration runbooks, deploy steps) into Skills instead —
  Skills load on-demand only when invoked.
-->

## What this is
<One or two sentences: what the product does and who it's for.>

## Stack
<Languages, frameworks, key services. e.g. "TypeScript + Next.js, Postgres, Stripe.">

## How to run
- Install: `<command>`
- Dev server: `<command>`
- Tests: `<command>`

## Conventions that aren't obvious from the code
- <e.g. "All API responses go through `lib/respond.ts` — never return raw JSON.">
- <e.g. "Money is stored in cents as integers, never floats.">

## Don't
- <e.g. "Don't edit anything in `/generated` — it's built from the schema.">
- <e.g. "Don't add new dependencies without asking.">

## Compact instructions
When compacting, prioritize: current task state, unresolved bugs, and any
decisions we've made. Drop resolved tool output and passing-test logs.
