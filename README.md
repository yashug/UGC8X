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
| M3 — footage, voiceover, video assembled client-side | **done** |
| M1b — BYOK settings sheet, encrypted storage | **done** |
| ~~M4 — GitHub Actions renderer → public URL~~ | **removed** — see below |
| M5 — Vercel + Neon + Inngest | not started |
| M6 — design pass | not started |

A product message reads the site, works out what the product is, writes a script,
sources footage and a voiceover, and **renders an actual MP4** — around 90 seconds
end to end. The brief and script stream into the thread while it works; once the
chat turn ends the card polls for itself until the video appears.

**Nothing is rendered, stored, or remembered.** The video is assembled in the
browser by a Remotion Player, playing the same composition a server would have
rendered. The hook clip streams from Pexels' CDN, product imagery from the
product's own site, and the voiceover — the one asset the server has to generate,
because it needs an API key — is inlined into the response as a data URI.

The server keeps no state at all: no database, no object storage, no job store,
no session. There are two routes, `/api/chat` and `/api/keys`, and the second one
only validates a key and hands it straight back.

This replaced an earlier design that rendered an MP4 on a GitHub Actions runner
and stored it in R2. That whole path is gone: no object storage, no render
worker, no callback endpoint, no video files. It also removes the ~45 seconds of
encoding, so the video is watchable as soon as its assets exist.

**The trade is explicit: there is no MP4 and no shareable URL.** The original
brief asked for a video URL in the chat; a client-side video cannot have one.

## Running it

```bash
npm install
cp .env.example .env.local     # add a free Google AI Studio key
npm run dev
```

With no key at all the app still runs and tells you which free key to add.

## Deploying

There is nothing to provision. No database, no bucket, no queue, no worker.

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Set two environment variables:
   - `GOOGLE_GENERATIVE_AI_API_KEY` — free, no card, from
     [AI Studio](https://aistudio.google.com/apikey)
   - `PEXELS_API_KEY` — free, from [Pexels](https://www.pexels.com/api/)
3. Deploy.

Optional: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `FAL_KEY` upgrade individual
capabilities. Anyone can also paste their own keys in Settings, which stay in
their browser.

**On plan limits.** The whole pipeline runs inside one request. Measured at 39s
in the worst case observed (every voiceover refused) and roughly the same when
speech succeeds, against Vercel Hobby's 60s function cap. It fits, but not by
much — if you see timeouts, Pro with fluid compute lifts the ceiling. The bigger practical limit is Gemini's free tier —
a shared key is metered per minute and per day, so a public deployment will hit
it. That is exactly what the BYOK settings sheet is for.

## Known limitations

- Sites whose `og:image` is a logo rather than a screenshot produce a logo-heavy
  video. Linear is a good example. The fix is capturing the live site with a
  headless browser, which is the upgraded lane for product shots.
- Videos run 30-36s against a 25s target, because real speech is slower than the
  script's estimate. The script prompt should ask for tighter lines. Not yet fixed.
- One Gemini voice. ElevenLabs would bring word timings and karaoke captions.
- No MP4 and no shareable link, by design. Producing a file would mean either a
  server render or client-side WebCodecs encoding, which cannot load cross-origin
  assets without a proxy.
- Browser playback has been verified only through its data: the props, the build
  and the served audio. Open the app and watch one to confirm the picture.
- The voiceover travels inline, about 2MB of base64 per video. That is fine for
  one video in a thread and would need revisiting for a long conversation.

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

**Keys never reach the server's storage, because there isn't any.** They live in
the visitor's browser and ride along with each request. An earlier version
encrypted them server-side with AES-GCM and a session cookie, which was the right
answer while the render outlived the request — and became both unnecessary and
broken once nothing ran after the response. Deleting it was the fix.

**Keys are checked before they are saved, and we say when we couldn't.** A bad
key should fail at paste time, not two minutes into a render. But Pexels answers
a search identically with a valid key, a garbage key, or no key at all — an early
version happily accepted the string `obviously-not-a-real-key`. Validation now
reports whether it actually verified, and the UI says so.

**A guard catches the model claiming to act without acting.** Tool calling is not
perfectly reliable: on one run the model answered a message containing a URL with
"Working on that for you!" and never called the tool, leaving the user waiting for
a video that would never arrive. That contradiction is detectable — a promise, no
tool call, and a URL sitting in the message — so it is repaired. It never decides
that an ordinary message should render; it only fires once the model has already
said it is doing the thing.

**A silent video is never shipped quietly.** Voiceover failures used to be
swallowed by a bare `catch`, so a exhausted quota produced a completely silent
video with no log line, no warning and nothing said to the user. Failures are now
retried, reported on the card, and logged. Speech is also generated one scene at a
time rather than five at once, since concurrency was what tripped the rate limit.

**Free-tier quota is metered per model, so the pipeline spreads across models and
falls through them.** Chat routing and scriptwriting use different Gemini models,
and both scriptwriting and speech try a list in order, moving on when one reports
an exhausted quota. `gemini-2.5-flash-preview-tts` allows ten requests a day and
one video costs five, so a single model meant two videos and then silence. A live
run has already been rescued twice by this.

**A dead quota fails fast rather than burning the request budget.** Retrying every
remaining scene against an exhausted quota once took 117 seconds and produced
nothing — nearly twice the serverless timeout. The first quota refusal now stops
the rest, which brought the same run down to 39 seconds.

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
