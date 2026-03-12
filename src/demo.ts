import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { portmore } from "./index.js";
import { openInBrowser } from "./open-in-browser.js";

let visitsA = 0;
let visitsB = 0;

await portmore({
  name: "server-a",
  title: "Server A",
  icon: "🧪",
  metrics: () => {
    return Promise.resolve({
      visits: visitsA,
      server: "hono",
    });
  },
  start: async (port) => {
    const app = new Hono();

    app.get("/", (c) => {
      visitsA += 1;
      return c.text("Server A\n");
    });

    app.get("/server-b", async (c) => {
      visitsA += 1;

      const serverBUrl = await portmore("server-b");
      if (!serverBUrl) {
        return c.text("Server B alias not found\n", 404);
      }

      try {
        const upstream = await fetch(serverBUrl);
        const body = await upstream.text();

        return new Response(body, {
          status: upstream.status,
          headers: {
            "content-type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8",
          },
        });
      } catch {
        return c.text("Failed to call Server B\n", 502);
      }
    });

    return serve({ fetch: app.fetch, port });
  },
  stop: async (server) => {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  },
});

await portmore({
  name: "server-b",
  title: "Server B",
  icon: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='#7bd0ff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='9'/><path d='M3 12h18'/><path d='M12 3c2.5 2.7 2.5 15.3 0 18'/><path d='M12 3c-2.5 2.7-2.5 15.3 0 18'/></svg>",
  metrics: () => {
    return Promise.resolve({
      visits: visitsB,
      server: "node",
    });
  },
  start: async (port) => {
    const server = createServer((_: IncomingMessage, res: ServerResponse) => {
      visitsB += 1;
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Server B\n");
    });

    return server?.listen(port);
  },
  stop: async (server) => {
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  },
});

const port = Number(process.env.PORT) || 3000;

const server = createServer((_: IncomingMessage, res: ServerResponse) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Hello, World!\n");
});

server.listen(port);

console.log(`Demo running on port: ` + port);

if (process.env.PORTLESS_URL) {
  openInBrowser("http://portmore.localhost:1355");
}
