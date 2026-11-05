// GitHub Pages 동작을 근사하는 로컬 정적 서버(개발용 미리보기). 사용: npm run build:pages && npm run preview:pages
// - out/ 을 BASE(/rps-lab) 아래에서만 서빙, 디렉터리 URL은 끝 슬래시로 301, 없는 경로는 404.html + 404
// - 실제 GitHub Pages와 완전히 같지는 않다(캐시·헤더 등). 최종 확인은 배포 후 quickstart 7절로 한다.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const ROOT = path.resolve(process.argv[2] ?? "out");
const BASE = process.env.PAGES_BASE_PATH ?? "/rps-lab";
const PORT = Number(process.argv[3] ?? process.env.PORT ?? 4173);
const quiet = process.env.QUIET === "1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://x");
    const p = decodeURIComponent(u.pathname);
    const log = (code) => quiet || process.stdout.write(`${code} ${req.method} ${req.url}\n`);
    const notFound = () => {
      log(404);
      const f = path.join(ROOT, "404.html");
      res.writeHead(404, { "content-type": types[".html"] });
      res.end(fs.existsSync(f) ? fs.readFileSync(f) : "404");
    };
    if (!(p === BASE || p.startsWith(BASE + "/"))) return notFound();
    let f = path.join(ROOT, p.slice(BASE.length) || "/");
    if (!f.startsWith(ROOT)) return notFound();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!p.endsWith("/")) {
        log(301);
        res.writeHead(301, { location: p + "/" + u.search });
        return res.end();
      }
      f = path.join(f, "index.html");
    }
    if (!fs.existsSync(f)) return notFound();
    log(200);
    res.writeHead(200, { "content-type": types[path.extname(f)] ?? "application/octet-stream" });
    fs.createReadStream(f).pipe(res);
  })
  .listen(PORT, () => console.log(`pages preview: http://localhost:${PORT}${BASE}/ (root ${ROOT})`));
