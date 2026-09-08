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
| M2 — URL → brief → script streamed into thread | **done** |
| M1b — BYOK settings sheet, encrypted storage | next |
| M3 — assets and local Remotion render | not started |
| M4 — GitHub Actions renderer → public URL | not started |
| M5 — Vercel + Neon + Inngest | not started |
| M6 — design pass | not started |

A product message now really does read the site, work out what the product is, and
write a 25-second script — streamed into the thread stage by stage. **Nothing
renders yet**: footage and voiceover are M3, the renderer is M4. The assistant is
told to say so and never to claim a video exists.

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

**The job card is a data part, not text.** It carries a stable id, so the pipeline
rewrites the same card in place as each stage lands — which is what fills the wait.

**The fetcher assumes the URL is hostile.** It comes from a stranger via a model and
is fetched server-side, so every redirect hop is DNS-resolved and screened against
private ranges — loopback, RFC1918, carrier-grade NAT, IPv6 unique-local, and
IPv4-mapped IPv6, which is the usual way `169.254.169.254` sneaks through. See
`lib/product/fetch.ts`.

**Proof points are copied, never invented.** The brief prompt forbids inventing a
statistic, and the script prompt forbids using one that is not in the brief. A
fabricated "5M users" would be worse than no number at all.

## Commands

```bash
npm run dev        npm run build
npm test           npm run typecheck
```

Full architecture, tradeoffs and known risks: [PLAN.md](PLAN.md).
Agent capture setup for this build: [CAPTURE-TEST.md](CAPTURE-TEST.md).
