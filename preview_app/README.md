# Guided Component Architect — Live Preview App

A minimal Next.js app deployable to Vercel that provides a live UI to:
- Generate Angular components via natural language
- Preview rendered HTML/SCSS in an iframe
- View TypeScript / HTML / SCSS source in tabs
- Multi-turn editing ("Now make the button rounded")
- Export as .tsx file

## Deploy to Vercel (2 minutes)

1. Push this `preview_app/` folder to a GitHub repo
2. Go to vercel.com → New Project → Import your repo
3. Vercel auto-detects Next.js — click Deploy
4. Done! Open the URL and enter your Groq API key in the UI

## Run Locally

```bash
cd preview_app
npm install
npm run dev
# Open http://localhost:3000
```

## How it works

- The UI calls `/api/generate` (Next.js API route)
- The route forwards the request to Groq's API with the design system in the system prompt
- The response is parsed into TS/HTML/SCSS blocks
- HTML + SCSS are rendered in an `<iframe>` using `srcdoc`
- Conversation history is kept in a `useRef` for multi-turn editing
- API key is entered in the UI — never stored server-side
