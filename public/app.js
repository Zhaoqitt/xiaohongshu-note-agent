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

pdfBtn.addEventListener("click", async () => {
  if (!currentResult) return;
  pdfBtn.disabled = true;
  pdfBtn.textContent = "正在导出";
  try {
    const response = await postJson("/api/export-pdf", currentResult);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentResult.topic || "xiaohongshu-note"}.pdf`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } finally {
    pdfBtn.disabled = false;
    pdfBtn.textContent = "导出 PDF";
  }
});
