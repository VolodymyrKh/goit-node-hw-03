import app from "./app.ts"; // loads .env first
import logger from "./src/logger.ts";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}: http://localhost:${PORT}/api-docs`);
});
