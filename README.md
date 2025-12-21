# moemailhook

一个运行在 Cloudflare Workers（Wrangler）上的轻量 webhook 中转：接收邮件服务的 JSON 请求并推送到 Bark。

## 功能
- `POST /hook`，仅接受 `application/json`
- 可选 token 校验（`WEBHOOK_TOKEN`，URL `?token=...`）
- 可选事件过滤（`X-Webhook-Event` 对比 `EXPECTED_EVENT`）
- 去重（`messageId` 或 `emailId`，`DEDUP_TTL_SECONDS`）

## 环境变量
- `BARK_ENDPOINT`（必填）：Bark 地址，如 `https://api.day.app/<device_key>`，不要以 `/` 结尾
- `BARK_GROUP`、`WEBHOOK_TOKEN`、`EXPECTED_EVENT`、`DEDUP_TTL_SECONDS`
- `TIME_ZONE`、`PREVIEW_CHARS`、`MAX_BARK_BODY_CHARS`

## 支持字段
`emailId`、`messageId`、`fromAddress`、`toAddress`、`subject`、`content`、`html`、`receivedAt`

## 请求示例
```bash
curl -X POST 'https://your-worker.example.com/hook?token=xxx' \
  -H 'Content-Type: application/json' \
  -H 'X-Webhook-Event: new_message' \
  -d '{"messageId":"123","fromAddress":"a@example.com","subject":"Hello","content":"Hi"}'
```

## 本地调试与发布
```bash
npm install -g wrangler
wrangler dev
wrangler publish
```

## 结构
- `src/index.js`：Worker 入口
- `wrangler.toml`：Wrangler 配置
