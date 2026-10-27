import { join, dirname } from "node:path";
import { hostname } from "node:os";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import wisp from "wisp-server-node";

import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

// 取得當前檔案的絕對目錄
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// 加入安全標頭（適用於 Vercel 與本地）
app.use((req, res, next) => {
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	next();
});

// Load our publicPath first and prioritize it over UV.
app.use(express.static(join(__dirname, "../public")));
// Load vendor files last.
app.use("/uv/", express.static(uvPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

// Error for everything else (使用絕對路徑)
app.use((req, res) => {
	res.status(404);
	res.sendFile(join(__dirname, "../public/404.html"));
});

// 💡 關鍵：只有在「非 Vercel 環境」下（例如你本地端用 node 執行），才啟動完整的 HTTP 與 WebSocket 伺服器
if (!process.env.VERCEL) {
	const server = createServer();

	server.on("request", (req, res) => {
		app(req, res);
	});

	server.on("upgrade", (req, socket, head) => {
		if (req.url.endsWith("/wisp/")) {
			wisp.routeRequest(req, socket, head);
			return;
		} 
		socket.end();
	});

	let port = parseInt(process.env.PORT || "", 10);
	if (isNaN(port)) port = 8080;

	server.listen(port, () => {
		const address = server.address();
		console.log("Listening on:");
		console.log(`\thttp://localhost:${address.port}`);
		console.log(`\thttp://${hostname()}:${address.port}`);
		console.log(
			`\thttp://${
				address.family === "IPv6" ? `[${address.address}]` : address.address
			}:${address.port}`
		);
	});

	// https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html
	const shutdown = () => {
		console.log("SIGTERM signal received: closing HTTP server");
		server.close();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

// 關鍵：將 Express 實例匯出給 Vercel Serverless 使用
export default app;
