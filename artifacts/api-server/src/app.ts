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
];

app.use((req: Request, res: Response) => {
  const shouldProxy = FASTAPI_PREFIXES.some((p) => req.path.startsWith(p));
  if (!shouldProxy) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined;
  const body = hasBody ? JSON.stringify(req.body) : "";

  const headers: http.OutgoingHttpHeaders = {
    ...req.headers,
    host: "localhost:8000",
  };
  if (hasBody) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(body).toString();
  } else {
    delete headers["content-length"];
    delete headers["content-type"];
  }

  const options: http.RequestOptions = {
    hostname: "localhost",
    port: 8000,
    path: req.url,
    method: req.method,
    headers,
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
    res.status(502).json({ error: "FastAPI backend unavailable", detail: err.message });
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    res.status(504).json({ error: "FastAPI backend timed out" });
  });

  if (hasBody) proxyReq.write(body);
  proxyReq.end();
});

export default app;
