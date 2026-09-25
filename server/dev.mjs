import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize as normalizePath } from "node:path";
import { fileURLToPath } from "node:url";
import { getTrackerData } from "./tracker-core.mjs";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/tracker") {
      const payload = await getTrackerData();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(payload));
      return;
    }

    const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = normalizePath(join(root, relative));
    if (!filePath.startsWith(normalizePath(root))) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    response.writeHead(200, { "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Not found");
  }
}).listen(port, () => {
  console.log(`Tracker running at http://localhost:${port}`);
});
