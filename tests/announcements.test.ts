import fs from "node:fs";
import path from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { prismaMock } from "./mocks/prisma.ts";

vi.mock("../prisma/client.ts", () => import("./mocks/prisma.ts"));

// Fake Cloudinary SDK
const cloudinaryUpload = vi.hoisted(() => vi.fn());
vi.mock("cloudinary", () => ({
  v2: { config: vi.fn(), uploader: { upload: cloudinaryUpload } },
}));

import app from "../app.ts";
import { generateTokens } from "../src/controllers/auth.controller.ts";
import { UPLOADS_DIR } from "../src/middleware/upload.ts";

const IMAGE_URL =
  "https://res.cloudinary.com/demo/image/upload/v1/announcements/abc123.jpg";
// PNG signature, never decoded
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

const author = {
  id: 1,
  username: "ivan_petrenko",
  email: "ivan@example.com",
  name: "Іван",
};
const fields = {
  title: "Продам велосипед",
  description: "Trek у відмінному стані, розмір рами L",
  price: "8500",
  category: "sale",
};

const token = generateTokens(author.id).accessToken;
const auth = { Authorization: `Bearer ${token}` };

// Files in uploads/ except .gitkeep
const tempFiles = () =>
  fs.existsSync(UPLOADS_DIR)
    ? fs.readdirSync(UPLOADS_DIR).filter((name) => name !== ".gitkeep")
    : [];

// Echoes the saved data back like Prisma would
const fakeAnnouncement = async ({ data }: { data: Record<string, unknown> }) => ({
  id: 1,
  ...fields,
  price: 8500,
  ...data,
  imageUrl: data.imageUrl ?? null,
  createdAt: new Date(),
  updatedAt: new Date(),
  user: author,
});

const postForm = () =>
  request(app)
    .post("/announcements")
    .set(auth)
    .field("title", fields.title)
    .field("description", fields.description)
    .field("price", fields.price)
    .field("category", fields.category);

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.announcement.create.mockImplementation(fakeAnnouncement);
  prismaMock.announcement.update.mockImplementation(fakeAnnouncement);
  cloudinaryUpload.mockResolvedValue({ secure_url: IMAGE_URL });
});

describe("POST /announcements with an image", () => {
  it("uploads the image to Cloudinary, saves the URL and deletes the temp file", async () => {
    const res = await postForm().attach("image", PNG, "bike.png");

    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBe(IMAGE_URL);
    expect(res.body.price).toBe(8500);
    expect(prismaMock.announcement.create.mock.calls[0][0].data).toMatchObject({
      imageUrl: IMAGE_URL,
      price: 8500, // multipart string coerced to a number
      userId: author.id,
    });

    // Saved to uploads/, then removed
    const [uploadedPath] = cloudinaryUpload.mock.calls[0];
    expect(path.dirname(uploadedPath)).toBe(UPLOADS_DIR);
    expect(fs.existsSync(uploadedPath)).toBe(false);
  });

  it("creates an announcement without an image (imageUrl is optional)", async () => {
    const res = await postForm();

    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBeNull();
    expect(cloudinaryUpload).not.toHaveBeenCalled();
  });

  it("still accepts JSON without an image", async () => {
    const res = await request(app)
      .post("/announcements")
      .set(auth)
      .send({ ...fields, price: 8500 });

    expect(res.status).toBe(201);
    expect(res.body.imageUrl).toBeNull();
  });

  it("rejects a non-image file with 400", async () => {
    const res = await postForm().attach("image", Buffer.from("hello"), "notes.txt");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
    expect(cloudinaryUpload).not.toHaveBeenCalled();
    expect(tempFiles()).toEqual([]);
  });

  it("deletes the temp file when validation fails", async () => {
    const res = await postForm()
      .field("title", "no") // second value turns title into an array
      .attach("image", PNG, "bike.png");

    expect(res.status).toBe(400);
    expect(cloudinaryUpload).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(tempFiles()).toEqual([]));
  });

  it("returns 502 and deletes the temp file when Cloudinary fails", async () => {
    cloudinaryUpload.mockRejectedValue(new Error("Cloudinary is down"));

    const res = await postForm().attach("image", PNG, "bike.png");

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Image upload failed" });
    expect(prismaMock.announcement.create).not.toHaveBeenCalled();
    expect(tempFiles()).toEqual([]);
  });

  it("returns 400 for a malformed multipart body", async () => {
    const res = await request(app)
      .post("/announcements")
      .set(auth)
      .set("Content-Type", "multipart/form-data; boundary=XYZ")
      .send('--XYZ\r\nContent-Disposition: form-data; name="title"\r\n\r\nabc');

    expect(res.status).toBe(400);
    expect(res.body.details.body).toEqual(["Malformed multipart/form-data request"]);
  });

  it("requires a token and does not save the file for guests", async () => {
    const res = await request(app)
      .post("/announcements")
      .attach("image", PNG, "bike.png");

    expect(res.status).toBe(401);
    expect(tempFiles()).toEqual([]);
  });
});

describe("PATCH /announcements/:id with an image", () => {
  it("updates only the image", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({ userId: author.id });

    const res = await request(app)
      .patch("/announcements/1")
      .set(auth)
      .attach("image", PNG, "bike.png");

    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toBe(IMAGE_URL);
    expect(prismaMock.announcement.update.mock.calls[0][0].data).toEqual({
      imageUrl: IMAGE_URL,
    });
  });

  it("rejects an empty update with 400", async () => {
    const res = await request(app).patch("/announcements/1").set(auth).send({});

    expect(res.status).toBe(400);
    expect(res.body.details.body).toEqual([
      "At least one field or an image must be provided",
    ]);
  });

  it("does not upload an image for someone else's announcement", async () => {
    prismaMock.announcement.findUnique.mockResolvedValue({ userId: 999 });

    const res = await request(app)
      .patch("/announcements/1")
      .set(auth)
      .attach("image", PNG, "bike.png");

    expect(res.status).toBe(403);
    expect(cloudinaryUpload).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(tempFiles()).toEqual([]));
  });
});
