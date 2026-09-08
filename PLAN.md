# UGC Video Chat — Build Plan

A chat app. One input, one thread. Send it a product URL, it works out what the
product is, assembles a short UGC-style video, and drops the URL back in the thread.
Everything else is a normal conversation.

Status: **plan agreed, not yet built.**

---

## 1. Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Routing | Tool-use, not a classifier | One model call decides chat vs render. No second system to drift. |
| Video style | Real product footage + human hook clip | Reads as UGC, and actually shows the product |
| Hook clip (free) | Pexels stock creator footage | Free for commercial use, instant, cannot fail |
| Hook clip (pro) | fal.ai (Kling / Veo) | Genuine AI generation, ~$0.30/clip |
| Chat model (free) | Gemini 2.5 Flash | Free, no card, 15 RPM / ~1500 req per day |
| Chat model (pro) | Claude Sonnet 5 / Opus 5 | Better routing and scriptwriting |
| Render flow | One-shot, streamed visibly | Fires on the first message; brief and script stream into the thread while it renders |
| Render host | GitHub Actions worker | Genuinely free, no AWS account, no card |
| Deploy | Vercel, persisted | Graders can open a URL and use it |
| Design | Stark and minimal | The video card is the only colour on the page |

**Cost per video: $0.00 on the free lane. ~$0.35 on the pro lane.**

---

## 2. The core idea: two lanes, one pipeline

Every external capability sits behind a small interface. One env var picks the lane.
This is what makes "free now, paid later" a config change rather than a rewrite, and
it is what lets the pipeline degrade one capability at a time instead of failing whole.

```ts
// lib/providers/registry.ts
export const providers = {
  llm:   pick(GeminiFlash,       ClaudeSonnet),
  hook:  pick(PexelsStockClip,   FalVideoGen),
  voice: pick(FreeTts,           ElevenLabsTimestamped),
  shots: pick(OgImageAndMshots,  HeadlessCapture),
}
// every provider implements isAvailable() + one typed method
```

| Capability | Free lane (default) | Pro lane (`PROVIDER_TIER=pro`) |
|---|---|---|
| Chat + script | Gemini 2.5 Flash | Claude Sonnet 5 / Opus 5 |
| Read the site | `fetch` + Readability, `r.jina.ai` fallback | Firecrawl |
| Product shots | `og:image` + page `<img>` + free screenshot service | Headless Chrome |
| Hook clip | Pexels stock | fal.ai Kling / Veo |
| Voiceover | FreeTTS / Gemini TTS | ElevenLabs with word timestamps |
| Captions | Scene-level timing, derived from our own script | Word-level karaoke |
| Render | Remotion on GitHub Actions | identical |
| Storage / DB / Queue | R2 / Neon / Inngest — all free tier | identical |

Captions deliberately derive their timing from the script we already control, so they
work on any voice provider and merely *improve* when the provider returns timestamps.
Never a hard dependency.

---

## 3. Pipeline

```
message
  └─ Gemini + generate_ugc_video tool ──► streamed chat reply       ~1s
                          └─ tool call ──► Inngest job, 7 durable steps:

     1. fetch      plain GET, browser UA. Thin-page detection -> r.jina.ai fallback
     2. extract    title, og:image, headings, features, proof points, palette, <img> set
     3. brief      LLM -> ProductBrief (Zod validated)        ──► streamed to thread
     4. script     LLM -> 5 scenes, VO + on-screen text + visual directive, Zod validated
                                                              ──► streamed to thread
     5. assets     voiceover ∥ hook clip ∥ product screenshots (parallel)
     6. render     dispatch GitHub Actions -> Remotion -> R2
     7. deliver    public URL posted as a new assistant message
```

Each numbered step is one durable Inngest step. That buys per-stage retries for free,
and the step boundaries *are* the progress UI — no separate progress bookkeeping.

### Why the steps map to the UX

The user chose "show the brief and script as they land". Steps 3 and 4 produce exactly
the two artefacts worth reading, and they complete inside ~10s while the render takes
another two minutes. The wait is filled with real substance, and it proves the pipeline
is genuinely reading the site rather than returning something canned.

---

## 4. The render worker (the one genuinely tricky part)

Vercel functions cannot reliably finish a 25s Remotion render. GitHub Actions can, for free.

```
Inngest step 6
  ├─ upload render payload (script + asset URLs) to R2      # dispatch inputs cap at 64KB
  ├─ POST /actions/workflows/render.yml/dispatches { jobId, payloadUrl }
  └─ step.waitForEvent('render/completed', match: data.jobId, timeout: '10m')

.github/workflows/render.yml
  ├─ actions/cache: node_modules + ~/.cache/remotion (Chrome Headless Shell)
  ├─ npx remotion render UgcVideo --props=payload.json
  ├─ upload MP4 to R2 (S3-compatible)
  └─ POST /api/render-callback  { jobId, videoUrl, hmac }
        └─ verifies HMAC, sends Inngest event -> step 6 resumes
```

**Known tradeoffs, accepted:**
- ~40–90s of runner boot per render. Caching Chrome Headless Shell and `node_modules` is
  the main mitigation; expect ~2–3 min end to end rather than ~1 min on Lambda.
- No frame-level progress. Actions posts coarse stage updates instead
  (`installing` → `rendering` → `uploading`). The brief/script stream carries the wait.
- Needs a fine-grained PAT with Actions: write, stored in Vercel env.
- Public repo gets unlimited minutes; private gets 2,000/mo ≈ 660 renders. Fine either way.

---

## 5. Progress transport

Client polls `GET /api/jobs/[id]?cursor=<stageIndex>` every 1.5s and appends new stages.

Chosen over SSE deliberately: Vercel Hobby caps a function at 60s, so an SSE stream dies
mid-render and has to reconnect anyway. Polling is fewer moving parts and plan-independent.
SSE stays an easy upgrade — the endpoint already returns a stage cursor.

---

## 6. Data model (Neon + Drizzle)

```
conversations  id, title, createdAt
messages       id, conversationId, role, parts jsonb, createdAt
jobs           id, conversationId, messageId, url, status, tier,
               brief jsonb, script jsonb, assets jsonb, stages jsonb,
               videoUrl, error, createdAt, updatedAt
```

`jobs.stages` is an append-only array of `{ name, status, startedAt, endedAt, detail }`.
It is the single source of truth for the progress UI and survives a refresh.

---

## 7. Degradation matrix

The free lane must never hard-fail in a demo. Each row degrades independently.

| Failure | Behaviour |
|---|---|
| Site is a JS-only SPA, no text | `r.jina.ai` fallback, then ask the user to describe the product |
| URL 404s or times out | Bot says so plainly in chat and asks for another link |
| No `og:image`, no usable `<img>` | Fall back to typographic brand cards using the extracted palette |
| Pexels returns nothing relevant | Drop the hook clip, open on a text card instead |
| TTS unavailable | Captions + music bed only, and the bot says voiceover was skipped |
| Render times out | Job marked failed with the stage that broke, offer to retry |

---

## 8. Repo shape

```
app/    (chat)/page.tsx
        api/chat/route.ts            streaming + tool routing
        api/jobs/[id]/route.ts       progress cursor
        api/render-callback/route.ts HMAC-verified worker callback
        api/inngest/route.ts
lib/    providers/{registry,llm,hook,voice,shots}.ts
        product/{fetch,extract,brief}.ts
        ai/{schemas,script,prompts}.ts
        db/{schema,queries}.ts
        storage/r2.ts
remotion/  UgcVideo.tsx, scenes/{Hook,PhoneMockup,Proof,Cta}.tsx, Captions.tsx
inngest/   generate-video.ts
.github/workflows/render.yml
```

---

## 9. Milestones

Vertical slices, so there is something demonstrable at every step and the riskiest
component is isolated in M4.

| # | Deliverable | Demonstrates |
|---|---|---|
| M1 | Chat that talks. Gemini + tool routing, minimal UI, render stubbed | "hi" greets, "what can you do" pitches, a URL triggers |
| M2 | URL → brief → script, streamed into the thread | It genuinely reads the site |
| M3 | Assets + local Remotion render → MP4 on disk | A real video exists |
| M4 | GitHub Actions worker + R2 + callback | A real URL lands in chat |
| M5 | Vercel + Neon + Inngest, deployed | Anyone can use it |
| M6 | `/frontenddesign` pass | It looks like a product |

---

## 10. Setup checklist

All free, no card required for any of them.

- [ ] Google AI Studio key (`GOOGLE_GENERATIVE_AI_API_KEY`)
- [ ] Pexels API key (`PEXELS_API_KEY`)
- [ ] Neon Postgres (`DATABASE_URL`)
- [ ] Cloudflare R2 bucket + token (`R2_*`)
- [ ] Inngest account (`INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`)
- [ ] GitHub PAT, Actions: write (`GH_RENDER_TOKEN`, `GH_RENDER_REPO`)
- [ ] Vercel project linked

Pro lane, later and optional: `ANTHROPIC_API_KEY`, `FAL_KEY`, `ELEVENLABS_API_KEY`.

---

## 11. Open, non-blocking

- App name — needed for the header and `<title>`
- Dark mode, or light only
- Follow-up edits ("make it funnier") — deferred out of v1, but `jobs` is shaped to allow
  a re-render from an existing brief without re-scraping

## 12. Noted risks

1. **Pexels forbids implying the depicted person endorses the product.** A stock person
   beside a product claim edges toward that. Acceptable for an assignment demo; a real
   product would need licensed creator footage or the AI lane.
2. **Gemini free tier may use the data to improve Google's products.** Not an issue for
   public marketing copy, worth knowing regardless.
3. **Remotion is free for individuals and companies up to 3 people.** Fine here. A 4+
   person company shipping this needs a $25/seat/mo licence.
