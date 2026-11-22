# Announcements Board REST API

REST API for an announcements board: users register, log in and manage their own announcements with an optional photo; guests can browse them.

**Stack:** Node.js, Express 5, TypeScript (tsx), Prisma 7 + PostgreSQL, Zod, JWT, bcrypt, helmet, cors, express-rate-limit, pino, multer + Cloudinary, Vitest, OpenAPI (Swagger UI), Docker.

## Run with Docker

```bash
cp .env.example .env     # set JWT_SECRET and Cloudinary credentials
docker compose up -d --build
```

API and docs: http://localhost:3000/api-docs. Migrations are applied on container start.

```bash
docker compose logs -f api   # logs
docker compose down          # stop (data kept in the pgdata volume)
docker compose down -v       # stop and delete data
```

## Run locally

Requires Node.js 20.19+ and PostgreSQL.

```bash
npm install
cp .env.example .env         # set DATABASE_URL, JWT_SECRET, Cloudinary credentials
npm run prisma:migrate
npm run dev
```

## Environment

| Variable                | Description                                  |
| ----------------------- | -------------------------------------------- |
| `DATABASE_URL`          | PostgreSQL connection string                 |
| `JWT_SECRET`            | Secret for signing tokens                    |
| `PORT`                  | Server port (default `3000`)                 |
| `API_PORT`              | Host port in Docker Compose (default `3000`) |
| `ALLOWED_ORIGINS`       | Comma-separated origins allowed by CORS      |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name                        |
| `CLOUDINARY_API_KEY`    | Cloudinary API key                           |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret                        |
| `LOG_LEVEL`             | pino log level (default `info`)              |

Swagger UI sends requests from its own origin, so keep `http://localhost:3000` in `ALLOWED_ORIGINS` to use "Try it out".

## Endpoints

| Method | Path                 | Auth | Description                             |
| ------ | -------------------- | ---- | --------------------------------------- |
| POST   | `/auth/register`     |      | Register, returns user and token pair   |
| POST   | `/auth/login`        |      | Log in, returns user and token pair     |
| POST   | `/auth/refresh`      |      | Exchange refresh token for a new pair   |
| POST   | `/auth/logout`       | ✓    | Revoke the user's refresh token         |
| GET    | `/auth/me`           | ✓    | Current user profile                    |
| GET    | `/announcements`     |      | List: `search`, `sort=newest\|oldest`, `page` |
| GET    | `/announcements/:id` |      | Announcement with author                |
| POST   | `/announcements`     | ✓    | Create, optional photo                  |
| PATCH  | `/announcements/:id` | ✓    | Partial update and/or new photo, owner only |
| DELETE | `/announcements/:id` | ✓    | Delete, owner only                      |

Protected routes expect `Authorization: Bearer <accessToken>`.

### Photos

`POST /announcements` and `PATCH /announcements/:id` accept `multipart/form-data` with the text fields and an optional file in the `image` field (JPEG, PNG, WEBP or GIF, up to 5 MB). JSON without a photo still works.

```bash
curl -X POST http://localhost:3000/announcements \
  -H "Authorization: Bearer <accessToken>" \
  -F title="Продам велосипед" -F description="Trek у відмінному стані, розмір рами L" \
  -F price=8500 -F category=sale -F image=@bike.jpg
```

Multer saves the file to `uploads/`, it is uploaded to Cloudinary (folder `announcements`), and the local copy is deleted. Only the returned URL is stored in `imageUrl` (`null` when there is no photo).

## Validation

| Field         | Rules                                  |
| ------------- | -------------------------------------- |
| `username`    | string, 3–30 chars                     |
| `email`       | valid email                            |
| `password`    | string, min 6 chars                    |
| `name`        | string, min 2 chars                    |
| `title`       | string, 5–50 chars                     |
| `description` | string, min 10 chars                   |
| `price`       | number > 0                             |
| `category`    | `sale`, `service`, `job` or `other`    |

PATCH accepts any subset of announcement fields or just a new image, but not an empty request. Errors return `400` with `{ error, details: { body | params | query: [...] } }`.

## Security and logging

- **helmet** sets secure HTTP headers on every response.
- **CORS** allows browser requests only from `ALLOWED_ORIGINS`; other origins get `403 Origin not allowed by CORS`. Requests without an `Origin` header (curl, Postman) are allowed.
- **Rate limiting** on all `/auth/*` routes: 10 requests per IP per 15 minutes, then `429 Too many requests, please try again later`.
- **pino-http** logs every request (method, URL, status, response time); 4xx are `warn`, 5xx are `error` with the stack. Controllers log registration, login (and failed attempts), token refresh, logout, image uploads and announcement changes. The logger lives in `src/logger.ts`: pretty output in development, JSON when `NODE_ENV=production`. Tokens and passwords are never logged.

## Implementation notes

- **Tokens:** access token lives 15 min, refresh token 7 days. Both carry a `type` claim, so a refresh token can't be used as an access token.
- **Refresh tokens:** stored in the DB, rotated on every refresh. Login replaces the old token, logout deletes it.
- **Login:** unknown username and wrong password both return `401 Invalid credentials`, and both take the same time.
- **Ownership:** PATCH and DELETE return `403 Access denied` for someone else's announcement and `404` for a missing one.
- **Pagination:** 10 items per page; `count()` uses the same filter as `findMany()`.
- **Passwords:** stored as bcrypt hashes and never returned.
- **Uploads:** the temp file is removed after the Cloudinary upload and also when the request fails earlier (validation, 403, 404). The image is uploaded only after the ownership check. If Cloudinary fails, the API returns `502 Image upload failed`.

## Tests

```bash
npm test             # watch mode
npm test -- --run    # single run
```

Vitest + supertest. Prisma and Cloudinary are mocked, so tests need no database, `.env` or network.

- `tests/auth.test.ts`: token generation (unit), register (201, 409, 400, password hashing), login (200, 401), rate limiting (429 on the 11th request, other routes not limited)
- `tests/announcements.test.ts`: photo upload to Cloudinary and temp file removal, optional photo, file type and multipart errors, PATCH with only a photo, ownership check before upload, Cloudinary failure
- `tests/security.test.ts`: helmet headers, CORS allowed and rejected origins

## Project structure

```
prisma/              schema, migrations, Prisma client
src/
  controllers/       auth and announcements handlers
  middleware/        authenticate, validate, upload (multer), rateLimit
  routes/            routers and OpenAPI path registration
  services/          Cloudinary upload
  validators/        Zod request and response schemas
  logger.ts          pino logger
  openapi.ts         OpenAPI registry and bearerAuth scheme
tests/               Vitest tests
uploads/             temporary files (kept empty)
app.ts               Express app: middleware, routes, error handler
server.ts            entry point: starts the server
vitest.config.ts     Vitest config
Dockerfile           API image
docker-compose.yml   API + PostgreSQL
```

## Scripts

| Command                   | Description                   |
| ------------------------- | ----------------------------- |
| `npm run dev`             | Start with watch mode         |
| `npm start`               | Start                         |
| `npm test`                | Run tests (Vitest)            |
| `npm run prisma:migrate`  | Create and apply migrations   |
| `npm run prisma:generate` | Generate Prisma Client        |
