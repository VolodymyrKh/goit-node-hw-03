import { v2 as cloudinary } from "cloudinary";
import createHttpError from "http-errors";

import logger from "../logger.ts";
import { removeTempFile } from "../middleware/upload.ts";

const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
  process.env;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  logger.warn("Cloudinary is not configured: image uploads will fail");
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
  secure: true,
});

const FOLDER = "announcements";

// Uploads to Cloudinary, always deletes the temp file, returns the URL
export async function uploadImage(filePath: string): Promise<string> {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: FOLDER,
      resource_type: "image",
    });
    return result.secure_url;
  } catch (err) {
    logger.error({ err }, "Cloudinary upload failed");
    throw createHttpError(502, "Image upload failed", { expose: true });
  } finally {
    await removeTempFile(filePath);
  }
}
