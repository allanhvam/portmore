import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { portless } from "./portless.js";
import { findFreePort } from "./find-free-port.js";
import { aliases, toggleAlias } from "./index.js";
import type { PortMoreAlias } from "./types/portmore.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatStartTime(input: Date): string {
  return input.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function isSvgMarkup(value: string): boolean {
  return /^\s*<svg[\s>]/i.test(value);
}

function svgToDataUri(svg: string): string {
  const encoded = Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

function dashboardFaviconSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Portmore">
    <rect width="64" height="64" rx="14" fill="#0f1724"/>
    <circle cx="32" cy="32" r="18" fill="#35b6ff"/>
    <circle cx="32" cy="32" r="8" fill="#0f1724"/>
  </svg>`;
}

function renderIcon(icon?: string): string {
  if (!icon) {
    return `<span class="service-icon" aria-hidden="true">◉</span>`;
  }

  if (isSvgMarkup(icon)) {
    const src = escapeHtml(svgToDataUri(icon));
    return `<img class="service-icon service-icon-svg" src="${src}" alt="" aria-hidden="true" />`;
  }

  return `<span class="service-icon" aria-hidden="true">${escapeHtml(icon)}</span>`;
}

async function resolveAliasMetrics(alias: PortMoreAlias): Promise<Record<string, unknown>> {
  if (!alias.metrics) {
    return {};
  }

  try {
    return await alias.metrics();
  } catch {
    return { Status: "error" };
  }
}

async function renderAliases(aliases: readonly PortMoreAlias[]): Promise<string> {
  const renderedRows = await Promise.all(
    aliases.map(async (alias) => {
      const escapedName = escapeHtml(alias.name);
      const escapedTitle = escapeHtml(alias.title);
      const renderedIcon = renderIcon(alias.icon);
      const localUrl = await portless.getUrl(alias.name).catch(() => `http://localhost:${alias.port}`);
      const startedAt = alias.started;
      const metricsRecord = await resolveAliasMetrics(alias);
      const metricsCount = Object.keys(metricsRecord).length;

      let statusClass: "warning" | "running" | "muted" | "error";
      let statusText: NonNullable<PortMoreAlias["status"]> | "Unknown";

      switch (alias.status) {
        case "Starting":
          statusClass = "warning";
          statusText = "Starting";
          break;
        case "Running":
          statusClass = "running";
          statusText = "Running";
          break;
        case "Stopping":
          statusClass = "warning";
          statusText = "Stopping";
          break;
        case "Stopped":
          statusClass = "muted";
          statusText = "Stopped";
          break;
        case "Error":
          statusClass = "error";
          statusText = "Error";
          break;
        default:
          statusClass = "muted";
          statusText = "Unknown";
          break;
      }

      const isBusy = alias.status === "Starting" || alias.status === "Stopping";
      const toggleLabel = alias.status === "Running" ? "Stop" : "Start";
      const toggleAttributes = isBusy
        ? "disabled aria-disabled=\"true\""
        : "";

      return {
        row: `<tr class="service-row" tabindex="0" role="button" data-service-name="${escapedName}" data-service-title="${escapedTitle}" data-metrics-count="${metricsCount}">
        <td>
          <div class="service-name">
            ${renderedIcon}
            <strong>${escapedTitle}</strong>
          </div>
        </td>
        <td>
          <span class="pill ${statusClass}">${statusText}</span>
        </td>
        <td>${startedAt ? formatStartTime(startedAt) : ""}</td>
        <td><code>${alias.port}</code></td>
        <td>
          <a href="${localUrl}" target="_blank" rel="noopener noreferrer">${localUrl}</a>
        </td>
        <td>
          <div class="actions">
            <button type="button" class="action-btn" data-toggle-service="${escapedName}" ${toggleAttributes}>${toggleLabel}</button>
            <a href="${localUrl}" class="action-btn" target="_blank" rel="noopener noreferrer">Open</a>
          </div>
        </td>
        </tr>`,
      };
    }),
  );

  const envPortlessUrl = process.env.PORTLESS_URL?.trim();
  if (envPortlessUrl) {
    let envName = "PORTLESS_URL";
    try {
      const parsedUrl = new URL(envPortlessUrl);
      const labels = parsedUrl.hostname.split(".");
      if (labels.length > 1) {
        envName = labels.slice(0, -1).join(".");
      } else if (labels[0]) {
        envName = labels[0];
      }
    } catch {
      // Keep fallback label when PORTLESS_URL is not a valid absolute URL.
    }

    renderedRows.unshift({
      row: `<tr>
        <td>
          <div class="service-name">
            <strong>${envName}</strong>
          </div>
        </td>
        <td>
          <span class="pill muted">Main</span>
        </td>
        <td></td>
        <td></td>
        <td>
          <a href="${envPortlessUrl}" target="_blank" rel="noopener noreferrer">${envPortlessUrl}</a>
        </td>
        <td>
          <div class="actions">
            <a href="${envPortlessUrl}" class="action-btn" target="_blank" rel="noopener noreferrer">Open</a>
          </div>
        </td>
      </tr>`,
    });
  }

  const rows = renderedRows.map((entry) => entry.row).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.ico" type="image/svg+xml" />
    <title>Portmore Dashboard</title>
    <style>
      :root {
        color-scheme: dark;
        --bg-0: #070a0f;
        --bg-1: #0c1320;
        --bg-2: #111a28;
        --line: #273347;
        --text-0: #e9edf6;
        --text-1: #b5bfd2;
        --accent: #35b6ff;
        --running-bg: #15372b;
        --running-fg: #67e6ad;
        --starting-bg: #3d2b18;
        --starting-fg: #ffbf73;
        --muted-bg: #1f2937;
        --muted-fg: #a7b3c9;
        --error-bg: #3a1b24;
        --error-fg: #ff8ba4;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Space Grotesk", "Avenir Next", "Segoe UI", sans-serif;
        color: var(--text-0);
        background:
          radial-gradient(circle at 12% 0%, #133657 0%, transparent 44%),
          radial-gradient(circle at 88% 100%, #0f3e33 0%, transparent 36%),
          linear-gradient(180deg, var(--bg-0) 0%, var(--bg-1) 60%, var(--bg-0) 100%);
      }

      .layout {
        max-width: 1100px;
        margin: 0 auto;
        padding: 44px 20px 70px;
      }

      .header {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        align-items: end;
        justify-content: space-between;
        margin-bottom: 20px;
      }

      .title {
        margin: 0;
        font-size: clamp(1.8rem, 2.4vw, 2.5rem);
        letter-spacing: 0.02em;
      }

      .subtitle {
        margin: 7px 0 0;
        color: var(--text-1);
      }

      .kpi {
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent);
        padding: 10px 14px;
        border-radius: 12px;
        min-width: 160px;
      }

      .kpi-label {
        display: block;
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-1);
      }

      .kpi-value {
        display: block;
        font-size: 1.35rem;
        margin-top: 4px;
      }

      .table-shell {
        border: 1px solid var(--line);
        border-radius: 16px;
        overflow: hidden;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.35);
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      thead th {
        text-align: left;
        font-size: 0.77rem;
        text-transform: uppercase;
        letter-spacing: 0.09em;
        color: var(--text-1);
        background: var(--bg-2);
        border-bottom: 1px solid var(--line);
        padding: 14px 16px;
      }

      tbody td {
        border-bottom: 1px solid rgba(74, 91, 118, 0.35);
        padding: 15px 16px;
        vertical-align: middle;
        font-size: 0.95rem;
      }

      tbody tr:last-child td {
        border-bottom: none;
      }

      tbody tr:hover {
        background: rgba(56, 71, 94, 0.26);
      }

      .service-name {
        display: inline-flex;
        gap: 10px;
        align-items: center;
      }

      .service-row {
        cursor: pointer;
        outline: none;
      }

      .service-row:focus,
      .service-row:focus-visible,
      .service-row:active {
        outline: none;
        box-shadow: none;
      }

      .service-row:hover .service-name strong {
        color: #9fdcff;
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .service-icon {
        width: 26px;
        height: 26px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
        line-height: 1;
      }

      .service-icon-svg {
        display: inline-block;
        object-fit: contain;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 0.84rem;
        padding: 4px 10px;
        border-radius: 999px;
        border: 1px solid transparent;
      }

      .pill::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.9;
      }

      .pill.running {
        color: var(--running-fg);
        background: var(--running-bg);
        border-color: rgba(103, 230, 173, 0.22);
      }

      .pill.warning {
        color: var(--starting-fg);
        background: var(--starting-bg);
        border-color: rgba(255, 191, 115, 0.2);
      }

      .pill.muted {
        color: var(--muted-fg);
        background: var(--muted-bg);
        border-color: rgba(167, 179, 201, 0.25);
      }

      .pill.error {
        color: var(--error-fg);
        background: var(--error-bg);
        border-color: rgba(255, 139, 164, 0.28);
      }

      code {
        font-family: "Iosevka", "SF Mono", Menlo, monospace;
        font-size: 0.84rem;
        color: #c8d3e5;
      }

      a {
        color: #7bd0ff;
      }

      .meta {
        margin-left: 8px;
        font-size: 0.78rem;
        color: var(--text-1);
        background: rgba(95, 131, 180, 0.2);
        border: 1px solid rgba(95, 131, 180, 0.35);
        border-radius: 999px;
        padding: 2px 7px;
      }

      .actions {
        display: inline-flex;
        gap: 8px;
      }

      .action-btn {
        appearance: none;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 6px 10px;
        font: inherit;
        color: var(--text-0);
        text-decoration: none;
        background: rgba(255, 255, 255, 0.03);
        cursor: pointer;
      }

      .action-btn:hover {
        border-color: #4b86ab;
        background: rgba(53, 182, 255, 0.15);
      }

      .metrics-dialog {
        border: 1px solid rgba(95, 131, 180, 0.38);
        border-radius: 14px;
        padding: 0;
        width: min(560px, calc(100vw - 32px));
        background: #0f1724;
        color: var(--text-0);
        box-shadow: 0 26px 50px rgba(0, 0, 0, 0.45);
      }

      .metrics-dialog::backdrop {
        background: rgba(2, 7, 12, 0.62);
        backdrop-filter: blur(2px);
      }

      .metrics-dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid rgba(95, 131, 180, 0.25);
      }

      .metrics-dialog-title {
        margin: 0;
        font-size: 1.02rem;
        color: #b7ddf4;
      }

      .metrics-dialog-close {
        appearance: none;
        border: 1px solid rgba(95, 131, 180, 0.45);
        background: rgba(95, 131, 180, 0.14);
        color: var(--text-0);
        border-radius: 8px;
        padding: 4px 9px;
        cursor: pointer;
      }

      .metrics-grid {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        padding: 14px 16px 16px;
      }

      .metric-item {
        border: 1px solid rgba(95, 131, 180, 0.28);
        border-radius: 8px;
        padding: 8px 10px;
        background: rgba(95, 131, 180, 0.08);
      }

      .metric-item span {
        display: block;
        color: var(--text-1);
        font-size: 0.78rem;
        margin-bottom: 4px;
      }

      .metric-item strong {
        font-size: 1rem;
        color: var(--text-0);
      }

      .empty {
        padding: 34px 18px;
        color: var(--text-1);
      }

      @media (max-width: 840px) {
        .layout {
          padding-top: 24px;
        }

        .table-shell {
          overflow-x: auto;
        }

        table {
          min-width: 800px;
        }
      }
    </style>
  </head>
  <body>
    <main class="layout">
      <header class="header">
        <div>
          <h1 class="title">Portmore Dashboard</h1>
          <p class="subtitle">Live alias routing map for local development targets.</p>
        </div>
      </header>

      <section class="table-shell">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Start Time</th>
              <th>Port</th>
              <th>URL</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6" class="empty">No aliases yet. Start a service with portmore to populate this table.</td></tr>`}</tbody>
        </table>
      </section>
    </main>

    <dialog class="metrics-dialog" id="metrics-dialog">
      <header class="metrics-dialog-header">
        <h2 class="metrics-dialog-title" id="metrics-dialog-title">Service metrics</h2>
        <button type="button" class="metrics-dialog-close" id="metrics-dialog-close">Close</button>
      </header>
      <section id="metrics-dialog-content"></section>
    </dialog>

    <script>
      const metricsDialog = document.getElementById("metrics-dialog");
      const metricsDialogTitle = document.getElementById("metrics-dialog-title");
      const metricsDialogContent = document.getElementById("metrics-dialog-content");
      const metricsDialogClose = document.getElementById("metrics-dialog-close");

      if (
        metricsDialog instanceof HTMLDialogElement &&
        metricsDialogTitle instanceof HTMLElement &&
        metricsDialogContent instanceof HTMLElement
      ) {
        const renderMetricsGrid = (metrics) => {
          const entries = Object.entries(metrics || {});

          if (entries.length === 0) {
            return '<div class="metric-item"><span>Status</span><strong>No metrics available</strong></div>';
          }

          return entries
            .map(([key, value]) => {
              const safeKey = String(key)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");

              const normalizedValue = typeof value === "object" && value !== null
                ? JSON.stringify(value)
                : String(value);

              const safeValue = normalizedValue
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");

              return '<div class="metric-item"><span>' + safeKey + '</span><strong>' + safeValue + '</strong></div>';
            })
            .join("");
        };

        const openMetricsDialog = async (row) => {
          const serviceName = row.getAttribute("data-service-name") || "Service";
          const serviceTitle = row.getAttribute("data-service-title") || serviceName;

          metricsDialogTitle.textContent = serviceTitle + " metrics";
          metricsDialogContent.innerHTML = '<div class="metrics-grid"><div class="metric-item"><span>Status</span><strong>Loading...</strong></div></div>';
          metricsDialog.showModal();

          try {
            const response = await fetch("/aliases/" + encodeURIComponent(serviceName) + "/metrics");
            if (!response.ok) {
              metricsDialogContent.innerHTML = '<div class="metrics-grid"><div class="metric-item"><span>Status</span><strong>Failed to load metrics</strong></div></div>';
              return;
            }

            const payload = await response.json();
            const metrics = payload && typeof payload === "object" && payload.metrics && typeof payload.metrics === "object"
              ? payload.metrics
              : {};

            metricsDialogTitle.textContent = serviceTitle + " metrics";
            metricsDialogContent.innerHTML = '<div class="metrics-grid">' + renderMetricsGrid(metrics) + '</div>';
          } catch {
            metricsDialogContent.innerHTML = '<div class="metrics-grid"><div class="metric-item"><span>Status</span><strong>Failed to load metrics</strong></div></div>';
          }
        };

        document.querySelectorAll(".service-row[data-service-name]").forEach((row) => {
          row.addEventListener("click", (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("a, button")) {
              return;
            }

            void openMetricsDialog(row);
          });

          row.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") {
              return;
            }

            const target = event.target;
            if (target instanceof Element && target.closest("a, button")) {
              return;
            }

            event.preventDefault();
            void openMetricsDialog(row);
          });
        });

        if (metricsDialogClose instanceof HTMLButtonElement) {
          metricsDialogClose.addEventListener("click", () => {
            metricsDialog.close();
          });
        }
      }

      document.querySelectorAll(".action-btn[data-toggle-service]").forEach((button) => {
        button.addEventListener("click", async () => {
          const serviceName = button.getAttribute("data-toggle-service");
          if (!serviceName) {
            return;
          }

          button.setAttribute("disabled", "true");

          try {
            const response = await fetch("/aliases/" + encodeURIComponent(serviceName) + "/toggle", {
              method: "POST",
            });

            if (!response.ok) {
              button.textContent = "Failed";
              setTimeout(() => {
                window.location.reload();
              }, 500);
              return;
            }

            window.location.reload();
          } catch {
            button.textContent = "Failed";
            setTimeout(() => {
              window.location.reload();
            }, 500);
          }
        });
      });
    </script>
  </body>
</html>`;
}

export async function startDashboard(): Promise<void> {
  const app = new Hono();

  app.get("/", async (c) => c.html(await renderAliases(aliases)));
  app.get("/favicon.ico", () => {
    return new Response(dashboardFaviconSvg(), {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=86400",
      },
    });
  });
  app.get("/aliases", (c) => c.json(aliases));
  app.get("/aliases/:name/metrics", async (c) => {
    const name = c.req.param("name");
    const alias = aliases.find((entry) => entry.name === name);

    if (!alias) {
      return c.json({ ok: false, error: `Alias ${name} not found` }, 404);
    }

    const metrics = await resolveAliasMetrics(alias);
    return c.json({ ok: true, metrics });
  });

  app.post("/aliases/:name/toggle", async (c) => {
    const name = c.req.param("name");
    const alias = aliases.find((entry) => entry.name === name);

    if (!alias) {
      return c.json({ ok: false, error: `Alias ${name} not found` }, 404);
    }

    try {
      await toggleAlias(alias);
      return c.json({ ok: true, status: alias.status });
    } catch (error) {
      alias.status = "Error";
      const message = error instanceof Error ? error.message : "Unknown error";
      return c.json({ ok: false, error: message }, 500);
    }
  });

  const port = await findFreePort();

  await portless.alias("portmore", (port));

  return new Promise<void>((resolve, reject) => {
    try {
      serve({ fetch: app.fetch, port }, () => {
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}
