# Jarvis Code — desktop app

Package the Claude-Code cockpit (`/jarvis-code`) as a double-click desktop app. The
app boots the Next server locally and runs entirely on **your own Claude Code
subscription** — the reasoning is `claude -p`, billed to nothing but your plan.

## What it needs on the machine

The app rides on the Claude Code you already use. On first launch it checks for it
and shows a setup screen if missing:

1. **Claude Code CLI** installed: `npm i -g @anthropic-ai/claude-code` (or the native installer).
2. **Logged in**: run `claude login` once. (For a headless/always-on box instead, run
   `claude setup-token` and set `CLAUDE_CODE_OAUTH_TOKEN` in the environment.)
3. **Node + curl** on PATH (used by the skills). The app repairs PATH from your login
   shell, so a Finder-launched app still finds them.

No `ANTHROPIC_API_KEY` is used or billed — the app strips it so `claude` falls back to
your subscription.

## Configuration (Supabase, connector tokens, image keys)

A Finder-launched app can't see your shell, so the app loads config from a `.env` on
startup, checking (in order): the app folder's `.env` / `.env.local`, the project
`.env.local` (when run from source), and finally **`~/.jarvis-code/.env`** — the place to
put your keys for an installed build. Anything already in the real environment wins.
Connector tokens added through the dashboard live in `.jarvis-code/connectors.json` and
don't need to be in `.env`.

## Develop the shell

```bash
npm install                 # once (pulls electron + electron-builder)
npm run dev                 # terminal 1: the Next dev server on :3000
npm run electron:dev        # terminal 2: opens the app against the dev server
```

## Build a distributable app

```bash
npm run electron:build      # next build (standalone) + stage assets
npm run electron:start      # optional: run the packaged server locally to test
npm run electron:pack       # build the installer → dist-electron/ (.dmg / .exe / AppImage)
```

`electron:pack` produces an **unsigned** build. On macOS, right-click → Open the first
time to get past Gatekeeper (or add signing config under `build.mac` in package.json).

## How it works

- `next.config.ts` emits a standalone Node server only when `BUILD_TARGET=electron`, so
  the normal web/Vercel build is untouched.
- `electron/main.js` repairs PATH, checks for Claude Code, finds a free port, boots
  `.next/standalone/server.js` on it with Electron's Node, and loads it in a window.
- The server spawns `claude -p` exactly as it does on localhost; skills reach the server
  via `JARVIS_CODE_BASE_URL`, which the app points at the local port automatically.

## Cloud instead of desktop

The same server also runs in a container (Railway / Fly / a VPS). Install `claude`,
set `CLAUDE_CODE_OAUTH_TOKEN`, run `npm run build && npm start`. Put it behind any host;
only the auth (a token instead of an interactive login) differs.
