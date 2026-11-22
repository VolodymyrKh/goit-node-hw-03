import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { RequestHandler } from "express";
import multer from "multer";

import logger from "../logger.ts";

export const UPLOADS_DIR = path.resolve(import.meta.dirname, "../../uploads");
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

// Extension from MIME type, not from the client's file name
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

class InvalidFileTypeError extends Error {}

// Multer creates UPLOADS_DIR if it doesn't exist
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`);
  },
});

const multerUpload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in IMAGE_EXTENSIONS) {
      cb(null, true);
    } else {
      cb(new InvalidFileTypeError("image: Only JPEG, PNG, WEBP and GIF images are allowed"));
    }
  },
}).single("image");

// Deletes a temp file; a missing file is not an error
export async function removeTempFile(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error({ err, filePath }, "Failed to delete temp file");
    }
  }
}

// Client file error message for a 400, otherwise null
function fileErrorMessage(err: unknown): string | null {
  if (err instanceof InvalidFileTypeError) return err.message;
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return `image: File is too large (max ${MAX_IMAGE_SIZE / 1024 / 1024} MB)`;
      case "LIMIT_UNEXPECTED_FILE":
      case "LIMIT_FILE_COUNT":
        return `${err.field ?? "file"}: Unexpected file field, send one file in "image"`;
      default:
        return err.message;
    }
  }
  // Busboy parse errors have no code, disk errors do
  if (err instanceof Error && !("code" in err)) {
    return "Malformed multipart/form-data request";
  }
  return null;
}

// Saves optional "image" to uploads/, removes it when the response ends
export const imageUpload: RequestHandler = (req, res, next) => {
  multerUpload(req, res, (err) => {
    if (req.file) {
      const filePath = req.file.path;
      res.on("close", () => void removeTempFile(filePath));
    }

    const message = err ? fileErrorMessage(err) : null;
    if (message) {
      // Same format as validate.ts
      res.status(400).json({
        error: "Validation failed",
        details: { body: [message] },
      });
      return;
    }

    next(err);
  });
};
