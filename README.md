# ComponentForge

> Turn words into Angular components. AI-powered generation with design system enforcement, automatic validation, and self-correction built in.

Built for Pythrust Technologies — Generative AI Engineer Intern Assignment.

---

## What it does

You describe a component in plain English. ComponentForge generates production-ready Angular code (TypeScript + HTML + SCSS), validates it against a design system, and auto-fixes any violations — all in under 5 seconds.

```
"A login card with glassmorphism effect"
        ↓
✅ a-login-card.component.ts
✅ a-login-card.component.html  
✅ a-login-card.component.scss
```

---

## Features

| Feature | Description |
|---|---|
| **AI Generation** | Groq + Llama 3.3-70b generates Angular components from natural language |
| **Design System Enforcement** | Only approved colors, fonts, and border-radius values allowed |
| **Linter-Agent** | Static analysis checks color compliance, bracket balance, HTML tags, @Component decorator |
| **Self-Correction Loop** | On validation failure, re-prompts LLM with error log — up to 3 iterations |
| **Multi-Turn Editing** | Follow-up prompts refine the same component in place |
| **Export as .tsx** | Save any component as a portable React TSX file |
| **Live Preview App** | Next.js app (deployable to Vercel) renders components in the browser |
| **Prompt Injection Prevention** | Input sanitization strips jailbreak patterns before LLM call |

---

## Project Structure

```
ComponentForge/
├── agent.py              ← Agentic loop orchestrator (generate → validate → correct)
├── generator.py          ← Groq LLM caller + response parser
├── validator.py          ← Linter-Agent (7 static analysis checks)
├── main.py               ← CLI entry point
├── design_system.json    ← Design tokens (colors, typography, spacing, borders)
├── requirements.txt      ← Python dependencies
├── APPROACH_NOTE.md      ← Prompt injection + scaling write-up
├── README.md
│
├── output/               ← Generated components land here
│   └── .gitkeep
│
└── preview_app/          ← Next.js live preview (deployable to Vercel)
    ├── app/
    │   ├── api/generate/
    │   │   └── route.ts  ← API route (proxies to Groq)
    │   ├── page.tsx      ← Main UI with live iframe preview
    │   ├── layout.tsx
    │   └── globals.css
    ├── package.json
    ├── next.config.mjs
    └── vercel.json
```

---

## How the Agentic Loop Works

```
User Prompt
    ↓
Generator (Groq LLM)
  — Design system injected into system prompt
  — Structured output: <<<TS>>> <<<HTML>>> <<<SCSS>>>
    ↓
Linter-Agent (validator.py)
  — Color compliance      (hex codes vs design tokens)
  — Border-radius check   (approved values only)
  — Bracket balance       (TS + SCSS)
  — HTML tag balance
  — @Component decorator
  — Font-family check
    ↓
 PASS ✅              FAIL ❌
   ↓                    ↓
Write output      Self-Correction Loop
                  — Re-prompt with error log
                  — Up to 3 iterations
                  — Output best result
```

---

## Quick Start

### Prerequisites
- Python 3.10+
- Free Groq API key — [console.groq.com](https://console.groq.com)

### Setup

```bash
# Install dependencies
pip install -r requirements.txt

# Set API key (Windows)
set GROQ_API_KEY=your_key_here

# Set API key (Mac/Linux)
export GROQ_API_KEY=your_key_here
```

### Generate a component

```bash
python main.py "A login card with glassmorphism effect"
```

### Export as .tsx

```bash
python main.py "A pricing card with three tiers" --export-tsx
```

### Multi-turn interactive mode

```bash
python main.py --interactive
```

```
[Describe a component] > A signup form with email and password
[Follow-up edit] > Now make the button fully rounded
[Follow-up edit] > Add a forgot password link below
[Follow-up edit] > export
[Follow-up edit] > exit
```

### Run the demo

```bash
python main.py --demo
```

---

## Live Preview App

The `preview_app/` folder is a Next.js app that renders generated components in the browser.

### Run locally

```bash
cd preview_app
npm install
npm run dev
# Open http://localhost:3000
```

### Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Set **Root Directory** to `preview_app`
4. Click Deploy

Enter your Groq API key in the UI — it's never stored server-side.

---

## Design System

All tokens are defined in `design_system.json`. The generator and validator both load it at runtime — no code changes needed to customise it.

| Category | Values |
|---|---|
| Colors | `#6366f1` primary, `#0ea5e9` secondary, `#10b981` success, `#ef4444` error + 10 more |
| Typography | `'Inter', sans-serif` |
| Border Radius | `4px`, `8px`, `12px`, `16px`, `9999px` |
| Shadows | `shadow-glass`, `shadow-md` |

---

## CLI Reference

```bash
python main.py "prompt"            # Generate a component
python main.py "prompt" --export-tsx   # Generate + export as .tsx
python main.py --interactive       # Multi-turn REPL
python main.py --demo              # Built-in demo with multi-turn edit
python main.py --output-dir ./out  # Custom output directory
```

---

## Assumptions

- Target Angular project has Tailwind CSS and Angular Material installed
- Python 3.10 or higher
- `GROQ_API_KEY` set in environment
- `Inter` font available via Google Fonts in global stylesheet

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | Groq API — `llama-3.3-70b-versatile` |
| CLI | Python 3.10, argparse |
| Validation | Pure Python regex + state machine |
| Preview App | Next.js 15, React, Tailwind CSS |
| Deployment | Vercel |