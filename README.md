# 小红书爆款笔记生成器智能体

这是一个轻量网页智能体：用户输入主题后，自动生成小红书爆款标题备选、200-400 字口语化正文、话题标签，并支持导出结构化 PDF 文档。

## 在线访问

当前 Render 公网访问地址：

```text
https://xiaohongshu-note-agent.onrender.com
```

Render 免费实例长时间无人访问后会自动休眠，首次打开可能需要等待 30-60 秒唤醒。

## 运行

```bash
npm start
```

默认访问：

```text
http://localhost:8787
```

## 接入公开大模型 API

服务端支持 OpenAI 兼容的 Chat Completions API。启动前设置环境变量即可：

```bash
export LLM_API_KEY="你的 API Key"
export LLM_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export LLM_MODEL="qwen-plus"
npm start
```

当前推荐使用阿里云百炼 OpenAI 兼容接口：

```text
LLM_API_KEY=在 Render 环境变量中填写你的百炼 API Key
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_MODEL=qwen-plus
```

也可以将 `LLM_MODEL` 替换为百炼控制台中已开通的具体模型，例如：

```text
qwen-plus-2025-07-28
```

也可以替换为其他公开可访问、兼容 `/chat/completions` 的大模型 API 网关。没有配置 Key 时，系统会自动使用本地提示词模板兜底，方便演示完整流程。

## 公开访问链接

本项目已部署到 Render：

```text
https://xiaohongshu-note-agent.onrender.com
```

也可以部署到 Railway、Fly.io、Vercel Serverless/Node Runtime 或任意支持 Node 20+ 的云服务器。部署后把平台分配的 URL 发给用户即可公开访问。

本地临时公开演示也可以使用反向代理/隧道工具，例如：

```bash
npx localtunnel --port 8787
```

或：

```bash
ngrok http 8787
```

注意：API Key 只应配置在服务端环境变量中，不要写入前端代码或公开仓库。
