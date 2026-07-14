import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // For the Electron desktop build we emit a self-contained Node server
  // (`.next/standalone/server.js`) that the app shell boots on a local port.
  // Left undefined for the normal web build so nothing about Vercel/dev changes.
  output: process.env.BUILD_TARGET === "electron" ? "standalone" : undefined,
  experimental: {
    serverActions: { bodySizeLimit: "32mb" },
  },
  transpilePackages: ["three"],
  // LanceDB ships native .node binaries — they can't be bundled by webpack
  // and must be loaded at runtime on the server side only.
  serverExternalPackages: ["@lancedb/lancedb", "@modelcontextprotocol/sdk"],
  // The ingested business-doc notes are read from disk at runtime (client-knowledge.ts).
  // Trace them into each route's serverless bundle so they ship in prod.
  outputFileTracingIncludes: {
    "/api/brain/search": ["./content/knowledge/**/*"],
    "/api/brain/upload": ["./content/knowledge/**/*"],
    "/api/jarvis-code/run": ["./content/knowledge/**/*"],
    "/api/studio/docs": ["./content/knowledge/**/*"],
    // Carousel + newsletter image gen read the founder's face and locked
    // style-reference from disk, so the on-brand path works in prod.
    "/api/carousel/image": ["./content/knowledge/**/*", "./content/branding/**/*"],
    "/api/jarvis-code/skills/brand": ["./content/branding/**/*"],
    "/api/jarvis-code/skills/newsletter": ["./content/branding/**/*"],
  },
  // `onnxruntime-node` (354 MB on Linux) is a transitive dep of
  // `@huggingface/transformers`, which we only use for IN-BROWSER Whisper STT
  // (it runs onnxruntime-WEB/wasm in the browser, never the Node build). Next was
  // wrongly tracing the Node binaries into the page/server functions, blowing past
  // Vercel's 250 MB limit. Nothing server-side needs it, so exclude it from every
  // function's trace.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/**",
      "node_modules/@huggingface/transformers/**",
    ],
  },
  // Keep compiled pages in memory far longer so the dev server doesn't dispose +
  // recompile them constantly (each recompile rewrites the page manifests, which is
  // when the ".next/.../app-build-manifest.json" race tends to bite).
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 10,
  },
  webpack: (config, { dev }) => {
    // transformers.js loads ONNX runtime — exclude its node-side fs/sharp
    // imports from the client bundle so it works in the browser.
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      sharp: false,
      "onnxruntime-node$": false,
    };
    // DEV: use an in-memory webpack cache instead of the on-disk PackFileCache.
    // The filesystem cache re-serializes the big bundled strings (output.json ~1MB,
    // the inlined vault/knowledge docs) on every HMR and races Next's manifest
    // writes — the cause of the intermittent `_buildManifest.js.tmp` /
    // `app-build-manifest.json` ENOENT errors. Memory cache is race-free; the only
    // cost is a slightly slower cold start (no cache persisted between restarts).
    if (dev) config.cache = { type: "memory" };
    return config;
  },
};

export default nextConfig;
