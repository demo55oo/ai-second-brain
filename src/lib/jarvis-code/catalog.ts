/**
 * The curated catalog of first-party MCP connectors Claude offers. These are the
 * "one-click" connectors on the /jarvis-code dashboard: unlike the token-based
 * custom connectors (see connectors.ts), these authenticate via OAuth through the
 * Claude Code CLI itself (`claude mcp login`), which opens the user's browser and
 * runs the loopback flow. Once connected they register at USER scope in
 * ~/.claude.json, so they auto-load into every `claude -p` run — no per-run
 * --mcp-config needed.
 *
 * URLs mirror the servers documented in Claude's connector directory. Any that
 * drift can still be fixed via the "Add MCP" custom form.
 */

export type CatalogAuth = "oauth" | "open";

export type CatalogConnector = {
  id: string; // the mcp server name registered with `claude mcp add`
  name: string;
  category: "Productivity" | "Engineering" | "Design" | "Payments" | "Support" | "Data";
  transport: "http" | "sse";
  url: string;
  auth: CatalogAuth;
  blurb: string; // shown on the card
  toolsHint: string; // advertised to KRONOS in the system prompt
  accent: string; // hex accent for the card
};

export const CONNECTOR_CATALOG: CatalogConnector[] = [
  // — Productivity —
  {
    id: "notion",
    name: "Notion",
    category: "Productivity",
    transport: "http",
    url: "https://mcp.notion.com/mcp",
    auth: "oauth",
    blurb: "Search, read and update your Notion workspace.",
    toolsHint: "Search Notion, read/create/update pages and databases",
    accent: "#ffffff",
  },
  {
    id: "linear",
    name: "Linear",
    category: "Productivity",
    transport: "sse",
    url: "https://mcp.linear.app/sse",
    auth: "oauth",
    blurb: "Read and manage issues, projects and cycles.",
    toolsHint: "List/create/update Linear issues, projects, comments",
    accent: "#8b8ff5",
  },
  {
    id: "asana",
    name: "Asana",
    category: "Productivity",
    transport: "sse",
    url: "https://mcp.asana.com/sse",
    auth: "oauth",
    blurb: "Tasks, projects and portfolios in Asana.",
    toolsHint: "Read/act on Asana tasks, projects, portfolios",
    accent: "#f06a6a",
  },
  {
    id: "atlassian",
    name: "Atlassian",
    category: "Productivity",
    transport: "sse",
    url: "https://mcp.atlassian.com/v1/sse",
    auth: "oauth",
    blurb: "Jira issues and Confluence pages.",
    toolsHint: "Search/create Jira issues, read/write Confluence pages",
    accent: "#2684ff",
  },
  {
    id: "monday",
    name: "monday.com",
    category: "Productivity",
    transport: "sse",
    url: "https://mcp.monday.com/sse",
    auth: "oauth",
    blurb: "Boards, items and updates in monday.com.",
    toolsHint: "Read/act on monday.com boards and items",
    accent: "#ff3d57",
  },

  // — Engineering —
  {
    id: "github",
    name: "GitHub",
    category: "Engineering",
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    auth: "oauth",
    blurb: "Repos, issues, PRs and code search.",
    toolsHint: "Search code, read/manage GitHub issues and pull requests",
    accent: "#e6edf3",
  },
  {
    id: "sentry",
    name: "Sentry",
    category: "Engineering",
    transport: "http",
    url: "https://mcp.sentry.dev/mcp",
    auth: "oauth",
    blurb: "Errors, issues and performance in Sentry.",
    toolsHint: "Query Sentry issues, events and traces",
    accent: "#e1567c",
  },
  {
    id: "vercel",
    name: "Vercel",
    category: "Engineering",
    transport: "http",
    url: "https://mcp.vercel.com",
    auth: "oauth",
    blurb: "Projects, deployments and logs on Vercel.",
    toolsHint: "Inspect Vercel projects, deployments and logs",
    accent: "#ffffff",
  },
  {
    id: "cloudflare-docs",
    name: "Cloudflare Docs",
    category: "Engineering",
    transport: "sse",
    url: "https://docs.mcp.cloudflare.com/sse",
    auth: "open",
    blurb: "Search Cloudflare's developer documentation.",
    toolsHint: "Search Cloudflare developer docs",
    accent: "#f6821f",
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    category: "Data",
    transport: "http",
    url: "https://huggingface.co/mcp",
    auth: "open",
    blurb: "Models, datasets and Spaces on the Hub.",
    toolsHint: "Search Hugging Face models, datasets and Spaces",
    accent: "#ffd21e",
  },

  // — Payments —
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    transport: "http",
    url: "https://mcp.stripe.com",
    auth: "oauth",
    blurb: "Customers, payments, invoices and products.",
    toolsHint: "Query Stripe customers, payments, invoices, products",
    accent: "#635bff",
  },
  {
    id: "paypal",
    name: "PayPal",
    category: "Payments",
    transport: "http",
    url: "https://mcp.paypal.com/mcp",
    auth: "oauth",
    blurb: "Orders, invoices and transactions in PayPal.",
    toolsHint: "Create/read PayPal orders, invoices, transactions",
    accent: "#0070ba",
  },
  {
    id: "square",
    name: "Square",
    category: "Payments",
    transport: "sse",
    url: "https://mcp.squareup.com/sse",
    auth: "oauth",
    blurb: "Payments, catalog and customers in Square.",
    toolsHint: "Read/act on Square payments, catalog, customers",
    accent: "#e6edf3",
  },
  {
    id: "plaid",
    name: "Plaid",
    category: "Payments",
    transport: "sse",
    url: "https://api.dashboard.plaid.com/mcp/sse",
    auth: "oauth",
    blurb: "Financial accounts and transactions via Plaid.",
    toolsHint: "Query Plaid financial data (dashboard scope)",
    accent: "#111111",
  },

  // — Support / GTM —
  {
    id: "intercom",
    name: "Intercom",
    category: "Support",
    transport: "sse",
    url: "https://mcp.intercom.com/sse",
    auth: "oauth",
    blurb: "Conversations, contacts and tickets.",
    toolsHint: "Read Intercom conversations, contacts, tickets",
    accent: "#1f8ded",
  },

  // — Design —
  {
    id: "canva",
    name: "Canva",
    category: "Design",
    transport: "http",
    url: "https://mcp.canva.com/mcp",
    auth: "oauth",
    blurb: "Designs, brand assets and exports in Canva.",
    toolsHint: "Search/create Canva designs and export assets",
    accent: "#00c4cc",
  },
  {
    id: "webflow",
    name: "Webflow",
    category: "Design",
    transport: "sse",
    url: "https://mcp.webflow.com/sse",
    auth: "oauth",
    blurb: "Sites, collections and CMS items in Webflow.",
    toolsHint: "Read/update Webflow sites and CMS collections",
    accent: "#146ef5",
  },
  {
    id: "wix",
    name: "Wix",
    category: "Design",
    transport: "sse",
    url: "https://mcp.wix.com/sse",
    auth: "oauth",
    blurb: "Sites, stores and bookings on Wix.",
    toolsHint: "Read/act on Wix sites, stores, bookings",
    accent: "#e6edf3",
  },
];

export function catalogById(id: string): CatalogConnector | undefined {
  return CONNECTOR_CATALOG.find((c) => c.id === id);
}
