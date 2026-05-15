#!/usr/bin/env python3
"""Clean `extract-transcript.py`-style Markdown: drop thinking/tool <details>,
shorten attachment dumps, optionally collapse embedded brief+PRD into doc links.

Usage:
  clean-claude-export-md.py <export.md> [--write-prd path] [--brief-md path]

Defaults for this repo:
  --write-prd docs/prd-in-context-learning-prototype.md
  --brief-md docs/exercise-brief.md
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

DETAILS_RE = re.compile(r"<details>[\s\S]*?</details>", re.IGNORECASE)
MSG_START_RE = re.compile(r"^## \[(\d+)\] (👤 Human|🤖 Assistant) — (.+)$", re.MULTILINE)
FILE_LINE_RE = re.compile(r"^\*\*File:\*\*.*$", re.MULTILINE)
PRD_START = "# PRD:"
BRIEF_ANCHOR = "\n---\n\n# Brief:"
NOTES_ANCHOR = "A few notes on the split:"


def strip_details(s: str) -> str:
    return DETAILS_RE.sub("", s)


def strip_file_lines(s: str) -> str:
    return FILE_LINE_RE.sub("", s)


def normalize_attachment_line(s: str) -> str:
    """Keep attachment mention; drop byte counts (minor noise)."""
    return re.sub(
        r"^\*\*Attachment:\*\* `([^`]+)` \(\d+ bytes\)\s*$",
        r"*(User attached `\1`; extracted file body omitted here.)*",
        s,
        flags=re.MULTILINE,
    )


def collapse_brief_prd_in_assistant(body: str, brief_name: str, prd_name: str) -> str:
    """Remove embedded Brief + PRD from a message; keep intro and trailing notes."""
    if PRD_START not in body or "# Brief:" not in body:
        return body
    idx_brief_block = body.find(BRIEF_ANCHOR)
    if idx_brief_block == -1:
        idx_brief_block = body.find("\n# Brief:")
        if idx_brief_block == -1:
            return body
    idx_notes = body.find(NOTES_ANCHOR)
    if idx_notes == -1:
        return body
    intro = body[:idx_brief_block].rstrip()
    tail = body[idx_notes:]
    bridge = (
        "\n\n---\n\n"
        f"*(The **design brief** and **implementation PRD** from this turn live in "
        f"[`{brief_name}`]({brief_name}) and [`{prd_name}`]({prd_name}) so this "
        "transcript stays readable.)*\n\n"
    )
    return intro + bridge + tail


def clean_body(body: str, *, is_assistant: bool, brief_md: str, prd_md: str) -> str:
    body = strip_details(body)
    body = strip_file_lines(body)
    body = normalize_attachment_line(body)
    if is_assistant:
        body = collapse_brief_prd_in_assistant(body, brief_md, prd_md)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def split_messages(text: str) -> list[tuple[int, str, str, str]]:
    """Returns (index, role, ts, body) for each message block."""
    matches = list(MSG_START_RE.finditer(text))
    out: list[tuple[int, str, str, str]] = []
    for i, m in enumerate(matches):
        msg_idx = int(m.group(1))
        role_raw = m.group(2)
        ts = m.group(3).strip()
        role = "human" if "Human" in role_raw else "assistant"
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        body = text[start:end]
        body = re.sub(r"^---\s*\n+", "", body)
        body = re.sub(r"\n+---\s*\n*$", "", body)
        out.append((msg_idx, role, ts, body.strip()))
    return out


def extract_prd(raw: str) -> str | None:
    if PRD_START not in raw:
        return None
    m = re.search(
        rf"^({re.escape(PRD_START)}[\s\S]*?)(?:\n---\s*\n\n{re.escape(NOTES_ANCHOR)})",
        raw,
        re.MULTILINE,
    )
    return m.group(1).rstrip() if m else None


def polish_prd(text: str) -> str:
    """Align PRD language with design brief (composer seeding = demo-only)."""
    intro = (
        "> **Companion:** Product intent and principles are in "
        "[`exercise-brief.md`](exercise-brief.md). This file is the "
        "implementation-facing spec from the same design session.\n\n"
        "> **Take-home prototype:** The starter app seeds `/new` with the canonical "
        "user message and attachments so evaluators can run the arc in one send. "
        "The brief still describes the north-star: in a shipped product, the "
        "composer stays purely the user’s space (no pre-filled prompt text).\n\n"
        "---\n\n"
    )
    text = intro + text.lstrip()

    text = text.replace(
        "- Pre-populated trigger message in the composer (one specific message; sending it fires the affordance)",
        "- Demo entry on `/new`: canonical trigger message and attachments are **seeded once on mount** so the evaluator can press send immediately (scaffolding only; not the shipped UX pattern — see brief)",
    )
    text = text.replace(
        "**Stubbed for the prototype:**\n"
        "- The affordance-firing logic. Pre-set trigger only.",
        "**Stubbed for the prototype:**\n"
        "- General affordance-firing / calibration logic beyond the seeded `/new` demo.",
    )
    text = text.replace(
        "To stub:\n\n"
        "- The affordance trigger. Pre-set: a specific message in the composer. Sending it fires the affordance. The general calibration logic is not built.",
        "To stub:\n\n"
        "- The affordance trigger beyond the demo seed. Only the `/new` seeded scenario is wired; broader “detect confusion” logic is not built.",
    )
    text = text.replace(
        "- Chat is open\n"
        "- The trigger message is pre-populated in the composer\n"
        "- The send affordance is visible\n\n"
        "The evaluator should be able to immediately understand: send this message, and see what happens.",
        "- Chat is open on `/new`\n"
        "- The canonical scenario is already in the composer (and attachments loaded) so a single send starts the arc\n"
        "- The send affordance is visible\n\n"
        "The evaluator should be able to immediately understand: press send, and see what happens.",
    )
    text = text.replace(
        "*Chat → structured exchange*: The user sends the trigger message.",
        "*Chat → structured exchange*: The user sends the trigger message (after optional edits; seeded text is a shortcut, not a requirement).",
    )
    return text


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("export_md", type=Path)
    ap.add_argument(
        "--write-prd",
        type=Path,
        default=Path("docs/prd-in-context-learning-prototype.md"),
    )
    ap.add_argument("--brief-md", type=str, default="exercise-brief.md")
    ap.add_argument("--prd-md", type=str, default="prd-in-context-learning-prototype.md")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    raw = args.export_md.read_text()
    title_m = re.search(r"^# (.+)$", raw, re.MULTILINE)
    title = title_m.group(1).strip() if title_m else "(untitled)"

    prd = extract_prd(raw)
    if prd and not args.dry_run:
        args.write_prd.parent.mkdir(parents=True, exist_ok=True)
        args.write_prd.write_text(polish_prd(prd) + "\n")
        print(f"wrote {args.write_prd} ({args.write_prd.stat().st_size:,} bytes)")

    messages = split_messages(raw)
    lines: list[str] = [
        "# Conversation transcript",
        "",
        f"**Thread:** {title}  ",
        f"**Source:** Claude.ai export, cleaned for submission (internal reasoning and tool traces removed).  ",
        "*Omitted:* assistant `thinking` blocks, tool calls/results, pasted file "
        "extracts, and per-file UUIDs. Embedded **Brief** and **PRD** from the final "
        f"assistant turn are linked as [`{args.brief_md}`]({args.brief_md}) and "
        f"[`{args.prd_md}`]({args.prd_md}).",
        "",
        "---",
        "",
    ]

    display_turn = 0
    skipped = 0
    for _msg_idx, role, ts, body in messages:
        cleaned = clean_body(
            body,
            is_assistant=(role == "assistant"),
            brief_md=args.brief_md,
            prd_md=args.prd_md,
        )
        if not cleaned:
            skipped += 1
            continue
        display_turn += 1
        who = "User" if role == "human" else "Claude"
        lines.append(f"## Turn {display_turn} — {who} ({ts})")
        lines.append("")
        lines.append(cleaned)
        lines.append("")
        lines.append("---")
        lines.append("")

    if skipped:
        lines.append(
            f"*({skipped} message(s) had no visible text after cleaning and were omitted.)*"
        )
        lines.append("")

    out = "\n".join(lines).rstrip() + "\n"
    if args.dry_run:
        print(f"dry-run: would write {len(out):,} chars, {display_turn} turns")
        return 0

    args.export_md.write_text(out)
    print(
        f"overwrote {args.export_md} ({len(out):,} bytes) — {display_turn} turns, "
        f"{skipped} skipped"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
