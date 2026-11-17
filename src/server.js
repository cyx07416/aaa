const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handleAskPost, handleHistoryGet } = require('./routes/ask');

/**解析post请求body */
async function readBody(req) {
    return new Promise(resolve => {
        let buf = [];
        req.on('data', chunk => buf.push(chunk));
        req.on('end', () => {
            try {
                resolve(JSON.parse(Buffer.concat(buf).toString('utf8')));
            } catch {
                resolve({});
            }
        });
    });
}

// 工厂函数：导出供集成测试调用，不会自动listen端口
function createServer() {
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');        
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        const pathname = urlObj.pathname;

        // 静态前端页面 public
        if (req.method === 'GET') {
            if (pathname === '/') {
                const htmlPath = path.join(__dirname, '../public/index.html');
                const html = fs.readFileSync(htmlPath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
                res.end(html);
                return;
            }
            if (pathname === '/app.js') {
                const jsPath = path.join(__dirname, '../public/app.js');
                const js = fs.readFileSync(jsPath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/javascript;charset=utf-8' });
                res.end(js);
                return;
            }
        }

        // POST /api/ask
        if (req.method === 'POST' && pathname === '/api/ask') {
            const body = await readBody(req);
            const result = await handleAskPost(body);
            res.writeHead(result.status, { 'Content-Type': 'application/json;charset=utf-8' });
            res.end(JSON.stringify(result.body));
            return;
        }

        // GET /api/history
        if (req.method === 'GET' && pathname === '/api/history') {
            const query = Object.fromEntries(urlObj.searchParams);
            const result = handleHistoryGet(query);
            res.writeHead(result.status, { 'Content-Type': 'application/json;charset=utf-8' });
            res.end(JSON.stringify(result.body));
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: "not found" }));
    });
    return server;
}

// 文件直接运行时，启动监听端口；require导入不listen（集成测试关键）
if (require.main === module) {
    const srv = createServer();
    const PORT = 3000;
    srv.listen(PORT, () => {
        console.log(`aiqa答疑助手已启动：http://localhost:${PORT}`);
    });
}

module.exports = { createServer };
