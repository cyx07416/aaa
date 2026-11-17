const { add, list } = require('../record/qaRecord');
const crypto = require('node:crypto');
const https = require('node:https');

// ===================== DeepSeek 配置区 =====================
// 密钥从环境变量读取，本地运行前需设置 DEEPSEEK_API_KEY，CI 中使用仓库 Secrets 注入
const API_KEY = process.env.DEEPSEEK_API_KEY || "";
const MODEL_NAME = "deepseek-flash";
const HOST = "api.deepseek.com";
const PATH = "/v1/chat/completions";
// ==========================================================

async function getAiAnswer(userQuestion) {
  const postBody = JSON.stringify({
    model: MODEL_NAME,
    messages: [
      { role: "user", content: userQuestion }
    ]
  });
  const opt = {
    hostname: HOST,
    port: 443,
    path: PATH,
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(postBody)
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(opt, (res) => {
      let chunk = "";
      res.on("data", (d) => { chunk += d; });
      res.on("end", () => {
        try {
          const json = JSON.parse(chunk);
          const ans = json.choices?.[0]?.message?.content;
          if (ans) {
            resolve(ans);
          } else {
            reject("接口返回异常:" + chunk);
          }
        } catch (e) {
          reject("解析失败:" + chunk);
        }
      });
    });
    req.on("error", (err) => reject(err));
    req.write(postBody);
    req.end();
  });
}

async function handleAskPost(reqBody) {
  const { question } = reqBody;
  const qStr = String(question ?? '');
  const qText = qStr.trim();

  if (!qText) {
    return {
      status: 400,
      body: { ok: false, error: "问题内容不能为空" }
    };
  }

  try {
    const aiAnswer = await getAiAnswer(qText);
    const entry = {
      id: crypto.randomUUID(),
      question: qText,
      answer: aiAnswer,
      sources: ["DeepSeek大模型"],
      mode: "llm",
      createdAt: new Date().toISOString()
    };
    add(entry);
    return {
      status: 200,
      body: { ok: true, data: entry }
    };
  } catch (err) {
    return {
      status: 502,
      body: { ok: false, error: "AI请求失败：" + String(err) }
    };
  }
}

function handleHistoryGet(query) {
  const limit = Number(query.limit) || 20;
  const data = list(limit);
  return {
    status: 200,
    body: { ok: true, data: data }
  };
}

// ✅ 重点：两个函数全部导出，不要漏！
module.exports = {
  handleAskPost,
  handleHistoryGet
};
