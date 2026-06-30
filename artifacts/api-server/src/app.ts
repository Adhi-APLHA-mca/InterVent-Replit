import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import http from "http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// Body parsers run for JSON/urlencoded only — they skip multipart/form-data automatically,
// leaving the raw stream intact so the proxy can pipe it through to FastAPI.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const FASTAPI_PREFIXES = [
  "/api/resumes",
  "/api/screening",
  "/api/emails",
  "/api/assessment",
  "/api/aptitude",
  "/api/dsa",
  "/api/meet",
  "/api/jobs",
];

app.use((req: Request, res: Response) => {
  const shouldProxy = FASTAPI_PREFIXES.some((p) => req.path.startsWith(p));
  if (!shouldProxy) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const contentType = (req.headers["content-type"] || "").toLowerCase();
  const isMultipart = contentType.includes("multipart/form-data");

  const options: http.RequestOptions = {
    hostname: "localhost",
    port: 8000,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: "localhost:8000" },
    timeout: 120000,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode ?? 502);
    Object.entries(proxyRes.headers).forEach(([k, v]) => {
      if (v !== undefined) res.setHeader(k, v);
    });
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    logger.error({ err }, "FastAPI proxy error");
    if (!res.headersSent) {
      res.status(502).json({ error: "FastAPI backend unavailable", detail: err.message });
    }
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: "FastAPI backend timed out" });
    }
  });

  if (isMultipart) {
    // Pipe the raw request stream directly to FastAPI.
    // express.json/urlencoded skipped multipart, so the stream is still intact.
    req.pipe(proxyReq);
  } else {
    // For JSON/urlencoded: body parsers already ran — re-encode from req.body.
    const hasBody =
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.body !== undefined &&
      req.body !== null &&
      (typeof req.body !== "object" || Object.keys(req.body as object).length > 0);

    if (hasBody) {
      const body = JSON.stringify(req.body);
      proxyReq.setHeader("content-type", "application/json");
      proxyReq.setHeader("content-length", Buffer.byteLength(body).toString());
      proxyReq.write(body);
    } else {
      proxyReq.removeHeader("content-length");
      proxyReq.removeHeader("content-type");
    }
    proxyReq.end();
  }
});

export default app;
