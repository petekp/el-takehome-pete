#!/usr/bin/env python3
"""Extract a Claude Code session JSONL into readable Markdown.

Usage:
    extract-cc-session.py <session.jsonl> [output.md]
    extract-cc-session.py --all <project-dir> <output-dir>

Mirrors the output style of scripts/extract-transcript.py so Claude.ai and
Claude Code transcripts look consistent in the bundle.
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

SKIP_TYPES = {
    "file-history-snapshot",
    "queue-operation",
    "system",
    "last-prompt",
    "permission-mode",
}
STUB_BYTES = 1024  # files smaller than this are empty/aborted sessions


def fmt_ts(ts):
    if not ts:
        return ""
    return ts.replace("T", " ").replace("Z", " UTC").split(".")[0]


def slugify(text, maxlen=50):
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", text or "").strip().lower()
    s = re.sub(r"\s+", "-", s)[:maxlen].strip("-")
    return s or "session"


def render_user_content(content):
    """Render the message.content of a user entry. May be str or list of blocks."""
    out = []
    if isinstance(content, str):
        text = content.strip()
        if text:
            out.append(text)
            out.append("")
        return out
    if not isinstance(content, list):
        return out
    for b in content:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t == "text":
            text = (b.get("text") or "").strip()
            if text:
                out.append(text)
                out.append("")
        elif t == "tool_result":
            name = b.get("tool_use_id", "tool")[:8]
            err = " (error)" if b.get("is_error") else ""
            out.append(f"<details><summary>📥 Tool result{err}</summary>")
            out.append("")
            inner = b.get("content")
            if isinstance(inner, str):
                out.append("```")
                out.append(inner)
                out.append("```")
                out.append("")
            elif isinstance(inner, list):
                for c in inner:
                    if isinstance(c, dict) and c.get("type") == "text":
                        out.append("```")
                        out.append(c.get("text", ""))
                        out.append("```")
                        out.append("")
                    else:
                        out.append(f"_(non-text result block: {type(c).__name__})_")
                        out.append("")
            out.append("</details>")
            out.append("")
        else:
            out.append(f"_(unhandled user block: {t})_")
            out.append("")
    return out


def render_assistant(msg):
    out = []
    blocks = msg.get("content") or []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        t = b.get("type")
        if t == "text":
            text = (b.get("text") or "").strip()
            if text:
                out.append(text)
                out.append("")
        elif t == "thinking":
            thinking = (b.get("thinking") or "").strip()
            if not thinking:
                continue  # empty thinking blocks (signature-only) are noise
            out.append("<details><summary>💭 Thinking</summary>")
            out.append("")
            for line in thinking.splitlines():
                out.append(f"> {line}" if line else ">")
            out.append("")
            out.append("</details>")
            out.append("")
        elif t == "tool_use":
            name = b.get("name", "tool")
            out.append(f"<details><summary>🔧 Tool call — `{name}`</summary>")
            out.append("")
            inp = b.get("input")
            if inp is not None:
                out.append("```json")
                out.append(json.dumps(inp, indent=2, ensure_ascii=False))
                out.append("```")
                out.append("")
            out.append("</details>")
            out.append("")
        else:
            out.append(f"_(unhandled assistant block: {t})_")
            out.append("")
    return out


def render_attachment(entry):
    """Collapse SessionStart hook outputs and similar attachments into details."""
    inner = entry.get("attachment") or {}
    hook = inner.get("hookName") or inner.get("hookEvent") or "attachment"
    raw = inner.get("content") or inner.get("stdout") or ""
    if isinstance(raw, list):
        # content can be a list of {type:"text", text:"..."} blocks
        parts = []
        for c in raw:
            if isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
            elif isinstance(c, str):
                parts.append(c)
        content = "\n\n".join(parts)
    else:
        content = str(raw)
    if not content.strip():
        return []
    out = [f"<details><summary>📎 {hook}</summary>", ""]
    out.append("```")
    out.append(content)
    out.append("```")
    out.append("")
    out.append("</details>")
    out.append("")
    return out


def clean_first_prompt(text):
    """Strip caveat / command-name / command-message XML wrappers and return first real line."""
    if not text:
        return ""
    # Drop common Claude Code preamble tags
    cleaned = re.sub(
        r"<(local-command-caveat|local-command-stdout|local-command-stderr|command-name|command-message|command-args|stdin|system-reminder)>[\s\S]*?</\1>",
        "",
        text,
    )
    return cleaned.strip()


def extract_title_and_first_prompt(entries):
    title = None
    first_prompt = None
    for e in entries:
        if e.get("type") == "ai-title" and not title:
            title = e.get("aiTitle")
        if e.get("type") == "user" and not first_prompt:
            c = e.get("message", {}).get("content")
            text = c if isinstance(c, str) else (
                next((b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"), "")
                if isinstance(c, list) else ""
            )
            cleaned = clean_first_prompt(text)
            if cleaned:
                first_prompt = cleaned
        if title and first_prompt:
            break
    return title, first_prompt


def render_session(jsonl_path):
    entries = []
    for line in jsonl_path.read_text().splitlines():
        if not line.strip():
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    title, first_prompt = extract_title_and_first_prompt(entries)
    # Headline: prefer aiTitle, else first non-empty line of the cleaned first prompt.
    if title:
        headline = title
    elif first_prompt:
        first_line = next((ln.strip() for ln in first_prompt.splitlines() if ln.strip()), "")
        # Skip obvious auto-loaded content (skill bodies, file dumps)
        if first_line.startswith(("#", "Base directory", "<")):
            headline = f"Session {jsonl_path.stem[:8]}"
        else:
            headline = first_line[:80]
    else:
        headline = f"Session {jsonl_path.stem[:8]}"

    # Find first/last user-or-assistant timestamps
    timestamps = [e.get("timestamp") for e in entries if e.get("timestamp")]
    first_ts = timestamps[0] if timestamps else ""
    last_ts = timestamps[-1] if timestamps else ""

    # Count rendered messages (user + assistant only)
    msg_count = sum(1 for e in entries if e.get("type") in ("user", "assistant"))

    cwd = next((e.get("cwd") for e in entries if e.get("cwd")), "")

    lines = []
    lines.append(f"# {headline}")
    lines.append("")
    lines.append(f"- **Session:** `{jsonl_path.stem}`")
    lines.append(f"- **First message:** {fmt_ts(first_ts)}")
    lines.append(f"- **Last message:** {fmt_ts(last_ts)}")
    lines.append(f"- **Messages:** {msg_count}")
    if cwd:
        lines.append(f"- **cwd:** `{cwd}`")
    if title and first_prompt and title != first_prompt[:len(title)]:
        # show the first-prompt preview as a hint when title was AI-generated
        preview = first_prompt[:120].replace("\n", " ")
        lines.append(f"- **First prompt:** {preview}{'…' if len(first_prompt) > 120 else ''}")
    lines.append("")
    lines.append("---")
    lines.append("")

    idx = 0
    for e in entries:
        t = e.get("type")
        if t in SKIP_TYPES or t == "ai-title":
            continue

        ts = fmt_ts(e.get("timestamp"))

        if t == "user":
            content = e.get("message", {}).get("content")
            rendered = render_user_content(content)
            if not rendered:
                continue
            idx += 1
            is_meta = e.get("isMeta")
            label = "👤 Human" + (" _(meta)_" if is_meta else "")
            lines.append(f"## [{idx}] {label} — {ts}")
            lines.append("")
            lines.extend(rendered)
            lines.append("---")
            lines.append("")
        elif t == "assistant":
            msg = e.get("message", {})
            rendered = render_assistant(msg)
            if not rendered:
                continue
            idx += 1
            model = msg.get("model", "")
            label = f"🤖 Assistant" + (f" _({model})_" if model else "")
            lines.append(f"## [{idx}] {label} — {ts}")
            lines.append("")
            lines.extend(rendered)
            lines.append("---")
            lines.append("")
        elif t == "attachment":
            rendered = render_attachment(e)
            if not rendered:
                continue
            lines.extend(rendered)
            lines.append("---")
            lines.append("")

    return "\n".join(lines), first_ts, headline


def write_one(jsonl_path, out_path):
    md, first_ts, headline = render_session(jsonl_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(md)
    return out_path, first_ts, headline


def filename_for(jsonl_path, first_ts, headline):
    # e.g. 2026-05-13-1735-claude-please-help-me-extract.md
    if first_ts:
        try:
            dt = datetime.strptime(first_ts.split(".")[0].rstrip("Z"), "%Y-%m-%dT%H:%M:%S")
            stamp = dt.strftime("%Y-%m-%d-%H%M")
        except ValueError:
            stamp = "unknown-time"
    else:
        stamp = "unknown-time"
    return f"{stamp}-{slugify(headline)}.md"


def run_all(project_dir, out_dir):
    project_dir = Path(project_dir)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    written = []
    skipped = []

    for jsonl in sorted(project_dir.glob("*.jsonl")):
        size = jsonl.stat().st_size
        if size < STUB_BYTES:
            skipped.append((jsonl.name, f"stub ({size}B)"))
            continue
        try:
            md, first_ts, headline = render_session(jsonl)
        except Exception as exc:
            skipped.append((jsonl.name, f"error: {exc}"))
            continue
        # Skip rendered files that produced no real messages
        if "## [1]" not in md:
            skipped.append((jsonl.name, "no rendered messages"))
            continue
        fname = filename_for(jsonl, first_ts, headline)
        out_path = out_dir / fname
        # de-dupe filename collisions
        if out_path.exists():
            stem = out_path.stem
            i = 2
            while (out_dir / f"{stem}-{i}.md").exists():
                i += 1
            out_path = out_dir / f"{stem}-{i}.md"
        out_path.write_text(md)
        written.append((jsonl.name, out_path.name, len(md)))

    print(f"\nWrote {len(written)} transcript(s) to {out_dir}/")
    for src, dst, n in written:
        print(f"  {dst}  ({n:,} bytes)  ← {src}")
    if skipped:
        print(f"\nSkipped {len(skipped)}:")
        for name, reason in skipped:
            print(f"  {name}  — {reason}")


def main():
    args = sys.argv[1:]
    if len(args) >= 1 and args[0] == "--all":
        if len(args) < 3:
            print("usage: extract-cc-session.py --all <project-dir> <out-dir>", file=sys.stderr)
            return 2
        run_all(args[1], args[2])
        return 0
    if len(args) < 1:
        print(__doc__, file=sys.stderr)
        return 2
    src = Path(args[0])
    dest = Path(args[1]) if len(args) > 1 else Path(f"docs/{src.stem}.md")
    out_path, first_ts, headline = write_one(src, dest)
    size = out_path.stat().st_size
    print(f"wrote {out_path} ({size:,} bytes) — {headline}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
