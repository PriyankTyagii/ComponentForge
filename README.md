# Guided Component Architect

> **Transform natural language into governed Angular components — with automatic validation and self-correction.**

Built for Pythrust Technologies' Generative AI Engineer Intern assignment.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture — The Agentic Loop](#architecture--the-agentic-loop)
3. [Project Structure](#project-structure)
4. [Quick Start](#quick-start)
5. [Design System](#design-system)
6. [How the Validator Works](#how-the-validator-works)
7. [Multi-Turn Editing](#multi-turn-editing)
8. [Assumptions](#assumptions)
9. [Prompt Injection Prevention & Scaling](#prompt-injection-prevention--scaling)

---

## Overview

Guided Component Architect is a Python pipeline that:

1. Accepts a **natural-language prompt** (e.g. *"A login card with glassmorphism effect"*).
2. Generates a complete **Angular component** (TypeScript + HTML + SCSS) using Claude.
3. Runs a **Linter-Agent** to verify design-token compliance and syntax correctness.
4. **Auto-corrects** the component if errors are found (up to 2 retries).
5. Writes the final files to the `output/` directory.

---

## Architecture — The Agentic Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER PROMPT                                 │
│          "A login card with glassmorphism effect"                │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  GENERATOR  (generator.py)                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  System Prompt: design_system.json injected as context   │   │
│  │  Output format enforced via strict delimiters            │   │
│  │  Temperature = 0.2 for deterministic code output         │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                             │                                    │
│                    Claude API call                               │
│                             │                                    │
│                             ▼                                    │
│               ┌─────────────────────────┐                       │
│               │  Raw LLM Response       │                       │
│               │  <<<TS>>>  ...          │                       │
│               │  <<<HTML>>>...          │                       │
│               │  <<<SCSS>>>...          │                       │
│               └──────────┬──────────────┘                       │
│                          │  parse_code_blocks()                  │
│                          ▼                                       │
│               { ts: "...", html: "...", scss: "..." }            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  LINTER-AGENT  (validator.py)                                    │
│                                                                  │
│  ① Color compliance   — hex codes must exist in design_system   │
│  ② Border-radius      — values must match approved tokens       │
│  ③ Bracket balance    — {}, [], () checked for TS + SCSS        │
│  ④ HTML tag balance   — open/close tags must match              │
│  ⑤ @Component check   — decorator + selector + template         │
│  ⑥ Font-family        — warns if design token font not used     │
│                                                                  │
│           ┌──────────┴────────────┐                             │
│         PASS ✅               FAIL ❌                           │
└───────────┬───────────────────────┬─────────────────────────────┘
            │                       │
            ▼                       ▼
   ┌────────────────┐    ┌──────────────────────────────┐
   │  Write output  │    │  SELF-CORRECTION LOOP        │
   │  to output/    │    │                              │
   └────────────────┘    │  Re-prompt LLM with errors:  │
                         │  "Fix these issues: [errors]"│
                         │                              │
                         │  → Loop back to GENERATOR    │
                         │  → Up to MAX_RETRIES = 2     │
                         │                              │
                         │  If still failing after max  │
                         │  retries → output best result│
                         │  + surface remaining errors  │
                         └──────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|---|---|
| Strict delimiter format (`<<<TS>>>`) | Prevents conversational filler from polluting code; easier to parse than markdown fences which LLMs sometimes omit or nest |
| Temperature = 0.2 | Low randomness = more consistent, parseable code output |
| Design system injected into system prompt | Gives the model token values before any user content, establishing them as a constraint rather than a suggestion |
| Best-of-N tracking | Even if retries don't fully converge, we output the iteration with fewest errors |

---

## Project Structure

```
guided-component-architect/
├── design_system.json   ← Design tokens (colors, spacing, typography, etc.)
├── generator.py         ← LLM prompting & response parsing
├── validator.py         ← Linter-Agent (token compliance + syntax checks)
├── agent.py             ← Agentic loop orchestrator
├── main.py              ← CLI entry point (single-shot + multi-turn REPL)
├── requirements.txt
├── README.md
└── output/              ← Generated files appear here
    ├── <name>.component.ts
    ├── <name>.component.html
    └── <name>.component.scss
```

---

## Quick Start

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Set your Anthropic API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### 3. Run — single prompt

```bash
python main.py "A login card with glassmorphism effect"
```

### 4. Run — interactive multi-turn REPL

```bash
python main.py
# Then follow the prompts:
# 📝  Describe your component: A dashboard stats card
# 🔄  Follow-up: Now make the button rounded
# 🔄  Follow-up: Add a subtle hover animation
```

### 5. Find your generated files

```bash
ls output/
# a-login-card-with-glassmo.component.ts
# a-login-card-with-glassmo.component.html
# a-login-card-with-glassmo.component.scss
```

---

## Design System

`design_system.json` contains the following token categories:

| Category | Examples |
|---|---|
| `colors` | `primary: #6366f1`, `error: #ef4444`, `white: #ffffff` |
| `typography` | `font-family: 'Inter'`, font sizes, weights, line heights |
| `spacing` | `spacing-1` through `spacing-16` (rem-based) |
| `borders` | `border-radius: 8px`, `border-radius-full: 9999px` |
| `shadows` | `shadow-glass`, `shadow-xl`, etc. |
| `effects` | Glassmorphism preset, transitions, opacity |
| `breakpoints` | sm / md / lg / xl |

To customise the design system, edit `design_system.json` — the generator and validator both load it at runtime, so no code changes are needed.

---

## How the Validator Works

The Linter-Agent (`validator.py`) performs **static analysis** — no LLM is invoked. Checks are implemented as pure Python using `re` (regex) and a custom bracket-balance state machine:

### Color Compliance
All `#rrggbb` / `#rgb` hex literals in the generated code are extracted with a regex and compared against the set of approved colors from the design system. Any unknown hex value raises an error.

### Border-Radius Compliance
CSS `border-radius: <value>` declarations are extracted and matched against the approved radius tokens. Multi-value shorthands and CSS custom properties (`var(...)`) are skipped to avoid false positives.

### Bracket Balance
A single-pass O(n) state machine tracks `{`, `[`, `(` / `}`, `]`, `)` pairs, correctly ignoring bracket characters inside string literals (handles single, double, and backtick quotes).

### HTML Tag Balance
A regex-based tag scanner tracks open tags in a stack. Void elements (`<br>`, `<input>`, etc.) and self-closing tags are excluded.

### @Component Decorator
Verifies that `@Component`, `selector:`, and `template:` (or `templateUrl:`) are all present in the TypeScript block.

---

## Multi-Turn Editing

The `MultiTurnSession` class in `main.py` maintains a running description across turns:

```
Turn 1 prompt  : "A dashboard stats card"
Turn 2 follow-up: "Now make the button rounded"
Turn 3 follow-up: "Add a subtle hover animation"

→ Full description sent to LLM:
  "A dashboard stats card. Additional requirements:
   Now make the button rounded; Add a subtle hover animation"
```

This simple context-accumulation approach is effective for the 4–6 hour scope of this assignment. In production you would use a proper conversation history array with assistant turns included.

Type `new` to start a fresh component session, or `quit` / `exit` to stop.

---

## Assumptions

1. **Angular + Tailwind installed in target project**: The generated SCSS uses design-system tokens directly; Tailwind classes are used as utility hints in HTML. The user's Angular project is assumed to have Tailwind configured (`tailwind.config.js`) and Angular Material installed (`ng add @angular/material`).
2. **Python 3.9+**: f-strings, `dataclasses`, `pathlib` used throughout.
3. **`ANTHROPIC_API_KEY` set in environment**: No `.env` file handling included for simplicity.
4. **One component per run**: Each invocation targets a single component. Full-page generation is discussed below.
5. **Internet access for `Inter` font**: The generated components assume `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap')` is in your global stylesheet.

---

## Prompt Injection Prevention & Scaling

*See `APPROACH_NOTE.md` for the full 300–400 word submission note.*
