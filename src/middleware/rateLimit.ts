import { MemoryStore, rateLimit } from "express-rate-limit";

// Exported so tests can reset counters
export const authLimiterStore = new MemoryStore();

// Max 10 requests per IP per 15 minutes
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8", // RateLimit and RateLimit-Policy headers
  legacyHeaders: false,
  store: authLimiterStore,
  message: { error: "Too many requests, please try again later" },
});
