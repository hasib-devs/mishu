import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/chithi/schema.ts",
  out: "./drizzle",
});
