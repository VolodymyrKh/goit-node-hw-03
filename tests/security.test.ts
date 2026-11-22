import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../prisma/client.ts", () => import("./mocks/prisma.ts"));

import app from "../app.ts";

// ALLOWED_ORIGINS is set in vitest.config.ts
const ALLOWED = "http://localhost:5173";
const FORBIDDEN = "http://evil.example.com";

describe("Helmet", () => {
  it("sets secure HTTP headers", async () => {
    const res = await request(app).get("/unknown-route");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("CORS", () => {
  it("allows an origin from ALLOWED_ORIGINS", async () => {
    const res = await request(app).get("/unknown-route").set("Origin", ALLOWED);

    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
  });

  it("answers a preflight request from an allowed origin", async () => {
    const res = await request(app)
      .options("/announcements")
      .set("Origin", ALLOWED)
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(ALLOWED);
  });

  it("rejects other origins with 403", async () => {
    const res = await request(app).get("/announcements").set("Origin", FORBIDDEN);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Origin not allowed by CORS" });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests without an Origin header (curl, Postman)", async () => {
    const res = await request(app).get("/unknown-route");

    expect(res.status).toBe(404);
  });
});
