import pino from "pino";

// Pretty in development, JSON in production and tests
const isDev =
  process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  // Never log tokens or cookies
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    'res.headers["set-cookie"]',
  ],
  ...(isDev && { transport: { target: "pino-pretty" } }),
});

export default logger;
