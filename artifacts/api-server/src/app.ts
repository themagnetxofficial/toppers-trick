import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import multer from "multer";
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
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailable,
} from "./lib/serviceAvailability";

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

app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (res.headersSent) {
      next(err);
      return;
    }

    req.log.error({ err }, "Unhandled API request error");

    if (isDatabaseUnavailable(err)) {
      res.status(503).json({ error: DATABASE_UNAVAILABLE_MESSAGE });
      return;
    }

    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: "Upload failed. Check the file size and try again." });
      return;
    }

    if (err instanceof Error && err.message === "Only PDF, JPG, and PNG files are allowed") {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: "Unable to complete this request. Please try again." });
  },
);

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
