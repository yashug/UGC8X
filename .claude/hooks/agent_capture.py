#!/usr/bin/env python3
"""
Automatic prompt/response capture for the 8x assignment.

Wired in .claude/settings.json to two Claude Code lifecycle events:
  UserPromptSubmit -> mode "prompt"    (fires the instant a prompt is submitted)
  Stop             -> mode "response"  (fires at end of turn, gets transcript_path)

Writes one markdown file per session to .agent-logs/.
Captures ONLY the verbatim prompt and the final assistant response.
Thinking blocks, tool calls and tool results are deliberately dropped.

This hook never blocks a turn: any failure is written to .agent-logs/.capture-errors.log
and the process still exits 0.
"""
import datetime
import glob
import json
import os
import re
import sys

AUTHOR = "yashug"
TOOL = "claude-code"


def repo_root():
    return os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()


def logs_dir():
    d = os.path.join(repo_root(), ".agent-logs")
    os.makedirs(d, exist_ok=True)
    return d


def now_iso():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + \
        f"{datetime.datetime.now(datetime.timezone.utc).microsecond // 1000:03d}Z"


def log_error(msg):
    try:
        with open(os.path.join(logs_dir(), ".capture-errors.log"), "a") as f:
            f.write(f"{now_iso()} {msg}\n")
    except Exception:
        pass


def read_transcript(path):
    """Return the transcript rows, ignoring anything unparseable."""
    rows = []
    if not path or not os.path.exists(path):
        return rows
    with open(path, "r", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return rows


def blocks(row):
    msg = row.get("message") or {}
    content = msg.get("content")
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    if isinstance(content, list):
        return content
    return []


def last_model(rows):
    """Most recent model actually used on the main thread."""
    for row in reversed(rows):
        if row.get("type") == "assistant" and not row.get("isSidechain"):
            model = (row.get("message") or {}).get("model")
            if model:
                return model
    return None


def final_response(rows):
    """
    The final assistant text of the turn: walk backwards from the end of the
    transcript collecting assistant text blocks, and stop at the first tool call
    or user/tool-result row. That boundary is what separates the final answer
    from the intermediate steps.
    """
    parts = []
    for row in reversed(rows):
        rtype = row.get("type")
        if row.get("isSidechain"):
            continue                      # subagent chatter, not our answer
        if rtype == "user":
            break                         # real prompt or a tool_result: turn boundary
        if rtype != "assistant":
            continue                      # attachment / ai-title / bookkeeping rows
        bs = blocks(row)
        if any(b.get("type") == "tool_use" for b in bs):
            break                         # anything before a tool call is intermediate
        for b in bs:
            if b.get("type") == "text" and b.get("text", "").strip():
                parts.append(b["text"].strip())
    return "\n\n".join(reversed(parts)).strip()


def session_file(session_id):
    matches = sorted(glob.glob(os.path.join(logs_dir(), f"*_{session_id}.md")))
    return matches[0] if matches else None


def create_session_file(session_id, model, ts):
    fname = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    path = os.path.join(logs_dir(), f"{fname}_{session_id}.md")
    date = ts[:10]
    short = session_id[:8]
    project = os.path.basename(repo_root())
    header = f"""---
session_id: {session_id}
date: {date}
author: {AUTHOR}
model: {model}
tool: {TOOL}
project: {project}
total_exchanges: 0
first_prompt_time: {ts}
last_prompt_time: {ts}
---

# Session Log - {date}

Session: `{short}` | Project: `{project}` | Author: `{AUTHOR}`

---

"""
    with open(path, "w") as f:
        f.write(header)
    return path


def update_frontmatter(path, model=None):
    with open(path, "r") as f:
        text = f.read()
    prompts = re.findall(r"^\[LOG_ENTRY type=PROMPT num=(\d+) ", text, re.M)
    times = re.findall(r"^\[LOG_ENTRY type=PROMPT num=\d+ .*?\]\ntimestamp: (\S+)", text, re.M)
    total = len(prompts)
    end = text.index("\n---\n", 4)
    fm, body = text[:end], text[end:]
    fm = re.sub(r"^total_exchanges: .*$", f"total_exchanges: {total}", fm, flags=re.M)
    if times:
        fm = re.sub(r"^last_prompt_time: .*$", f"last_prompt_time: {times[-1]}", fm, flags=re.M)
    if model:
        fm = re.sub(r"^model: .*$", f"model: {model}", fm, flags=re.M)
    with open(path, "w") as f:
        f.write(fm + body)


def next_num(path):
    with open(path, "r") as f:
        text = f.read()
    nums = [int(n) for n in re.findall(r"^\[LOG_ENTRY type=PROMPT num=(\d+) ", text, re.M)]
    return (max(nums) + 1) if nums else 1


def append_entry(path, kind, num, session_id, ts, model, body):
    with open(path, "a") as f:
        f.write(f"[LOG_ENTRY type={kind} num={num} session={session_id[:8]}]\n")
        f.write(f"timestamp: {ts}\n")
        f.write(f"model: {model}\n\n")
        f.write(body.rstrip() + "\n\n\n")


def resolve_pending_model(path, model):
    """
    A prompt is logged the moment it is submitted, before any assistant message
    for that turn exists, so on the very first prompt of a session the model is
    not yet knowable and is written as 'pending'. The Stop hook fills those in
    once the model is known. This is the only rewrite this script ever performs;
    no captured prompt or response text is ever modified.
    """
    with open(path, "r") as f:
        text = f.read()
    if "\nmodel: pending\n" not in text:
        return
    text = text.replace("\nmodel: pending\n", f"\nmodel: {model}\n")
    with open(path, "w") as f:
        f.write(text)


def mode_prompt(payload):
    session_id = payload.get("session_id") or "unknown-session"
    prompt = payload.get("prompt")
    if prompt is None:
        return
    ts = now_iso()
    rows = read_transcript(payload.get("transcript_path"))
    model = last_model(rows) or "pending"
    path = session_file(session_id) or create_session_file(session_id, model, ts)
    num = next_num(path)
    append_entry(path, "PROMPT", num, session_id, ts, model, prompt)
    update_frontmatter(path, model if model != "pending" else None)


def mode_response(payload):
    session_id = payload.get("session_id") or "unknown-session"
    path = session_file(session_id)
    if not path:
        return                            # no prompt logged for this session yet
    rows = read_transcript(payload.get("transcript_path"))
    model = last_model(rows) or "unknown"
    text = final_response(rows)
    if not text:
        text = "(no final text response for this turn)"
    with open(path, "r") as f:
        existing = f.read()
    nums = [int(n) for n in re.findall(r"^\[LOG_ENTRY type=PROMPT num=(\d+) ", existing, re.M)]
    done = [int(n) for n in re.findall(r"^\[LOG_ENTRY type=RESPONSE num=(\d+) ", existing, re.M)]
    pending = [n for n in nums if n not in done]
    if not pending:
        return                            # nothing awaiting a response
    num = max(pending)
    resolve_pending_model(path, model)
    append_entry(path, "RESPONSE", num, session_id, now_iso(), model, text)
    update_frontmatter(path, model)


def main():
    raw = sys.stdin.read()
    try:
        payload = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        log_error(f"bad payload: {e}: {raw[:500]}")
        return
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if mode == "prompt":
            mode_prompt(payload)
        elif mode == "response":
            mode_response(payload)
        else:
            log_error(f"unknown mode {mode!r}")
    except Exception as e:
        import traceback
        log_error(f"mode={mode} failed: {e}\n{traceback.format_exc()}")


if __name__ == "__main__":
    main()
    sys.exit(0)
