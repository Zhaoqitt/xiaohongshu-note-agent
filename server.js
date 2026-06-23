import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const systemPrompt = `你是资深小红书内容策划智能体，擅长把普通主题包装成真实、口语化、有收藏欲的爆款笔记。
要求：
1. 标题给 3-5 个备选，每个标题不超过 28 个中文字符，带钩子但不夸大事实。
2. 正文 200-400 个中文字符，第一人称口语化，包含自然 emoji，信息密度高，有真实体验感。
3. 话题标签 8-12 个，适合小红书搜索。
4. 不编造具体品牌、价格、地址、疗效或无法验证的事实；需要细节时用可替换表达。
5. 只返回严格 JSON，不要 Markdown。`;

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1024 * 1024) {
      throw new Error("请求体过大");
    }
  }
  return JSON.parse(body || "{}");
}

function cleanTopic(topic) {
  return String(topic || "").trim().replace(/\s+/g, " ").slice(0, 60);
}

function pickTone(topic) {
  if (/咖啡|探店|餐|甜品|火锅|面包|brunch/i.test(topic)) {
    return {
      scene: "周末约会、下班放松、朋友小聚",
      details: ["氛围感", "拍照角度", "点单思路", "避开踩雷"],
      tags: ["探店", "咖啡探店", "周末去哪儿", "城市漫游", "拍照打卡"]
    };
  }
  if (/护肤|穿搭|美妆|口红|发型|香水/i.test(topic)) {
    return {
      scene: "日常通勤、约会出门、精简变美",
      details: ["适合人群", "使用顺序", "搭配公式", "真实感受"],
      tags: ["变美思路", "日常分享", "精致生活", "自用好物", "新手友好"]
    };
  }
  if (/旅行|露营|酒店|城市|攻略|拍照/i.test(topic)) {
    return {
      scene: "短途出逃、周末散心、轻攻略",
      details: ["路线节奏", "拍照机位", "时间安排", "小众体验"],
      tags: ["旅行攻略", "周末旅行", "城市探索", "拍照姿势", "出行灵感"]
    };
  }
  if (/学习|考研|读书|效率|英语|论文|工作/i.test(topic)) {
    return {
      scene: "自我提升、效率复盘、普通人可复制",
      details: ["执行步骤", "避坑提醒", "工具清单", "复盘方法"],
      tags: ["学习方法", "效率提升", "普通人逆袭", "自律日常", "经验分享"]
    };
  }
  return {
    scene: "日常分享、真实体验、可复制清单",
    details: ["适用场景", "准备清单", "行动步骤", "避坑提醒"],
    tags: ["生活灵感", "经验分享", "普通人日常", "干货分享", "收藏备用"]
  };
}

function fallbackGenerate(topic, audience = "小红书用户") {
  const tone = pickTone(topic);
  const titleSeeds = [
    `关于${topic}，这篇真的想劝你先收藏`,
    `${topic}新手别急着冲，先看这份清单`,
    `我把${topic}踩过的坑整理好了`,
    `${topic}这样做，普通人也能有氛围感`,
    `被问爆的${topic}思路，一次说清`
  ];
  const detailText = tone.details.join("、");
  const body = `最近认真整理了一套「${topic}」小攻略，真的很适合${audience || "想少走弯路的人"}收藏备用✨ 我的思路不是硬凹精致，而是先想清楚场景：${tone.scene}。然后把重点放在${detailText}这几件事上，会比盲目跟风稳很多。实际操作时建议先列一个小清单：你最在意什么、预算或时间边界在哪里、有没有必须避开的雷点。这样做下来，体验会更轻松，也更容易拍出/写出自然的分享感📌 如果你也想尝试${topic}，别一上来追求满分，先做一个 60 分版本，再根据反馈慢慢优化，反而更容易坚持～`;
  const hashtags = [...new Set([
    topic,
    ...tone.tags,
    `${topic}攻略`,
    `${topic}灵感`,
    "小红书爆款笔记",
    "我的日常"
  ].map((tag) => tag.replace(/^#/, "")))].slice(0, 12);

  return {
    titles: titleSeeds.slice(0, 5),
    body: fitBodyLength(body),
    hashtags,
    source: "local-template"
  };
}

function fitBodyLength(text) {
  if (text.length <= 400) return text;
  return `${text.slice(0, 385)}……先收藏，之后照着慢慢补就好～`;
}

function extractJson(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型未返回 JSON");
    return JSON.parse(match[0]);
  }
}

function normalizeGenerated(data, topic) {
  const titles = Array.isArray(data.titles) ? data.titles : [];
  const hashtags = Array.isArray(data.hashtags) ? data.hashtags : [];
  return {
    titles: titles.map((item) => String(item).trim()).filter(Boolean).slice(0, 5),
    body: fitBodyLength(String(data.body || "").trim()),
    hashtags: hashtags.map((tag) => String(tag).replace(/^#/, "").trim()).filter(Boolean).slice(0, 12),
    source: data.source || "llm-api",
    topic
  };
}

async function generateWithApi(topic, audience, sellingPoint) {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.LLM_MODEL || "gpt-4.1-mini";
  const prompt = `主题：${topic}
目标用户：${audience || "小红书用户"}
想突出：${sellingPoint || "真实体验、可收藏、容易照做"}

请输出 JSON，字段为：
{
  "titles": ["标题1", "标题2", "标题3"],
  "body": "200-400字正文",
  "hashtags": ["标签1", "标签2"]
}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.86,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API ${response.status}: ${text.slice(0, 300)}`);
  }
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  return normalizeGenerated(extractJson(content), topic);
}

function wrapText(text, maxChars) {
  const normalized = String(text || "").replace(/\r/g, "").split("\n");
  const lines = [];
  for (const paragraph of normalized) {
    let current = "";
    for (const char of paragraph) {
      const wide = /[\u4e00-\u9fff\uff00-\uffef]/.test(char) ? 1 : 0.55;
      const currentWidth = [...current].reduce((sum, c) => sum + (/[\u4e00-\u9fff\uff00-\uffef]/.test(c) ? 1 : 0.55), 0);
      if (currentWidth + wide > maxChars && current) {
        lines.push(current);
        current = char;
      } else {
        current += char;
      }
    }
    if (current) lines.push(current);
    lines.push("");
  }
  return lines.slice(0, -1);
}

function utf16Hex(text) {
  return Buffer.from(String(text), "utf16le")
    .swap16()
    .toString("hex")
    .toUpperCase();
}

function pdfEscapeName(name) {
  return String(name).replace(/[^\w.-]+/g, "_");
}

function buildPdf({ topic, titles, body, hashtags }) {
  const objects = [];
  const add = (content) => {
    objects.push(content);
    return objects.length;
  };

  const descriptorObj = add("<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [ -25 -254 1000 880 ] /ItalicAngle 0 /Ascent 880 /Descent -254 /CapHeight 880 /StemV 80 >>");
  const descendantObj = add(`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /FontDescriptor ${descriptorObj} 0 R /DW 1000 >>`);
  const fontObj = add(`<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [ ${descendantObj} 0 R ] >>`);

  const titleLines = [
    "小红书爆款笔记生成器",
    `主题：${topic}`,
    "",
    "爆款标题备选",
    ...titles.map((title, index) => `${index + 1}. ${title}`),
    "",
    "正文",
    ...wrapText(body, 30),
    "",
    "话题标签",
    ...wrapText(hashtags.map((tag) => `#${tag}`).join("  "), 30)
  ];

  const content = ["BT", "/F1 20 Tf", "50 790 Td", "24 TL"];
  titleLines.forEach((line, index) => {
    if (index === 1) content.push("/F1 12 Tf", "18 TL");
    if (line === "爆款标题备选" || line === "正文" || line === "话题标签") {
      content.push("/F1 15 Tf", "22 TL");
    }
    if (line === "") {
      content.push("T*");
      return;
    }
    content.push(`<${utf16Hex(line)}> Tj`, "T*");
    if (line === "爆款标题备选" || line === "正文" || line === "话题标签") {
      content.push("/F1 12 Tf", "18 TL");
    }
  });
  content.push("ET");

  const stream = content.join("\n");
  const contentObj = add(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  const pageObj = objects.length + 1;
  const pagesObj = pageObj + 1;
  add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`);
  add(`<< /Type /Pages /Kids [${pageObj} 0 R] /Count 1 >>`);
  const catalogObj = add(`<< /Type /Catalog /Pages ${pagesObj} 0 R >>`);

  const ordered = objects;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  ordered.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${ordered.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= ordered.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${ordered.length + 1} /Root ${catalogObj} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "binary");
}

async function handleGenerate(req, res) {
  try {
    const { topic: rawTopic, audience, sellingPoint } = await readJson(req);
    const topic = cleanTopic(rawTopic);
    if (!topic) {
      return jsonResponse(res, 400, { error: "请输入主题" });
    }

    try {
      const apiResult = await generateWithApi(topic, audience, sellingPoint);
      if (apiResult) return jsonResponse(res, 200, apiResult);
    } catch (error) {
      console.warn(error.message);
    }

    return jsonResponse(res, 200, { ...fallbackGenerate(topic, audience), topic });
  } catch (error) {
    return jsonResponse(res, 500, { error: error.message || "生成失败" });
  }
}

async function handlePdf(req, res) {
  try {
    const data = await readJson(req);
    const topic = cleanTopic(data.topic || "小红书笔记");
    const payload = normalizeGenerated(data, topic);
    const pdf = buildPdf(payload);
    const filename = `${pdfEscapeName(topic)}-xiaohongshu-note.pdf`;
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${filename}"`,
      "content-length": pdf.length
    });
    res.end(pdf);
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || "PDF 导出失败" });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const type = mimeTypes[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/generate") {
    await handleGenerate(req, res);
    return;
  }
  if (req.method === "POST" && req.url === "/api/export-pdf") {
    await handlePdf(req, res);
    return;
  }
  if (req.method === "GET") {
    await serveStatic(req, res);
    return;
  }
  res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
  res.end("Method not allowed");
});

server.listen(port, host, () => {
  console.log(`Xiaohongshu note agent is running at http://${host}:${port}`);
});
