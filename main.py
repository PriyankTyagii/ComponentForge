"""
main.py -- CLI entry point for Guided Component Architect

Usage:
  python main.py "A login card with glassmorphism"
  python main.py "A navbar" --export-tsx
  python main.py --interactive
  python main.py --demo
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def export_as_tsx(output_dir: str, slug: str = None) -> list:
    out = Path(output_dir)

    if slug:
        ts_files   = list(out.glob(slug + ".component.ts"))
        html_files = list(out.glob(slug + ".component.html"))
        scss_files = list(out.glob(slug + ".component.scss"))
    else:
        ts_files   = sorted(out.glob("*.component.ts"),   key=lambda f: f.stat().st_mtime, reverse=True)
        html_files = sorted(out.glob("*.component.html"), key=lambda f: f.stat().st_mtime, reverse=True)
        scss_files = sorted(out.glob("*.component.scss"), key=lambda f: f.stat().st_mtime, reverse=True)

    if not ts_files:
        print("No .component.ts found in output dir.")
        return []

    ts_content   = ts_files[0].read_text(encoding="utf-8")
    html_content = html_files[0].read_text(encoding="utf-8") if html_files else ""
    scss_content = scss_files[0].read_text(encoding="utf-8") if scss_files else ""
    escaped_html = html_content.replace("`", "\\`")

    lines = [
        "// AUTO-EXPORTED by Guided Component Architect",
        'import React from "react";',
        "",
        "// Original TypeScript Logic",
        "/*",
        ts_content,
        "*/",
        "",
        "// Styles (original SCSS)",
        "const styles = `",
        scss_content,
        "`;",
        "",
        "export default function ComponentPreview() {",
        "  return (",
        "    <>",
        '      <style dangerouslySetInnerHTML={{ __html: styles }} />',
        "      <div",
        '        className="preview-wrapper"',
        "        dangerouslySetInnerHTML={{",
        "          __html: `" + escaped_html + "`,",
        "        }}",
        "      />",
        "    </>",
        "  );",
        "}",
    ]

    stem = ts_files[0].stem.replace(".component", "")
    tsx_path = out / (stem + ".tsx")
    tsx_path.write_text("\n".join(lines), encoding="utf-8")
    print("\n📦 TSX exported →", tsx_path)
    return [str(tsx_path)]


def run_single(prompt: str, output_dir: str = "output", export_tsx: bool = False):
    from agent import run_agent
    result = run_agent(prompt, output_dir=output_dir)
    if export_tsx:
        export_as_tsx(output_dir, result.get("slug"))
    return result


def run_interactive(output_dir: str = "output"):
    from agent import run_agent

    print("\n" + "=" * 60)
    print("  Guided Component Architect -- Interactive Mode")
    print("=" * 60)
    print("  Commands: 'reset' | 'export' | 'exit'")
    print("  First prompt  -> generates component")
    print("  Follow-ups    -> refine the same component")
    print("=" * 60 + "\n")

    conversation_history = []
    last_raw_output = ""
    current_slug = None      # tracks the active component's slug
    is_first = True

    while True:
        label = "Describe a component" if is_first else "Follow-up edit"
        try:
            user_input = input("[" + label + "] > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

        if not user_input:
            continue
        if user_input.lower() == "exit":
            print("Goodbye!")
            break
        if user_input.lower() == "reset":
            conversation_history = []
            last_raw_output = ""
            current_slug = None
            is_first = True
            print("\n🔄 Conversation reset. Describe a new component.\n")
            continue
        if user_input.lower() == "export":
            if not current_slug:
                print("Nothing generated yet.")
            else:
                export_as_tsx(output_dir, current_slug)
            continue

        # Pass component_slug=None on first turn (derive from prompt)
        # Pass component_slug=current_slug on follow-ups (reuse same filename)
        result = run_agent(
            user_input,
            output_dir=output_dir,
            conversation_history=conversation_history,
            component_slug=current_slug,   # None on first, slug on follow-ups
        )

        conversation_history.append({"role": "user", "content": user_input})
        conversation_history.append({"role": "assistant", "content": result.get("raw_response", "")})
        last_raw_output = result.get("raw_response", "")

        # Lock in the slug after first generation
        if is_first:
            current_slug = result.get("slug")
            is_first = False

        status = "✅ SUCCESS" if result.get("passed") else "⚠  ERRORS: " + str(result.get("errors", 0))
        print("\n  " + status + " | Iterations: " + str(result.get("iterations", 1)))
        print("  Follow-up to refine | 'export' for .tsx | 'reset' for new component\n")


def run_demo(output_dir: str = "output"):
    from agent import run_agent

    print("\n" + "=" * 60)
    print("  DEMO: Login card → multi-turn edit")
    print("=" * 60 + "\n")

    conversation_history = []

    # Step 1: initial generation
    result1 = run_agent(
        "A login card with glassmorphism effect, email and password inputs, and a sign-in button",
        output_dir=output_dir,
        conversation_history=conversation_history,
    )
    slug = result1.get("slug")
    conversation_history.append({"role": "user", "content": "A login card with glassmorphism effect"})
    conversation_history.append({"role": "assistant", "content": result1.get("raw_response", "")})

    # Step 2: follow-up (reuse slug)
    result2 = run_agent(
        "Now make the sign-in button fully rounded with a gradient from primary to primary-dark",
        output_dir=output_dir,
        conversation_history=conversation_history,
        component_slug=slug,
    )

    print("\n" + "=" * 60)
    p1 = "✅ PASS" if result1.get("passed") else "❌ FAIL"
    p2 = "✅ PASS" if result2.get("passed") else "❌ FAIL"
    print("  DEMO COMPLETE | Generation: " + p1 + " | Follow-up: " + p2)
    print("=" * 60)
    export_as_tsx(output_dir, slug)


def main():
    parser = argparse.ArgumentParser(description="Guided Component Architect")
    parser.add_argument("prompt", nargs="?", help="Component description")
    parser.add_argument("--interactive", "-i", action="store_true", help="Multi-turn REPL")
    parser.add_argument("--demo", action="store_true", help="Run built-in demo")
    parser.add_argument("--export-tsx", action="store_true", help="Export as .tsx")
    parser.add_argument("--output-dir", default="output", help="Output directory")

    args = parser.parse_args()

    if not os.environ.get("GROQ_API_KEY"):
        print("GROQ_API_KEY not set.")
        print("Get a free key at https://console.groq.com")
        print("Then: set GROQ_API_KEY=your_key_here")
        sys.exit(1)

    if args.demo:
        run_demo(args.output_dir)
    elif args.interactive:
        run_interactive(args.output_dir)
    elif args.prompt:
        run_single(args.prompt, output_dir=args.output_dir, export_tsx=args.export_tsx)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()