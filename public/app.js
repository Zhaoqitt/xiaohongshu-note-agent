const form = document.querySelector("#generatorForm");
const topicInput = document.querySelector("#topic");
const audienceInput = document.querySelector("#audience");
const sellingPointInput = document.querySelector("#sellingPoint");
const emptyState = document.querySelector("#emptyState");
const resultCard = document.querySelector("#resultCard");
const statusPill = document.querySelector("#statusPill");
const resultTitle = document.querySelector("#resultTitle");
const titleList = document.querySelector("#titleList");
const bodyText = document.querySelector("#bodyText");
const hashtagList = document.querySelector("#hashtagList");
const copyBtn = document.querySelector("#copyBtn");
const pdfBtn = document.querySelector("#pdfBtn");

let currentResult = null;

function setBusy(isBusy) {
  form.querySelector("button[type='submit']").disabled = isBusy;
  pdfBtn.disabled = isBusy;
  copyBtn.disabled = isBusy;
  statusPill.textContent = isBusy ? "正在生成" : "已生成";
}

function renderResult(data) {
  currentResult = data;
  emptyState.classList.add("hidden");
  resultCard.classList.remove("hidden");
  resultTitle.textContent = data.titles?.[0] || `${data.topic}笔记`;
  statusPill.textContent = data.source === "local-template" ? "本地兜底生成" : "API 智能生成";

  titleList.replaceChildren();
  for (const title of data.titles || []) {
    const li = document.createElement("li");
    li.textContent = title;
    titleList.append(li);
  }

  bodyText.textContent = data.body || "";
  hashtagList.replaceChildren();
  for (const tag of data.hashtags || []) {
    const chip = document.createElement("span");
    chip.textContent = `#${tag}`;
    hashtagList.append(chip);
  }
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "请求失败");
  }
  return response;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    topic: topicInput.value.trim(),
    audience: audienceInput.value.trim(),
    sellingPoint: sellingPointInput.value.trim()
  };
  if (!payload.topic) return;

  setBusy(true);
  resultTitle.textContent = "正在拆解主题、组织标题和正文";
  try {
    const response = await postJson("/api/generate", payload);
    const data = await response.json();
    renderResult(data);
  } catch (error) {
    statusPill.textContent = "生成失败";
    resultTitle.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

document.querySelectorAll("[data-topic]").forEach((button) => {
  button.addEventListener("click", () => {
    topicInput.value = button.dataset.topic;
    topicInput.focus();
  });
});

copyBtn.addEventListener("click", async () => {
  if (!currentResult) return;
  const text = [
    "爆款标题备选",
    ...currentResult.titles.map((title, index) => `${index + 1}. ${title}`),
    "",
    "正文",
    currentResult.body,
    "",
    "话题标签",
    currentResult.hashtags.map((tag) => `#${tag}`).join(" ")
  ].join("\n");

  await navigator.clipboard.writeText(text);
  copyBtn.textContent = "已复制";
  setTimeout(() => {
    copyBtn.textContent = "复制内容";
  }, 1200);
});

function wrapCanvasText(ctx, text, maxWidth) {
  const lines = [];
  let current = "";
  for (const char of String(text || "")) {
    if (char === "\n") {
      lines.push(current);
      current = "";
      continue;
    }
    const test = current + char;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = char;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bytesFromAscii(text) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    bytes[index] = text.charCodeAt(index) & 0xff;
  }
  return bytes;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function jpegDataUrlToBytes(dataUrl) {
  const binary = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function buildImagePdf(jpegBytes, imageWidth, imageHeight) {
  const pageWidth = 595;
  const pageHeight = 842;
  const chunks = [];
  const offsets = [0];
  let length = 0;

  const push = (chunk) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const pushAscii = (text) => push(bytesFromAscii(text));

  const addObject = (id, parts) => {
    offsets[id] = length;
    pushAscii(`${id} 0 obj\n`);
    for (const part of parts) {
      if (typeof part === "string") {
        pushAscii(part);
      } else {
        push(part);
      }
    }
    pushAscii("\nendobj\n");
  };

  pushAscii("%PDF-1.4\n");
  addObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  addObject(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  addObject(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  addObject(4, [
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    jpegBytes,
    "\nendstream"
  ]);
  const stream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`;
  addObject(5, [`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`]);

  const xrefOffset = length;
  pushAscii("xref\n0 6\n0000000000 65535 f \n");
  for (let id = 1; id <= 5; id += 1) {
    pushAscii(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  }
  pushAscii(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
}

function renderResultToCanvas(data) {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  const margin = 92;
  const maxWidth = canvas.width - margin * 2;
  let y = 92;

  ctx.fillStyle = "#fffaf4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, 54, 54, canvas.width - 108, canvas.height - 108, 18);
  ctx.fill();
  ctx.strokeStyle = "#ded8d2";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#e6324b";
  drawRoundedRect(ctx, margin, y, 52, 52, 10);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 28px PingFang SC, Microsoft YaHei, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("书", margin + 26, y + 28);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#23201f";
  ctx.font = "800 42px PingFang SC, Microsoft YaHei, Arial, sans-serif";
  ctx.fillText("小红书爆款笔记生成器", margin + 72, y + 39);
  y += 88;

  ctx.fillStyle = "#6d6661";
  ctx.font = "24px PingFang SC, Microsoft YaHei, Apple Color Emoji, Segoe UI Emoji, sans-serif";
  ctx.fillText(`主题：${data.topic || "小红书笔记"}`, margin, y);
  y += 54;

  const drawSectionTitle = (title) => {
    y += 18;
    ctx.fillStyle = "#e6324b";
    ctx.font = "800 28px PingFang SC, Microsoft YaHei, Arial, sans-serif";
    ctx.fillText(title, margin, y);
    y += 28;
    ctx.strokeStyle = "#ded8d2";
    ctx.beginPath();
    ctx.moveTo(margin, y);
    ctx.lineTo(canvas.width - margin, y);
    ctx.stroke();
    y += 42;
  };

  drawSectionTitle("爆款标题备选");
  ctx.fillStyle = "#23201f";
  ctx.font = "800 30px PingFang SC, Microsoft YaHei, Apple Color Emoji, Segoe UI Emoji, sans-serif";
  for (const [index, title] of (data.titles || []).entries()) {
    const lines = wrapCanvasText(ctx, `${index + 1}. ${title}`, maxWidth);
    for (const line of lines) {
      ctx.fillText(line, margin, y);
      y += 44;
    }
    y += 8;
  }

  drawSectionTitle("正文");
  ctx.fillStyle = "#35302e";
  ctx.font = "28px PingFang SC, Microsoft YaHei, Apple Color Emoji, Segoe UI Emoji, sans-serif";
  for (const line of wrapCanvasText(ctx, data.body || "", maxWidth)) {
    ctx.fillText(line, margin, y);
    y += 44;
  }

  drawSectionTitle("话题标签");
  ctx.font = "700 25px PingFang SC, Microsoft YaHei, Apple Color Emoji, Segoe UI Emoji, sans-serif";
  let x = margin;
  const chipHeight = 46;
  for (const tag of data.hashtags || []) {
    const text = `#${tag}`;
    const chipWidth = ctx.measureText(text).width + 34;
    if (x + chipWidth > canvas.width - margin) {
      x = margin;
      y += chipHeight + 14;
    }
    ctx.fillStyle = "rgba(63, 159, 135, 0.14)";
    drawRoundedRect(ctx, x, y - 31, chipWidth, chipHeight, 23);
    ctx.fill();
    ctx.fillStyle = "#255f51";
    ctx.fillText(text, x + 17, y);
    x += chipWidth + 14;
  }

  ctx.fillStyle = "#9a918a";
  ctx.font = "20px PingFang SC, Microsoft YaHei, Arial, sans-serif";
  ctx.fillText("Generated by Xiaohongshu Note Agent", margin, canvas.height - 88);
  return canvas;
}

function exportCurrentResultAsPdf(data) {
  const canvas = renderResultToCanvas(data);
  const jpegBytes = jpegDataUrlToBytes(canvas.toDataURL("image/jpeg", 0.96));
  const pdf = buildImagePdf(jpegBytes, canvas.width, canvas.height);
  downloadBlob(pdf, `${data.topic || "xiaohongshu-note"}.pdf`);
}

pdfBtn.addEventListener("click", async () => {
  if (!currentResult) return;
  pdfBtn.disabled = true;
  pdfBtn.textContent = "正在导出";
  try {
    exportCurrentResultAsPdf(currentResult);
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.textContent = "导出 PDF";
  }
});
