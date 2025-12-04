import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static files normally (allows caching for JS/CSS with hashed filenames)
  app.use(express.static(distPath));

  // No caching for index.html
  app.get("/", (req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });

  // Fallback for SPA routes
  app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
