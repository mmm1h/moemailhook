# moemailhook

将邮件的 JSON webhook 转发到 Bark

## Webhook 输入（示例）
请求头：
- Content-Type: application/json
- X-Webhook-Event: new_message

请求体：
```json
{
  "emailId": "email-uuid",
  "messageId": "message-uuid",
  "fromAddress": "sender@example.com",
  "subject": "邮件主题",
  "content": "邮件文本内容",
  "html": "邮件HTML内容",
  "receivedAt": "2024-01-01T12:00:00.000Z",
  "toAddress": "your-email@mail.hmhi.ac.cn"
}
