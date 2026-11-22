import app from "./app.ts"; // loads .env first

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}: http://localhost:${PORT}/api-docs`);
});
