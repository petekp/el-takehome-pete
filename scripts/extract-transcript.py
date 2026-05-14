#!/usr/bin/env python3
"""Extract a Claude conversation from the export JSON as Markdown."""
import json
import sys
from pathlib import Path


def fmt_ts(ts: str | None) -> str:
    if not ts:
        return ""
    return ts.replace("T", " ").replace("Z", " UTC").split(".")[0]


def render_human(msg: dict) -> list[str]:
    out: list[str] = []
    text = (msg.get("text") or "").strip()
    if text:
        out.append(text)
        out.append("")
    for att in msg.get("attachments") or []:
        name = att.get("file_name", "(unnamed)")
        size = att.get("file_size", "?")
        out.append(f"**Attachment:** `{name}` ({size} bytes)")
        out.append("")
        extracted = att.get("extracted_content")
        if extracted:
            out.append("<details><summary>Show extracted content</summary>")
            out.append("")
            ext = name.rsplit(".", 1)[-1] if "." in name else ""
            fence_lang = ext if ext in {"md", "py", "ts", "tsx", "js", "json", "css", "html"} else ""
            out.append(f"```{fence_lang}")
            out.append(extracted)
            out.append("```")
            out.append("")
            out.append("</details>")
            out.append("")
    for f in msg.get("files") or []:
        out.append(f"**File:** `{f.get('file_name', '(unnamed)')}` (uuid: {f.get('file_uuid', '?')})")
        out.append("")
    return out


def render_assistant(msg: dict) -> list[str]:
    out: list[str] = []
    blocks = msg.get("content") or []
    for b in blocks:
        t = b.get("type")
        if t == "text":
            text = (b.get("text") or "").strip()
            if text:
                out.append(text)
                out.append("")
        elif t == "thinking":
            thinking = (b.get("thinking") or "").strip()
            out.append("<details><summary>💭 Thinking</summary>")
            out.append("")
            # Quote each line so blockquote covers full thought
            for line in thinking.splitlines() or [""]:
                out.append(f"> {line}" if line else ">")
            out.append("")
            out.append("</details>")
            out.append("")
        elif t == "tool_use":
            name = b.get("name", "tool")
            integration = b.get("integration_name")
            label = f"🔧 Tool call — `{name}`"
            if integration:
                label += f" _(via {integration})_"
            out.append(f"<details><summary>{label}</summary>")
            out.append("")
            inp = b.get("input")
            if inp is not None:
                out.append("**Input:**")
                out.append("")
                out.append("```json")
                out.append(json.dumps(inp, indent=2, ensure_ascii=False))
                out.append("```")
                out.append("")
            out.append("</details>")
            out.append("")
        elif t == "tool_result":
            name = b.get("name", "tool")
            out.append(f"<details><summary>📥 Tool result — `{name}`</summary>")
            out.append("")
            inner = b.get("content") or []
            for c in inner:
                if c.get("type") == "text":
                    out.append("```")
                    out.append(c.get("text", ""))
                    out.append("```")
                    out.append("")
                else:
                    out.append(f"_(non-text result block: {c.get('type')})_")
                    out.append("")
            out.append("</details>")
            out.append("")
        else:
            out.append(f"_(unhandled content block type: {t})_")
            out.append("")
    return out


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: extract-transcript.py <input.json> <index> [output.md]", file=sys.stderr)
        return 2
    src = Path(sys.argv[1])
    idx = int(sys.argv[2])
    dest = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(f"docs/conversation-{idx}-transcript.md")

    data = json.loads(src.read_text())
    conv = data[idx]
    msgs = conv.get("chat_messages", [])

    lines: list[str] = []
    title = conv.get("name") or "(untitled)"
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"- **UUID:** `{conv.get('uuid')}`")
    lines.append(f"- **Created:** {fmt_ts(conv.get('created_at'))}")
    lines.append(f"- **Updated:** {fmt_ts(conv.get('updated_at'))}")
    lines.append(f"- **Messages:** {len(msgs)}")
    if conv.get("summary"):
        lines.append(f"- **Summary:** {conv['summary']}")
    lines.append("")
    lines.append("---")
    lines.append("")

    for i, m in enumerate(msgs, start=1):
        sender = m.get("sender", "?")
        ts = fmt_ts(m.get("created_at"))
        if sender == "human":
            lines.append(f"## [{i}] 👤 Human — {ts}")
            lines.append("")
            lines.extend(render_human(m))
        else:
            lines.append(f"## [{i}] 🤖 Assistant — {ts}")
            lines.append("")
            lines.extend(render_assistant(m))
        lines.append("---")
        lines.append("")

    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text("\n".join(lines))
    print(f"wrote {dest} ({dest.stat().st_size:,} bytes, {len(msgs)} messages)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
