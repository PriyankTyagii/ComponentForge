import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = (designSystem: object) => `You are an expert Angular frontend engineer.
Your ONLY job is to produce raw Angular component code. No explanations, no markdown prose, no greetings.

=== DESIGN SYSTEM (use ONLY these tokens) ===
${JSON.stringify(designSystem, null, 2)}

=== OUTPUT FORMAT (follow exactly) ===
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
1. Use ONLY hex colors from the design system. Never invent colors.
2. Use ONLY border-radius values from the "borders" section.
3. Use ONLY font-family from the "typography" section.
4. Include valid @Component decorator with selector, inline template and styles.
5. Every opening tag/bracket must have a matching closing tag/bracket.
6. No placeholder colors (#ccc, #000) unless they are in the design system.
7. Self-contained — imports only from @angular/core and @angular/material.`;

const DESIGN_SYSTEM = {
  colors: {
    primary: "#6366f1",
    "primary-dark": "#4f46e5",
    "primary-light": "#818cf8",
    secondary: "#0ea5e9",
    accent: "#f59e0b",
    success: "#10b981",
    error: "#ef4444",
    surface: "#ffffff",
    "surface-dark": "#1e1e2e",
    background: "#f8fafc",
    "background-dark": "#0f0f1a",
    "text-primary": "#1e293b",
    "text-secondary": "#64748b",
    "text-muted": "#94a3b8",
    border: "#e2e8f0",
    "glass-bg": "rgba(255, 255, 255, 0.1)",
    "glass-border": "rgba(255, 255, 255, 0.2)",
  },
  typography: { "font-family": "'Inter', sans-serif" },
  borders: {
    "border-radius-sm": "4px",
    "border-radius": "8px",
    "border-radius-lg": "12px",
    "border-radius-xl": "16px",
    "border-radius-full": "9999px",
  },
  shadows: {
    "shadow-glass": "0 8px 32px rgba(31, 38, 135, 0.15)",
    "shadow-md": "0 8px 16px rgba(0,0,0,0.1)",
  },
};

function parseBlocks(raw: string) {
  const extract = (tag: string) => {
    const m = raw.match(new RegExp(`<<<${tag}>>>(.*?)<<<END_${tag}>>>`, "s"));
    return m ? m[1].trim() : "";
  };
  return { ts: extract("TS"), html: extract("HTML"), scss: extract("SCSS") };
}

export async function POST(req: NextRequest) {
  try {
    const { prompt, apiKey, conversationHistory = [] } = await req.json();

    if (!prompt || !apiKey) {
      return NextResponse.json({ error: "prompt and apiKey are required" }, { status: 400 });
    }

    const messages = [
      ...conversationHistory,
      { role: "user", content: `Generate an Angular component for: ${prompt}` },
    ];

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT(DESIGN_SYSTEM) },
          ...messages,
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json(
        { error: err.error?.message || "Groq API error" },
        { status: res.status }
      );
    }

    const data = await res.json();
    const raw = data.choices[0].message.content;
    const blocks = parseBlocks(raw);

    return NextResponse.json({ ...blocks, raw });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
