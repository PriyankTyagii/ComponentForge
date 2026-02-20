"""
agent.py -- Agentic loop: Generate -> Validate -> Self-Correct -> Output

Key behaviours:
  - Multi-turn: reuses the original component slug for follow-up filenames
  - Clean output: only shows files written THIS run, not entire output dir
  - Self-correction: up to MAX_ITERATIONS attempts
"""

from __future__ import annotations

import time
import re
from pathlib import Path
from typing import Any

from validator import validate_component
from generator import generate_component, parse_code_blocks


MAX_ITERATIONS = 3


def _slugify(text: str, max_len: int = 45) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].rstrip("-")


def _write_files(blocks: dict, output_dir: str, slug: str) -> dict[str, str]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = {}
    for key, ext in [("ts", "ts"), ("html", "html"), ("scss", "scss")]:
        content = blocks.get(key, "").strip()
        if content:
            path = out / (slug + ".component." + ext)
            path.write_text(content, encoding="utf-8")
            written[ext] = str(path)
    return written


def _print_header(text: str) -> None:
    print("\n" + "=" * 60)
    print("  " + text)
    print("=" * 60)


def _print_divider() -> None:
    print("-" * 60)


def run_agent(
    user_description: str,
    output_dir: str = "output",
    conversation_history: list[dict] | None = None,
    component_slug: str | None = None,
) -> dict[str, Any]:
    """
    Full agentic loop. Returns result dict with metadata.

    Parameters
    ----------
    user_description    : What to generate or edit.
    output_dir          : Where to write output files.
    conversation_history: Prior turns for multi-turn editing.
    component_slug      : Override slug (used by interactive mode to keep
                          follow-up files named after the original component).
    """
    # Use provided slug (follow-up) or derive from prompt (first generation)
    slug = component_slug or _slugify(user_description)
    is_followup = component_slug is not None

    start = time.time()
    best_blocks: dict = {}
    best_errors: list = []
    current_errors: list[str] | None = None
    raw_response = ""

    _print_header("Guided Component Architect" + (" — Follow-up Edit" if is_followup else ""))
    print("  Prompt    :", user_description[:70])
    print("  Component :", slug)
    print("  Model     : llama-3.3-70b-versatile (Groq)")

    for iteration in range(1, MAX_ITERATIONS + 1):
        print("\n" + "·" * 60)
        print("  Iteration " + str(iteration) + "/" + str(MAX_ITERATIONS) +
              (" [self-correction]" if iteration > 1 else " [initial generation]"))
        print("·" * 60)

        print("  ⚙  Calling LLM...")
        blocks = generate_component(
            user_description=user_description,
            previous_errors=current_errors,
            conversation_history=conversation_history,
        )
        raw_response = blocks.get("raw_response", "")

        print("  🔍 Running Linter-Agent...")
        errors, warnings = validate_component(blocks)
        passed = len(errors) == 0

        # Print validation result
        status_icon = "✅" if passed else "❌"
        print("  " + status_icon + " Validation " + ("PASSED" if passed else "FAILED") +
              " — " + str(len(errors)) + " error(s), " + str(len(warnings)) + " warning(s)")
        for e in errors:
            print("    ✖ " + e)
        for w in warnings:
            print("    ⚠ " + w)

        # Track best result
        if not best_blocks or len(errors) < len(best_errors):
            best_blocks = blocks
            best_errors = errors

        if passed:
            print("\n  ✅ Validation passed on iteration " + str(iteration) + "!")
            break

        if iteration < MAX_ITERATIONS:
            print("\n  ↻  Self-correcting with " + str(len(errors)) + " error(s) to fix...")
            current_errors = errors
        else:
            print("\n  ⚠  Max iterations reached. Using best result (" +
                  str(len(best_errors)) + " error(s) remaining).")

    # Write files
    written = _write_files(best_blocks, output_dir, slug)
    elapsed = time.time() - start
    final_passed = len(best_errors) == 0

    # Clean summary output
    _print_divider()
    print("  Files written:")
    for ext, path in written.items():
        print("  " + ext.upper().ljust(5) + "→ " + path)
    _print_divider()

    _print_header("RESULT SUMMARY")
    if final_passed:
        status_str = "✅ SUCCESS"
    elif len(best_errors) <= 2:
        status_str = "⚠  COMPLETED WITH WARNINGS"
    else:
        status_str = "❌ FAILED"

    print("  Status     : " + status_str)
    print("  Iterations : " + str(iteration))
    print("  Elapsed    : " + str(round(elapsed, 1)) + "s")
    print("  Errors     : " + str(len(best_errors)))
    print("  Warnings   : 0")

    if best_errors:
        print("\n  Remaining errors:")
        for e in best_errors:
            print("    ✖ " + e)

    print("\n  Output → " + output_dir + "/")
    for ext in ["ts", "html", "scss"]:
        if ext in written:
            print("    " + slug + ".component." + ext)
    print("=" * 60)

    return {
        "passed": final_passed,
        "iterations": iteration,
        "elapsed": elapsed,
        "errors": len(best_errors),
        "error_list": best_errors,
        "files": written,
        "raw_response": raw_response,
        "blocks": best_blocks,
        "slug": slug,
    }