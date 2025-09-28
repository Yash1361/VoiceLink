import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import type { Connect, PluginOption } from "vite";
import type { IncomingMessage } from "http";
import { configureAgentMailClient, send_email } from "./agentmail/index";

dotenv.config();

function createAgentMailMiddleware(): Connect.NextHandleFunction {
  let isConfigured = false;

  const ensureConfigured = () => {
    if (isConfigured) {
      return;
    }

    const apiKey = process.env.AGENTMAIL_API_KEY ?? process.env.VITE_AGENTMAIL_API_KEY ?? "";
    if (!apiKey.trim()) {
      throw new Error("AGENTMAIL_API_KEY is not set. Add it to your environment for AgentMail requests.");
    }

    configureAgentMailClient(apiKey.trim());
    isConfigured = true;
  };

  const readRequestBody = (req: IncomingMessage) =>
    new Promise<string>((resolve, reject) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
        if (data.length > 1_000_000) {
          reject(new Error("AgentMail payload too large"));
          req.destroy();
        }
      });
      req.on("end", () => resolve(data));
      req.on("error", (error) => reject(error));
    });

  const handler: Connect.NextHandleFunction = async (req, res, next) => {
    const url = req.url ?? "";
    if (!url.startsWith("/agentmail/send")) {
      next();
      return;
    }

    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, message: "Method not allowed" }));
      return;
    }

    try {
      ensureConfigured();
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      const message = error instanceof Error ? error.message : "Missing AgentMail configuration";
      res.end(JSON.stringify({ success: false, message }));
      return;
    }

    try {
      const rawBody = await readRequestBody(req);
      let payload: { to?: string; subject?: string; text?: string; html?: string };
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch (parseError) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ success: false, message: "Invalid JSON payload" }));
        return;
      }

      const { to, subject, text, html } = payload;
      if (!to || !subject || !text) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: "Fields 'to', 'subject', and 'text' are required.",
          })
        );
        return;
      }

      await send_email({ subject, text, html }, to);

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true }));
    } catch (error) {
      console.error("[AgentMail] Proxy error", error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      const message = error instanceof Error ? error.message : "Unknown error";
      res.end(JSON.stringify({ success: false, message }));
    }
  };

  return handler;
}

function agentMailProxyPlugin(): PluginOption {
  return {
    name: "voicelink-agentmail-proxy",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createAgentMailMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createAgentMailMiddleware());
    },
  };
}

export default defineConfig({
  plugins: [react(), agentMailProxyPlugin()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8000",
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
