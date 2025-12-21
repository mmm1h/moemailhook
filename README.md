# moemailhook

一个运行在 Cloudflare Workers（使用 Wrangler）上的轻量服务。

它将来自邮件服务的 JSON webhook（POST /hook）解析并把简要内容推送到 Bark（iOS/Android 推送服务）。

**主要用途**：当邮件服务发来新邮件或事件（JSON）时，转发通知到 Bark 以便在手机上即时接收提醒。

**特性**
- 支持 `POST /hook` 路由，仅接受 `application/json`。
- 可选的 token 查询参数鉴权（通过 `WEBHOOK_TOKEN` 环境变量）。
- 事件过滤：可指定期望的事件类型（`EXPECTED_EVENT`）。
- 去重保护：基于邮件 `messageId` 或 `emailId` 使用 `caches.default`，可配置 TTL（`DEDUP_TTL_SECONDS`）。
- 可配置推送内容长度、时区和 Bark 分组。

**环境变量**
- `BARK_ENDPOINT`（必需）：Bark 推送地址（例如 `https://api.day.app/<device_key>`，不应以 `/` 结尾）。
- `BARK_GROUP`（可选）：Bark 消息分组名。
- `WEBHOOK_TOKEN`（可选）：启用基于查询参数 `?token=...` 的鉴权。
- `EXPECTED_EVENT`（可选，默认 `new_message`）：如果设置，只有当请求头 `X-Webhook-Event` 与之匹配时才处理。可留空以接受所有事件。
- `DEDUP_TTL_SECONDS`（可选，默认 600）：去重缓存的过期秒数。
- `TIME_ZONE`（可选，默认 `Asia/Shanghai`）：用于格式化收到时间。
- `PREVIEW_CHARS`（可选，默认 200）：正文预览截取长度（字符）。
- `MAX_BARK_BODY_CHARS`（可选，默认 1800）：发给 Bark 的 body 最大字符数，设为 0 可禁用截断。

**请求格式**
- 路径：`POST /hook`
- 必须：`Content-Type: application/json`
- 可选：请求头 `X-Webhook-Event` 用于事件类型匹配；若启用了 `WEBHOOK_TOKEN`，需在 URL 查询中提供 `token`。
- 示例 JSON 字段（支持）：`emailId`, `messageId`, `fromAddress`, `toAddress`, `subject`, `content`, `html`, `receivedAt`。

示例 curl 请求：

```bash
curl -X POST 'https://your-worker.example.com/hook?token=xxx' \
	-H 'Content-Type: application/json' \
	-H 'X-Webhook-Event: new_message' \
	-d '{"messageId":"123","fromAddress":"a@example.com","subject":"Hello","content":"Hi"}'
```

**部署（使用 Wrangler）**
1. 在 `wrangler.toml` 中配置你的 Cloudflare Worker（账户、环境等）。
2. 在 Cloudflare Worker 的环境变量中配置上文所述的 `BARK_ENDPOINT` 等变量。
3. 本地调试：

```bash
npm install -g wrangler
wrangler dev
```

4. 发布：

```bash
wrangler publish
```

**代码结构**
- `src/index.js`：Worker 入口，处理鉴权、去重、文本抽取与推送到 Bark。
- `wrangler.toml`：Wrangler 配置。

**常见注意事项**
- 确保 `BARK_ENDPOINT` 配置正确且可从 Cloudflare Worker 访问。
- 若启用鉴权，请在请求 URL 中带上 `?token=...`。
- 如果你的邮件 webhook 会发送大量重复通知，请适当调大 `DEDUP_TTL_SECONDS`。

**贡献与许可**
欢迎提交 issue 或 PR。该仓库默认未指定许可，请按协作需要补充 LICENSE。

---
如需我帮你补充 `wrangler.toml` 的示例配置或添加部署脚本，告诉我即可。
