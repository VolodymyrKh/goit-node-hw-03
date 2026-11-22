import { Router, type RequestHandler } from "express";

import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncementById,
  listAnnouncements,
  updateAnnouncement,
} from "../controllers/announcements.controller.ts";
import { authenticate } from "../middleware/authenticate.ts";
import { imageUpload } from "../middleware/upload.ts";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.ts";
import {
  AnnouncementListSchema,
  AnnouncementSchema,
  CreateAnnouncementFormSchema,
  UpdateAnnouncementFormSchema,
  announcementIdParamsSchema,
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from "../validators/announcements.validator.ts";
import {
  ErrorSchema,
  ValidationErrorSchema,
  bearerAuth,
  registry,
} from "../openapi.ts";

const router = Router();

// PATCH needs at least one field or a new image
const requireChanges: RequestHandler = (req, res, next) => {
  if (Object.keys(req.body).length === 0 && !req.file) {
    res.status(400).json({
      error: "Validation failed",
      details: { body: ["At least one field or an image must be provided"] },
    });
    return;
  }
  next();
};

// Public routes
router.get("/", validateQuery(listAnnouncementsQuerySchema), listAnnouncements);
router.get("/:id", validateParams(announcementIdParamsSchema), getAnnouncementById);

// Protected routes; imageUpload after authenticate, so guests cannot write to disk
router.post(
  "/",
  authenticate,
  imageUpload,
  validateBody(createAnnouncementSchema),
  createAnnouncement,
);
router.patch(
  "/:id",
  authenticate,
  validateParams(announcementIdParamsSchema),
  imageUpload,
  validateBody(updateAnnouncementSchema),
  requireChanges,
  updateAnnouncement,
);
router.delete(
  "/:id",
  authenticate,
  validateParams(announcementIdParamsSchema),
  deleteAnnouncement,
);

export default router;

// OpenAPI docs

const json = <T>(schema: T) => ({ "application/json": { schema } });
// Multipart first, so Swagger UI shows the file picker
const formOrJson = <F, J>(formSchema: F, jsonSchema: J) => ({
  "multipart/form-data": { schema: formSchema },
  ...json(jsonSchema),
});
const security = [{ [bearerAuth.name]: [] }];
const unauthorized = {
  description: "Missing, invalid or expired access token",
  content: json(ErrorSchema),
};

registry.registerPath({
  method: "get",
  path: "/announcements",
  tags: ["Announcements"],
  summary: "List announcements with pagination, search and sorting",
  request: { query: listAnnouncementsQuerySchema },
  responses: {
    200: { description: "Paginated list", content: json(AnnouncementListSchema) },
    400: { description: "Invalid query parameters", content: json(ValidationErrorSchema) },
  },
});

registry.registerPath({
  method: "get",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Get an announcement by ID",
  request: { params: announcementIdParamsSchema },
  responses: {
    200: { description: "Announcement with author", content: json(AnnouncementSchema) },
    400: { description: "Invalid ID", content: json(ValidationErrorSchema) },
    404: { description: "Announcement not found", content: json(ErrorSchema) },
  },
});

registry.registerPath({
  method: "post",
  path: "/announcements",
  tags: ["Announcements"],
  summary: "Create an announcement with an optional image",
  description:
    "Send multipart/form-data to attach an image (field `image`). " +
    "The image is uploaded to Cloudinary and its URL is saved as `imageUrl`. " +
    "JSON without an image is also accepted. The author is taken from the token.",
  security,
  request: {
    body: {
      content: formOrJson(CreateAnnouncementFormSchema, createAnnouncementSchema),
      required: true,
    },
  },
  responses: {
    201: { description: "Announcement created", content: json(AnnouncementSchema) },
    400: {
      description: "Validation failed, wrong file type or file larger than 5 MB",
      content: json(ValidationErrorSchema),
    },
    401: unauthorized,
    502: { description: "Image upload to Cloudinary failed", content: json(ErrorSchema) },
  },
});

registry.registerPath({
  method: "patch",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Partially update own announcement, optionally replacing the image",
  description:
    "Send at least one field or a new image. Use multipart/form-data to " +
    "upload an image (field `image`) or JSON to update text fields only.",
  security,
  request: {
    params: announcementIdParamsSchema,
    body: {
      content: formOrJson(UpdateAnnouncementFormSchema, updateAnnouncementSchema),
      required: true,
    },
  },
  responses: {
    200: { description: "Announcement updated", content: json(AnnouncementSchema) },
    400: {
      description: "Validation failed, nothing to update, wrong file type or file larger than 5 MB",
      content: json(ValidationErrorSchema),
    },
    401: unauthorized,
    403: { description: "Announcement belongs to another user", content: json(ErrorSchema) },
    404: { description: "Announcement not found", content: json(ErrorSchema) },
    502: { description: "Image upload to Cloudinary failed", content: json(ErrorSchema) },
  },
});

registry.registerPath({
  method: "delete",
  path: "/announcements/{id}",
  tags: ["Announcements"],
  summary: "Delete own announcement",
  security,
  request: { params: announcementIdParamsSchema },
  responses: {
    204: { description: "Announcement deleted" },
    400: { description: "Invalid ID", content: json(ValidationErrorSchema) },
    401: unauthorized,
    403: { description: "Announcement belongs to another user", content: json(ErrorSchema) },
    404: { description: "Announcement not found", content: json(ErrorSchema) },
  },
});
