"""
generator.py
------------
Uses Groq (free) with llama-3.3-70b-versatile.
Supports multi-turn conversation history for iterative editing.
Set GROQ_API_KEY environment variable before running.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from groq import Groq

# ---------------------------------------------------------------------------
# Client setup
# ---------------------------------------------------------------------------

_CLIENT = Groq(api_key=os.environ.get("GROQ_API_KEY"))
_MODEL_NAME = "llama-3.3-70b-versatile"


def _load_design_system(path: str | Path = "design_system.json") -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _build_system_prompt(design_system: dict) -> str:
    ds_str = json.dumps(design_system, indent=2)
    return f"""You are an expert Angular frontend engineer.
Your ONLY job is to produce raw Angular component code. No explanations, no markdown prose, no greetings.

=== DESIGN SYSTEM (use ONLY these tokens) ===
{ds_str}

=== OUTPUT FORMAT (follow exactly, no extra text) ===
<<<TS>>>
<TypeScript component class here>
<<<END_TS>>>

<<<HTML>>>
<Angular template here>
<<<END_HTML>>>

<<<SCSS>>>
<SCSS styles here>
<<<END_SCSS>>>

=== STRICT RULES ===
1. Use ONLY hex color values from the design system "colors" section. Never invent colors.
2. Use ONLY border-radius values from the "borders" section.
3. Use ONLY font-family from the "typography" section.
4. Include a valid @Component decorator with selector and inline template/styles.
5. Every opening bracket/tag must have a matching closing bracket/tag.
6. No placeholder colors like #ccc, #000 unless they are in the design system.
7. Self-contained -- imports only from @angular/core and @angular/material.
8. Include proper TypeScript types (no implicit any).
"""


def _build_user_prompt(
    user_description: str,
    design_system: dict,
    previous_errors: list[str] | None = None,
) -> str:
    base = f"Generate an Angular component for: {user_description}"

    if previous_errors:
        errors_block = "\n".join(f"  - {e}" for e in previous_errors)
        base += f"""

SELF-CORRECTION REQUEST:
The previous generation had these validation errors. Fix ALL of them:
{errors_block}

Re-generate the FULL component (all three blocks) with every error corrected.
"""
    return base


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def parse_code_blocks(raw: str) -> dict[str, str]:
    """Extract TS / HTML / SCSS blocks from the model's raw text output."""
    patterns = {
        "ts":   r"<<<TS>>>(.*?)<<<END_TS>>>",
        "html": r"<<<HTML>>>(.*?)<<<END_HTML>>>",
        "scss": r"<<<SCSS>>>(.*?)<<<END_SCSS>>>",
    }
    blocks: dict[str, str] = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, raw, re.DOTALL)
        blocks[key] = match.group(1).strip() if match else ""
    return blocks


def generate_component(
    user_description: str,
    design_system_path: str | Path = "design_system.json",
    previous_errors: list[str] | None = None,
    temperature: float = 0.2,
    conversation_history: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Call Groq and return a dict with keys: ts, html, scss, raw_response.

    Parameters
    ----------
    user_description    : Natural-language component description.
    design_system_path  : Path to design_system.json.
    previous_errors     : Validation errors from a previous iteration.
    temperature         : Sampling temperature.
    conversation_history: Prior turns for multi-turn editing support.
    """
    design_system = _load_design_system(design_system_path)
    system_prompt = _build_system_prompt(design_system)
    user_prompt = _build_user_prompt(user_description, design_system, previous_errors)

    print(
        f"\n{'='*60}\n"
        f"[Generator] Calling Groq ({_MODEL_NAME})"
        f"{' (self-correction mode)' if previous_errors else ''}...\n"
        f"{'='*60}"
    )

    # Build messages: history + current user turn
    messages = list(conversation_history) if conversation_history else []
    messages.append({"role": "user", "content": user_prompt})

    response = _CLIENT.chat.completions.create(
        model=_MODEL_NAME,
        temperature=temperature,
        max_tokens=4096,
        messages=[{"role": "system", "content": system_prompt}] + messages,
    )

    raw = response.choices[0].message.content
    blocks = parse_code_blocks(raw)
    blocks["raw_response"] = raw
    return blocks