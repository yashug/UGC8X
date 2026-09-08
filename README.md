# UGC8X

A chat app. One input, one thread. Send it a product URL and it works out what the
product is, assembles a short UGC-style video, and drops the URL back in the thread.
Everything else is a normal conversation.

```
"hi"                                          → greets you
"what can you do?"                            → tells you
"I'm building CalAI: calai.app"               → opens a render job
```

## Status

| Milestone | State |
|---|---|
| M1 — chat, tool routing, job card, BYOK header | **done** |
| M1b — BYOK settings sheet, encrypted storage | next |
| M2 — URL → brief → script streamed into thread | not started |
| M3 — assets and local Remotion render | not started |
| M4 — GitHub Actions renderer → public URL | not started |
| M5 — Vercel + Neon + Inngest | not started |
| M6 — design pass | not started |

The render pipeline is **not connected yet**. A product message opens a job and
shows the card, and the assistant says plainly that nothing will render. It never
claims a video exists — see `RENDER_PIPELINE_CONNECTED` in `lib/ai/chat.ts`.

## Running it

```bash
npm install
cp .env.example .env.local     # add a free Google AI Studio key
npm run dev
```

With no key at all the app still runs and tells you which free key to add.

## Design notes

**Routing is tool-use, not a classifier.** One model call decides chat-vs-render.
"hi" gets a greeting because the model didn't call the tool, not because a second
system said so. See `lib/ai/chat.ts`.

**Tier is derived from keys, never configured.** There is no `PROVIDER_TIER` flag.
For each capability the best available key wins: the user's, then ours, then the
free default. Pasting a fal.ai key upgrades the hook clip and nothing else. See
`lib/providers/keys.ts`.

**The job card is a data part, not text.** It carries a stable id so the same card
can be rewritten in place as real pipeline stages complete.

## Commands

```bash
npm run dev        npm run build
npm test           npm run typecheck
```

Full architecture, tradeoffs and known risks: [PLAN.md](PLAN.md).
Agent capture setup for this build: [CAPTURE-TEST.md](CAPTURE-TEST.md).
