# moemailhook 📬➡️🔔

为 **moemail** 而生的轻量中转：把 moemail 的 webhook JSON 转成 **Bark** 支持的推送格式，让邮件提醒直达手机。

## ✨ 我能做什么
- `POST /hook`，仅接受 `application/json`
- 可选 token 校验（`WEBHOOK_TOKEN`，URL `?token=...`）
- 可选事件过滤（`X-Webhook-Event` 对比 `EXPECTED_EVENT`）
- 去重（`messageId` 或 `emailId`，`DEDUP_TTL_SECONDS`）

## 🧭 工作流
moemail webhook → Cloudflare Workers → Bark 推送

## ⚙️ 环境变量
### ✅ 必填
- `BARK_ENDPOINT`：Bark 地址，如 `https://api.day.app/<device_key>`，不要以 `/` 结尾

### 🧩 选填
- `WEBHOOK_TOKEN`：设置后需在请求中带 `?token=...`，用于简单鉴权
- `EXPECTED_EVENT`：事件名过滤，默认 `new_message`（对比请求头 `X-Webhook-Event`）
- `DEDUP_TTL_SECONDS`：去重窗口（秒），默认 `600`
- `BARK_GROUP`：Bark 分组名（同一分组便于归档）
- `TIME_ZONE`：时间格式化时区，默认 `Asia/Shanghai`
- `PREVIEW_CHARS`：正文预览字符数，默认 `200`
- `MAX_BARK_BODY_CHARS`：Bark body 最大长度，默认 `1800`

## 📨 支持字段
`emailId`、`messageId`、`fromAddress`、`toAddress`、`subject`、`content`、`html`、`receivedAt`

## 🧪 请求示例
```bash
curl -X POST 'https://your-worker.example.com/hook?token=xxx' \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Event: new_message' \
  -d '{"messageId":"123","fromAddress":"a@example.com","subject":"Hello","content":"Hi"}'
```

## 🚀 本地调试与发布
```bash
npm install -g wrangler
wrangler dev
wrangler publish
```

## 📁 结构
- `src/index.js`：Worker 入口
- `wrangler.toml`：Wrangler 配置
