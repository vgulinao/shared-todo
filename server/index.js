import http from "node:http";

const port = Number(process.env.PORT ?? 3000);

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end("<h1>Hello from Railway</h1>");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`listening on ${port}`);
});
