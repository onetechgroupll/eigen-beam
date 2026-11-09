#!/usr/bin/env python3
"""Validate repository Markdown/YAML/JSON documentation assets.

Fast, dependency-light checker intended for local DevEx and docs-only CI.
It is deliberately fence-aware so example Markdown such as `![Alt](url)`
does not become a false-positive link failure.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

MD_GLOBS = [
    "*.md",
    "docs/*.md",
    "docs/tutorials/*.md",
    "examples/*.md",
    ".github/pull_request_template.md",
]
JSON_FILES = [
    "package.json",
    "tsconfig.json",
    ".mcp.json",
    "examples/mcp-create-deck.json",
    "examples/mcp-create-room.json",
]
YAML_GLOBS = [".github/**/*.yml", ".github/**/*.yaml"]
IGNORE_DIRS = {".git", "node_modules", "build", ".svelte-kit"}
LINK_RE = re.compile(r"!?\[[^\]]*\]\(([^)]+)\)")


def strip_fences(text: str) -> str:
    visible: list[str] = []
    in_fence = False
    for line in text.splitlines():
        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if not in_fence:
            visible.append(line)
    return "\n".join(visible)


def iter_files(globs: list[str]) -> list[Path]:
    files: list[Path] = []
    for pattern in globs:
        files.extend(ROOT.glob(pattern))
    return sorted({p for p in files if p.is_file() and not any(part in IGNORE_DIRS for part in p.parts)})


def validate_markdown(errors: list[str]) -> None:
    for path in iter_files(MD_GLOBS):
        rel = path.relative_to(ROOT)
        text = path.read_text(encoding="utf-8", errors="ignore")
        if text.count("```") % 2:
            errors.append(f"{rel}: unbalanced code fences")
        for line_no, line in enumerate(text.splitlines(), 1):
            if line.rstrip() != line:
                errors.append(f"{rel}:{line_no}: trailing whitespace")
                break
        visible = strip_fences(text)
        for match in LINK_RE.finditer(visible):
            href = match.group(1).strip()
            if href.startswith(("http://", "https://", "mailto:", "#")):
                continue
            target = href.split("#", 1)[0]
            if not target:
                continue
            if not (path.parent / target).resolve().exists():
                errors.append(f"{rel}: missing relative link target {href}")


def validate_json(errors: list[str]) -> None:
    for name in JSON_FILES:
        path = ROOT / name
        if not path.exists():
            continue
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:  # noqa: BLE001 - printed as user-facing validation error
            errors.append(f"{name}: invalid JSON: {exc}")


def validate_yaml(errors: list[str]) -> None:
    # Keep this checker dependency-light: validate only basic syntax shape here.
    # CI/local machines in this repo already use Ruby/Python for stricter spot-checks when needed.
    for path in iter_files(YAML_GLOBS):
        rel = path.relative_to(ROOT)
        text = path.read_text(encoding="utf-8", errors="ignore")
        if "\t" in text:
            errors.append(f"{rel}: tabs are not allowed in YAML")
        if text.count("${{") != text.count("}}"):
            errors.append(f"{rel}: unbalanced GitHub expression delimiters")


def main() -> int:
    errors: list[str] = []
    validate_markdown(errors)
    validate_json(errors)
    validate_yaml(errors)
    if errors:
        print("DOCS CHECK FAIL")
        for error in errors:
            print(f"  - {error}")
        return 1
    print("DOCS CHECK PASS — Markdown links/fences, JSON and workflow YAML shape look valid.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
