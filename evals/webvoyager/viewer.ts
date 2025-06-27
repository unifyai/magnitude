import { readdir, readFile } from "fs/promises";
import { join } from "path";

const port = 8000;
const resultsDir = "./results";

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // API endpoints
    if (path === "/api/tasks") {
      return await getTasksList();
    } else if (path.startsWith("/api/task/")) {
      const taskName = decodeURIComponent(path.slice(10));
      return await getTaskData(taskName);
    } else if (path === "/" || path === "") {
      // Serve the HTML file
      try {
        const html = await Bun.file("./viewer.html").text();
        return new Response(html, {
          headers: { "content-type": "text/html" },
        });
      } catch {
        return new Response("visualizer.html not found", { status: 404 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
});

async function getTasksList(): Promise<Response> {
  try {
    const files = await readdir(resultsDir);
    const tasks = files
      .filter(file => file.endsWith(".json"))
      .map(file => file.slice(0, -5)) // Remove .json extension
      .sort();
    
    return new Response(JSON.stringify(tasks), {
      headers: { "content-type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

async function getTaskData(taskName: string): Promise<Response> {
  try {
    const filePath = join(resultsDir, `${taskName}.json`);
    const data = await readFile(filePath, "utf-8");
    
    // Validate JSON
    JSON.parse(data);
    
    return new Response(data, {
      headers: { "content-type": "application/json" },
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return new Response(JSON.stringify({ error: `Task not found: ${taskName}` }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

console.log(`WebVoyager visualizer server running at http://localhost:${port}`);
console.log("Press Ctrl+C to stop the server");