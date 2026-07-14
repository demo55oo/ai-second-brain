// Electron main process — the desktop shell for the Claude-Code cockpit.
//
// It boots the bundled Next server (`.next/standalone/server.js`) on a local
// port using Electron's own Node, then shows it in a window. The reasoning still
// runs on the user's Claude Code subscription: the server spawns `claude -p`
// exactly as it does on localhost. Two desktop-specific problems are handled
// here: (1) a Finder-launched app does NOT inherit the shell PATH, so `claude`,
// `node`, and `curl` (used by skills) go missing — we repair PATH from a login
// shell; (2) first run checks that Claude Code is installed and guides setup.

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const { spawn, execSync } = require("node:child_process");

const isDev = process.env.ELECTRON_DEV === "1";
let serverProc = null;
let win = null;

/* ---------------------------------------------------------------- PATH fix -- */

function loginShellPath() {
  if (process.platform === "win32") return "";
  try {
    const shellBin = process.env.SHELL || "/bin/zsh";
    return execSync(`${shellBin} -lic 'echo -n "$PATH"'`, { timeout: 5000, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function fixPath() {
  if (process.platform === "win32") return;
  const home = os.homedir();
  const common = [
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    path.join(home, ".local/bin"),
    path.join(home, ".nvm/current/bin"),
    path.join(home, ".bun/bin"),
    path.join(home, ".volta/bin"),
  ];
  const parts = new Set(
    [...loginShellPath().split(":"), ...common, ...(process.env.PATH || "").split(":")].filter(Boolean),
  );
  process.env.PATH = Array.from(parts).join(":");
}

/* ---------------------------------------------------------------- env ----- */

function parseEnvFile(file) {
  const out = {};
  try {
    for (let line of fs.readFileSync(file, "utf8").split("\n")) {
      line = line.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      out[key] = val;
    }
  } catch {
    /* file absent */
  }
  return out;
}

// Load the user's config (Supabase, connector tokens, image keys) from a .env,
// since a Finder-launched app does NOT inherit the shell. Real process.env
// always wins; a packaged install reads ~/.jarvis-code/.env.
function loadEnvFiles() {
  const original = new Set(Object.keys(process.env));
  const files = [
    path.join(app.getAppPath(), ".env"),
    path.join(app.getAppPath(), ".env.local"),
    path.join(process.cwd(), ".env.local"),
    path.join(os.homedir(), ".jarvis-code", ".env"),
  ];
  const merged = {};
  for (const f of files) Object.assign(merged, parseEnvFile(f));
  for (const [k, v] of Object.entries(merged)) {
    if (!original.has(k)) process.env[k] = v;
  }
}

/* ------------------------------------------------------------ claude check -- */

function resolveClaude() {
  const candidates = [
    process.env.CLAUDE_BIN,
    path.join(os.homedir(), ".local/bin/claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  // fall back to PATH lookup
  try {
    const which = process.platform === "win32" ? "where" : "command -v";
    const found = execSync(`${which} claude`, { encoding: "utf8" }).split("\n")[0].trim();
    if (found) return found;
  } catch {
    /* not found */
  }
  return null;
}

/* --------------------------------------------------------------- server --- */

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function standaloneServerPath() {
  // Packaged (asar off): resources/app/.next/standalone/server.js
  return path.join(app.getAppPath(), ".next", "standalone", "server.js");
}

function startServer(port) {
  const serverPath = standaloneServerPath();
  const cwd = path.dirname(serverPath);
  serverProc = spawn(process.execPath, [serverPath], {
    cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1", // run server.js as plain Node, not an Electron window
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      // let the skills' helper scripts reach this exact server
      JARVIS_CODE_BASE_URL: `http://127.0.0.1:${port}`,
    },
    stdio: "inherit",
  });
  serverProc.on("exit", (code) => {
    if (code && !app.isQuitting) {
      dialog.showErrorBox("Server stopped", `The local server exited (code ${code}).`);
    }
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - started > timeoutMs) reject(new Error("server did not start in time"));
          else setTimeout(poll, 400);
        });
    };
    poll();
  });
}

/* ---------------------------------------------------------------- window --- */

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#02040a",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  win.on("closed", () => (win = null));
  return win;
}

function showSetup() {
  createWindow();
  win.loadFile(path.join(__dirname, "setup.html"));
}

async function boot() {
  fixPath();
  loadEnvFiles();

  if (!resolveClaude()) {
    showSetup();
    return;
  }

  if (isDev) {
    createWindow();
    await waitForServer("http://localhost:3000/jarvis-code").catch(() => {});
    win.loadURL("http://localhost:3000/jarvis-code");
    return;
  }

  const port = await findFreePort();
  startServer(port);
  const base = `http://127.0.0.1:${port}`;
  createWindow();
  try {
    await waitForServer(`${base}/jarvis-code`);
    win.loadURL(`${base}/jarvis-code`);
  } catch (err) {
    dialog.showErrorBox("Could not start", String(err && err.message ? err.message : err));
  }
}

/* ------------------------------------------------------------------ ipc ---- */

ipcMain.handle("recheck-claude", () => {
  if (resolveClaude()) {
    boot();
    return true;
  }
  return false;
});
ipcMain.handle("open-external", (_e, url) => shell.openExternal(String(url)));

/* --------------------------------------------------------------- lifecycle - */

app.whenReady().then(boot);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) boot();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  app.isQuitting = true;
  if (serverProc) {
    try {
      serverProc.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
});
