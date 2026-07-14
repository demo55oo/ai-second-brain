// Build the Next app in standalone mode and stage it for Electron packaging.
//
// Next's standalone output ships `.next/standalone/server.js` + a minimal
// node_modules, but it does NOT include the static assets or `public/` — those
// must be copied in next to the server. This script does the full sequence so
// `npm run electron:pack` is one command.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

console.log("→ cleaning .next");
fs.rmSync(path.join(root, ".next"), { recursive: true, force: true });

console.log("→ next build (standalone)");
run("npx next build", { BUILD_TARGET: "electron" });

const standalone = path.join(root, ".next", "standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("✗ standalone build did not produce .next/standalone/server.js");
  process.exit(1);
}

console.log("→ copying static assets into standalone");
fs.cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (fs.existsSync(path.join(root, "public"))) {
  fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}

console.log("✓ standalone app staged at .next/standalone");
