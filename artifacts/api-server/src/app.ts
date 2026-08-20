import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { logger } from "./lib/logger";
import router from "./routes";
import { join } from "path";
import { existsSync } from "fs";

const app = express();

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

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Serve the built React frontend in production.
// The frontend is built to artifacts/smart-study-guide/dist/public/ by vite build.
// This must come AFTER the API router so /api/* routes are not intercepted.
if (process.env.NODE_ENV === "production") {
  const frontendDist = join(process.cwd(), "artifacts/smart-study-guide/dist/public");
  if (existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    // Catch-all: send index.html for any non-API route so client-side routing works
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(join(frontendDist, "index.html"));
    });
    logger.info({ frontendDist }, "Serving frontend static files");
  } else {
    logger.warn({ frontendDist }, "Frontend dist not found — run vite build first");
  }
}

export default app;
