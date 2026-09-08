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
| M3 — footage, voiceover, local Remotion render | **done** |
| M1b — BYOK settings sheet, encrypted storage | **done** |
| M4 — GitHub Actions renderer → public URL | **built, not yet verified** |
| M5 — Vercel + Neon + Inngest | not started |
| M6 — design pass | not started |

A product message reads the site, works out what the product is, writes a script,
sources footage and a voiceover, and **renders an actual MP4** — around 90 seconds
end to end. The brief and script stream into the thread while it works; once the
chat turn ends the card polls for itself until the video appears.

Rendering happens locally by default. When the GitHub and R2 environment variables
are all present the render is instead handed to a GitHub Actions runner, which
uploads the finished mp4 to R2 and calls back. Missing any of them falls back to
local rendering rather than failing — see `isRemoteRenderConfigured()`.

**M4 has not been run end to end.** The code, workflow and callback auth are in
place and unit-tested, but this repo has no GitHub remote and no R2 credentials,
so a real dispatch has never happened. Treat it as unproven until it has.

## Running it

```bash
npm install
cp .env.example .env.local     # add a free Google AI Studio key
npm run dev
```

With no key at all the app still runs and tells you which free key to add.

## Deploying with remote rendering

1. Push this repo to GitHub (public keeps Actions minutes unlimited).
2. Create an R2 bucket and an API token.
3. Create a fine-grained PAT with **Actions: write** on the repo.
4. Generate a shared secret: `openssl rand -hex 32`.
5. Set it as the repo secret `RENDER_CALLBACK_SECRET`, along with `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`.
6. Set the same values plus `GH_RENDER_TOKEN`, `GH_RENDER_REPO` and
   `PUBLIC_APP_URL` in the app's environment.

The runner never receives a provider API key. Everything that needs one — the
voiceover especially — is produced by the app and uploaded to R2 first, so the
payload the runner sees is nothing but URLs.

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

**Scene length comes from the audio, not the script.** The model guesses how long
a line takes to say and is routinely a second or more out. Timing scenes off the
measured WAV duration is the difference between a video that works and one that
cuts the voiceover off mid-word. See `lib/media/wav.ts`.

**Images are measured before they are placed.** A portrait screenshot goes in a
phone frame; a landscape og:image is contained on a tinted ground. Putting the
latter in the former cropped CalAI's headline clean off the sides — so the aspect
ratio is read from the file header rather than assumed.

**A designed card beats a confidently wrong photo.** The first pass used any page
image it found and put a stock photo of a man at a harbour under the words
"100k+ 5-star ratings". Images now have to look like the product to be shown, and
anything below that bar falls through to type.

**Keys are checked before they are stored, and we say when we couldn't.** A bad
key should fail at paste time, not two minutes into a render. But Pexels answers
a search identically with a valid key, a garbage key, or no key at all — an early
version happily accepted the string `obviously-not-a-real-key`. Validation now
reports whether it actually verified, and the UI says so.

**The render callback assumes the internet is hostile.** It is a public endpoint
that marks a job finished and attaches a video URL, so every request must carry an
HMAC of its own body. Without it, anyone could point your finished video at their
own file. Verified with a constant-time compare.

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
