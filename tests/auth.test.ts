import bcrypt from "bcrypt";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prismaMock } from "./mocks/prisma.ts";

vi.mock("../prisma/client.ts", () => import("./mocks/prisma.ts"));

import app from "../app.ts";
import { generateTokens } from "../src/controllers/auth.controller.ts";
import { verifyToken } from "../src/middleware/authenticate.ts";
import { authLimiterStore } from "../src/middleware/rateLimit.ts";

const validUser = {
  username: "ivan_petrenko",
  email: "ivan@example.com",
  password: "secret123",
  name: "Іван",
};

beforeEach(() => {
  vi.clearAllMocks();
  authLimiterStore.resetAll(); // fresh rate limit per test
});

describe("generateTokens (unit)", () => {
  it("creates an access and a refresh token for the user", () => {
    const { accessToken, refreshToken } = generateTokens(42);

    expect(verifyToken(accessToken, "access").sub).toBe("42");
    expect(verifyToken(refreshToken, "refresh").sub).toBe("42");
  });

  it("does not accept a refresh token as an access token", () => {
    const { refreshToken } = generateTokens(42);

    expect(() => verifyToken(refreshToken, "access")).toThrow();
  });
});

describe("POST /auth/register", () => {
  it("returns 201, stores a bcrypt hash and never returns the password", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.create.mockImplementation(async ({ data }) => ({
      id: 1,
      username: data.username,
      email: data.email,
      name: data.name,
    }));
    prismaMock.refreshToken.create.mockResolvedValue({});

    const res = await request(app).post("/auth/register").send(validUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: 1,
      username: validUser.username,
      email: validUser.email,
      name: validUser.name,
    });
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain(validUser.password);

    // Password is hashed before it reaches the database
    const savedPassword = prismaMock.user.create.mock.calls[0][0].data.password;
    expect(savedPassword).not.toBe(validUser.password);
    await expect(bcrypt.compare(validUser.password, savedPassword)).resolves.toBe(true);
  });

  it("returns 409 when username or email is taken", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 1 });

    const res = await request(app).post("/auth/register").send(validUser);

    expect(res.status).toBe(409);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid data", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validUser, email: "not-an-email", password: "123" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 1,
      username: validUser.username,
      email: validUser.email,
      name: validUser.name,
      password: await bcrypt.hash(validUser.password, 4),
    });
    prismaMock.$transaction.mockResolvedValue([]);
  });

  it("returns 200 with tokens for valid credentials", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ username: validUser.username, password: validUser.password });

    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty("password");
    expect(verifyToken(res.body.accessToken, "access").sub).toBe("1");
  });

  it("returns 401 for a wrong password", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ username: validUser.username, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("Auth rate limiting", () => {
  it("allows 10 requests per IP and returns 429 on the 11th", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/auth/login").send({});
      expect(res.status).toBe(400); // passes the limiter, fails validation
    }

    const res = await request(app).post("/auth/login").send({});

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: "Too many requests, please try again later" });
  });

  it("does not limit non-auth routes", async () => {
    prismaMock.$transaction.mockResolvedValue([0, []]);

    for (let i = 0; i < 12; i++) {
      const res = await request(app).get("/announcements");
      expect(res.status).toBe(200);
    }
  });
});
