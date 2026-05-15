#!/usr/bin/env python3
"""Convert a Claude.ai chat export JSON to evaluator-oriented Markdown.

Keeps only user-visible user and assistant text. Drops thinking traces,
tool_use / tool_result blocks, and per-message UUIDs. By default takes the
first conversation in the array (typical when one thread was exported alongside
unrelated short chats).

Usage:
  conversation-export-to-eval-md.py <export.json> [output.md] [--index N]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def fmt_ts(ts: str | None) -> str:
    if not ts:
        return ""
    return ts.replace("T", " ").replace("Z", " UTC").split(".")[0]


def human_text(msg: dict) -> str:
    t = (msg.get("text") or "").strip()
    if t:
        return t
    for b in msg.get("content") or []:
        if isinstance(b, dict) and b.get("type") == "text":
            x = (b.get("text") or "").strip()
            if x:
                return x
    return ""


def assistant_text(msg: dict) -> str:
    parts: list[str] = []
    for b in msg.get("content") or []:
        if not isinstance(b, dict) or b.get("type") != "text":
            continue
        x = (b.get("text") or "").strip()
        if x:
            parts.append(x)
    return "\n\n".join(parts)


def human_attachments_note(msg: dict) -> str:
    lines: list[str] = []
    for att in msg.get("attachments") or []:
        name = att.get("file_name", "(unnamed)")
        lines.append(f"*(Attachment: `{name}`)*")
    for f in msg.get("files") or []:
        fn = f.get("file_name")
        if fn:
            lines.append(f"*(File reference: `{fn}`)*")
    return "\n".join(lines)


def render(conv: dict, src_name: str, bundle_note: str | None) -> tuple[str, int, int]:
    msgs = conv.get("chat_messages", [])
    lines: list[str] = []
    lines.append("# Conversation transcript")
    lines.append("")
    lines.append(f"**Thread:** {conv.get('name') or '(untitled)'}  ")
    lines.append(f"**Exported from:** `{src_name}`  ")
    lines.append(f"**Started:** {fmt_ts(conv.get('created_at'))}  ")
    lines.append(f"**Ended:** {fmt_ts(conv.get('updated_at'))}  ")
    lines.append(f"**Messages in export:** {len(msgs)}  ")
    lines.append("")
    lines.append(
        "*Omitted for readability: extended assistant reasoning (`thinking`), tool "
        "invocations, tool results, block signatures, and sub-second timestamp "
        "precision.*"
    )
    if bundle_note:
        lines.append("")
        lines.append(bundle_note)
    lines.append("")
    lines.append("---")
    lines.append("")

    display_turn = 0
    skipped_assistant = 0
    for m in msgs:
        sender = m.get("sender", "")
        ts = fmt_ts(m.get("created_at"))
        if sender == "human":
            body = human_text(m)
            att = human_attachments_note(m)
            if not body and not att:
                continue
            display_turn += 1
            lines.append(f"## Turn {display_turn} — User ({ts})")
            lines.append("")
            if body:
                lines.append(body)
                lines.append("")
            if att:
                lines.append(att)
                lines.append("")
        else:
            body = assistant_text(m)
            if not body:
                skipped_assistant += 1
                continue
            display_turn += 1
            lines.append(f"## Turn {display_turn} — Claude ({ts})")
            lines.append("")
            lines.append(body)
            lines.append("")
        lines.append("---")
        lines.append("")

    if skipped_assistant:
        lines.append("")
        lines.append(
            f"*({skipped_assistant} assistant message(s) in the export contained no "
            "user-visible reply text—only internal reasoning and/or tool use—and are "
            "omitted.)*"
        )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n", display_turn, skipped_assistant


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("json_path", type=Path)
    p.add_argument(
        "out_path",
        type=Path,
        nargs="?",
        default=None,
        help="Default: <json stem>.md next to JSON",
    )
    p.add_argument(
        "--index",
        type=int,
        default=0,
        help="Conversation index when the file is an array (default: 0)",
    )
    args = p.parse_args()
    src = args.json_path
    dest = args.out_path or src.with_suffix(".md")

    data = json.loads(src.read_text())
    extra_threads = 0
    bundle_note = None
    if isinstance(data, list):
        extra_threads = max(0, len(data) - 1)
        if args.index < 0 or args.index >= len(data):
            print(f"index {args.index} out of range (0..{len(data) - 1})", file=sys.stderr)
            return 2
        conv = data[args.index]
        if extra_threads:
            bundle_note = (
                f"*The export file contained {len(data)} conversation(s); this document "
                f"includes only index **{args.index}** ({conv.get('name', '(untitled)')}). "
                "Other threads are omitted.*"
            )
    elif isinstance(data, dict) and "chat_messages" in data:
        conv = data
    else:
        print("Unrecognized JSON shape", file=sys.stderr)
        return 2

    md, turns, skipped = render(conv, src.name, bundle_note)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(md)
    print(
        f"wrote {dest} ({dest.stat().st_size:,} bytes) — "
        f"{turns} turns rendered, {skipped} assistant message(s) skipped"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
