import { z } from "zod";
import "../openapi.ts"; // runs extendZodWithOpenApi(z)
import { UserSchema } from "./auth.validator.ts";

export const CATEGORIES = ["sale", "service", "job", "other"] as const;
export const PER_PAGE = 10;

const PG_INT_MAX = 2147483647; // Postgres INT upper bound
// Keeps skip within PG_INT_MAX
const MAX_PAGE = Math.floor(PG_INT_MAX / PER_PAGE) + 1;

const categorySchema = z.enum(CATEGORIES).openapi({ example: "sale" });

// Request schemas

const announcementFields = {
  title: z
    .string()
    .trim()
    .min(5)
    .max(50)
    .openapi({ example: "Продам велосипед" }),
  description: z
    .string()
    .trim()
    .min(10)
    .openapi({ example: "Гірський велосипед, 21 швидкість" }),
  // Multipart sends numbers as strings
  price: z.coerce.number().positive().openapi({ example: 8000 }),
  category: categorySchema,
};

export const createAnnouncementSchema = z
  .object(announcementFields)
  .openapi("CreateAnnouncementRequest");

// Non-empty check is in the PATCH route: the image is in req.file
export const updateAnnouncementSchema = createAnnouncementSchema
  .partial()
  .openapi("UpdateAnnouncementRequest");

// Multipart forms (OpenAPI only), flat so Swagger UI shows a file picker
const imageField = z.string().openapi({
  type: "string",
  format: "binary",
  description: "Optional image: JPEG, PNG, WEBP or GIF, up to 5 MB",
});

export const CreateAnnouncementFormSchema = z
  .object({ ...announcementFields, image: imageField.optional() })
  .openapi("CreateAnnouncementForm");

export const UpdateAnnouncementFormSchema = CreateAnnouncementFormSchema
  .partial()
  .openapi("UpdateAnnouncementForm");

export const announcementIdParamsSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive()
    .max(PG_INT_MAX)
    .openapi({ param: { name: "id", in: "path" }, example: 5 }),
});

export const listAnnouncementsQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .optional()
    .openapi({ description: "Case-insensitive search by title", example: "ноутбук" }),
  sort: z
    .enum(["newest", "oldest"])
    .default("newest")
    .openapi({ description: "Sort by createdAt" }),
  page: z.coerce
    .number()
    .int()
    .positive()
    .max(MAX_PAGE)
    .default(1)
    .openapi({ description: "Page number (10 items per page)", example: 1 }),
});

export type CreateAnnouncementBody = z.infer<typeof createAnnouncementSchema>;
export type UpdateAnnouncementBody = z.infer<typeof updateAnnouncementSchema>;
export type AnnouncementIdParams = z.infer<typeof announcementIdParamsSchema>;
export type ListAnnouncementsQuery = z.infer<typeof listAnnouncementsQuerySchema>;

// Response schemas (OpenAPI only)

export const AnnouncementSchema = z
  .object({
    id: z.number().int().openapi({ example: 5 }),
    title: z.string().openapi({ example: "Продам ноутбук ASUS" }),
    description: z.string().openapi({ example: "Відмінний стан, 16GB RAM" }),
    price: z.number().openapi({ example: 18000 }),
    category: categorySchema,
    imageUrl: z.url().nullable().openapi({
      example:
        "https://res.cloudinary.com/demo/image/upload/v1/announcements/abc123.jpg",
    }),
    createdAt: z.iso.datetime().openapi({ example: "2025-01-10T12:00:00.000Z" }),
    updatedAt: z.iso.datetime().openapi({ example: "2025-01-10T12:00:00.000Z" }),
    user: UserSchema,
  })
  .openapi("Announcement");

export const AnnouncementListSchema = z
  .object({
    data: z.array(AnnouncementSchema),
    pagination: z.object({
      total: z.number().int().openapi({ example: 23 }),
      page: z.number().int().openapi({ example: 2 }),
      totalPages: z.number().int().openapi({ example: 3 }),
      perPage: z.number().int().openapi({ example: PER_PAGE }),
    }),
  })
  .openapi("AnnouncementList");
