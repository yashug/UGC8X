# CAPTURE-TEST.md

Proof that automatic prompt/response capture is installed and firing, per step 4 of
the 8x agent capture setup.

## Tool and model

| | |
|---|---|
| Tool | Claude Code v2.1.220 (CLI, running inside the VS Code extension) |
| Model | `claude-opus-5` (Opus 5) — **one model, planning and executing**. No separate planner. |
| Author | `yashug` |
| Platform | macOS (Darwin 25.5.0) |

If I switch models mid-build it will be visible: every log entry carries its own
`model:` line, read from the transcript rather than assumed.

## Mechanism

Claude Code has a first-class hooks system: shell commands bound to lifecycle
events, configured in settings and executed by the harness, not by the model. Two
events are wired here:

| Event | Fires | Purpose |
|---|---|---|
| `UserPromptSubmit` | the instant a prompt is submitted | logs the prompt verbatim |
| `Stop` | end of turn, receives `transcript_path` on stdin | logs the final response |

Nothing is manual. There is no step I have to remember.

**Config file changed:** [.claude/settings.json](.claude/settings.json)

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command",
      "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/agent_capture.py\" prompt",
      "timeout": 30 }] }],
    "Stop": [{ "hooks": [{ "type": "command",
      "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/agent_capture.py\" response",
      "timeout": 30 }] }]
  }
}
```

**Script:** [.claude/hooks/agent_capture.py](.claude/hooks/agent_capture.py)

Both hooks receive a JSON payload on stdin. `UserPromptSubmit` carries the raw
`prompt`; `Stop` carries `transcript_path`, pointing at the session's JSONL
transcript under `~/.claude/projects/`. The script reads that transcript and
extracts **only** the final assistant text of the turn:

- walks the transcript backwards from the end, collecting `text` blocks
- stops at the first `tool_use` block or the first `user` row — that boundary is
  what separates the final answer from the intermediate steps
- drops `thinking` blocks entirely
- drops `isSidechain: true` rows, so subagent chatter never enters the log

So the log holds the prompt and the answer, and nothing in between. The hook never
blocks a turn: every failure path writes to `.agent-logs/.capture-errors.log` and
still exits 0.

## Where the canaries landed

Two canaries, two **separate** sessions, neither of them the session that installed
the hook — that was the point of the test.

| Canary | Log file | Session |
|---|---|---|
| 1 | [.agent-logs/2026-09-08_09-41-49_fe6bd91b-bd29-4c19-a9b7-b34fddb1c411.md](.agent-logs/2026-09-08_09-41-49_fe6bd91b-bd29-4c19-a9b7-b34fddb1c411.md) | `fe6bd91b` |
| 2 | [.agent-logs/2026-09-08_09-42-47_d4613783-0c94-4959-8826-c450213202c3.md](.agent-logs/2026-09-08_09-42-47_d4613783-0c94-4959-8826-c450213202c3.md) | `d4613783` |

### Canary 1, raw

Prompt and response, pasted exactly as they appear in the log. The response is long
because that session decided on its own to fan out into eight subagents to inspect
the repo — I did not ask it to. It is reproduced in full anyway; the log is not
tidied.

```
[LOG_ENTRY type=PROMPT num=1 session=fe6bd91b]
timestamp: 2026-09-08T09:41:49.509Z
model: claude-opus-5

CAPTURE TEST — 8x assignment, Yaswanth Gosula


[LOG_ENTRY type=RESPONSE num=1 session=fe6bd91b]
timestamp: 2026-09-08T09:42:33.334Z
model: claude-opus-5

All 8 agents completed successfully. Capture test results:

| # | Task | Result |
|---|---|---|
| 1 | `pwd` + last commit | `/Users/yaswanth.gosula/Documents/UGC`, `114965f Install automatic agent capture hooks` |
| 2 | Top-level `ls -la` | 3 entries, all hidden dirs: `.agent-logs/`, `.claude/`, `.git/` |
| 3 | `git status --short` | Modified `agent_capture.py`, `settings.json`; untracked `.agent-logs/` and `.claude/hooks/.capture-state.json` |
| 4 | `.agent-logs/` contents | 2 session logs, timestamp + session-UUID named; one matches the live session (5.6 KB and 481 B) |
| 5 | `settings.json` hooks | `UserPromptSubmit` → `agent_capture.py prompt`, `Stop` → `agent_capture.py response`, both `python3`, 30s timeout. Nothing else in the file |
| 6 | File count (excl. `.git`) | 6 files: 2 `.md`, 2 `.json`, 1 `.py`, 1 `.pyc` |
| 7 | `date` + `whoami` | Tue Sep 8 15:12:06 IST 2026, `yaswanth.gosula` |
| 8 | What `agent_capture.py` does | Logs verbatim prompts + final assistant text to per-session markdown with YAML frontmatter; drops thinking/tool-calls/subagent rows; polls up to 12s for transcript flush; dedupes repeat Stop fires via `.capture-state.json`; never blocks a turn (always exits 0, errors to `.capture-errors.log`) |

Two things worth noting from the run:

- **Capture is live and working** — agent 4 found this session's own log file already being written under the matching session UUID, and agent 3 observed `.capture-state.json` appearing mid-run (it wasn't in the session-start git snapshot).
- **Subagent output is not captured** — agent 8 confirmed sidechain rows are deliberately dropped by the hook. So the 8 subagent transcripts here won't appear in `.agent-logs/`; only my prompts and final responses will. If capturing subagent work was the point of this test, the hook doesn't currently do it.

One minor caveat: agent 6's file-type breakdown came from an aggregate command — its follow-up `find` to list individual filenames was denied by the permission system, so it inferred the mapping to filenames rather than observing it.
```

### Canary 2, raw

```
[LOG_ENTRY type=PROMPT num=1 session=d4613783]
timestamp: 2026-09-08T09:42:47.576Z
model: claude-opus-5

CAPTURE TEST — 8x assignment, Yaswanth Gosula (second session, no tools needed — just acknowledge)


[LOG_ENTRY type=RESPONSE num=1 session=d4613783]
timestamp: 2026-09-08T09:42:50.107Z
model: claude-opus-5

Acknowledged — capture test, 8x assignment, Yaswanth Gosula, second session. No tools run, nothing modified.
```

## What did not work first

Three things broke before this went green. The first canary ran against the broken
version, and that log is still in the repo:
[.agent-logs/2026-09-08_09-39-36_6901e239-....md](.agent-logs/2026-09-08_09-39-36_6901e239-bdce-433b-a777-ccd9792b4924.md).
It is left in deliberately — it is the evidence of the failure.

**1. Every response came back empty.** The first canary logged
`(no final text response for this turn)` five times over, even though the session
had clearly answered. My first assumption was that the backwards-walk extractor was
wrong. It was not — replaying it against the same transcript *after* the session
ended returned the full response. The actual cause was a **race**: the `Stop` hook
fires and reads the transcript before Claude Code has flushed the final assistant
message to disk. In one case the hook wrote its entry 38 ms before the message it
was looking for was appended. Fixed by polling (`await_response`) until a response
newer than the pending prompt appears, up to a 12 s budget, with the hook timeout
raised from 15 s to 30 s to cover it.

**2. Task notifications were being logged as prompts.** `UserPromptSubmit` also
fires for turns the harness starts by itself — a background agent reporting back,
for instance. The first canary log has four `<task-notification>` XML blobs sitting
in the record as if I had typed them. Fixed by skipping auto-injected prompts, and
by attributing the text those turns produce to the human prompt that actually
caused it (which is why canary 1 shows several `RESPONSE num=1` entries — each was
a genuine end-of-turn as agents reported in, and all of them are kept).

**3. I nearly put a `.gitignore` inside `.agent-logs/`.** The hook keeps a small
dedupe state file, and my first instinct was to ignore it in place. That directory
ships with the repo and should contain logs and nothing else, so the state file
moved to `.claude/hooks/.capture-state.json` and the `.gitignore` was deleted.
`.agent-logs/` is not ignored anywhere.

## One known limitation, stated plainly

The `model:` on a log entry is read from the transcript's most recent assistant
message. On the very first prompt of a brand-new session there may be no assistant
message yet; in that case the prompt is written with `model: pending` and the `Stop`
hook substitutes the real model name once it is known. That placeholder
substitution is the only rewrite the script ever performs. **No captured prompt or
response text is ever modified after it is written.**
