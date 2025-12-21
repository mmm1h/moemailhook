export default {
  async fetch(request, env) {
    try {
      // 允许 GET 做健康检查
      if (request.method === "GET") {
        return json({ ok: true, service: "moemailhook", ts: new Date().toISOString() }, 200);
      }

      if (request.method !== "POST") {
        return json({ ok: false, error: "Method Not Allowed" }, 405);
      }

      // 1) 鉴权（推荐开启）
      if (env.WEBHOOK_TOKEN) {
        const headerToken = request.headers.get("X-Webhook-Token");
        const url = new URL(request.url);
        const queryToken = url.searchParams.get("token");
        const token = headerToken || queryToken;

        if (!token || token !== env.WEBHOOK_TOKEN) {
          return json({ ok: false, error: "Unauthorized" }, 401);
        }
      }

      // 2) 校验事件
      const expectedEvent = env.EXPECTED_EVENT || "new_message";
      const event = request.headers.get("X-Webhook-Event");
      if (event && event !== expectedEvent) {
        return json(
          { ok: true, ignored: true, reason: `Unexpected event: ${event}`, expectedEvent },
          200
        );
      }

      // 3) Content-Type 检查（你给的 webhook 是 application/json）
      const contentType = request.headers.get("Content-Type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return json({ ok: false, error: "Content-Type must be application/json" }, 415);
      }

      // 4) 解析 JSON body
      let data;
      try {
        data = await request.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON body" }, 400);
      }

      // 5) 获取全部字段（你给的 schema）
      const payload = {
        emailId: safeStr(data?.emailId),
        messageId: safeStr(data?.messageId),
        fromAddress: safeStr(data?.fromAddress),
        subject: safeStr(data?.subject),
        content: safeStr(data?.content),
        html: safeStr(data?.html),
        receivedAt: safeStr(data?.receivedAt),
        toAddress: safeStr(data?.toAddress),
      };

      // 6) 组装 Bark 标题/正文
      const title = payload.subject || "(No Subject)";

      const tz = env.TIME_ZONE || "Asia/Shanghai";
      const atText = formatTime(payload.receivedAt, tz);

      const includeChars = toInt(env.INCLUDE_CONTENT_CHARS, 200);
      const textFromHtml = stripHtml(payload.html);
      const mainText = normalizeText(payload.content || textFromHtml);
      const preview = truncate(mainText, includeChars);

      // body：关键信息 + 摘要（可自行删减字段）
      const lines = [
        payload.fromAddress ? `From: ${payload.fromAddress}` : null,
        payload.toAddress ? `To: ${payload.toAddress}` : null,
        atText ? `At: ${atText}` : null,
        payload.messageId ? `MessageId: ${payload.messageId}` : null,
        payload.emailId ? `EmailId: ${payload.emailId}` : null,
        preview ? "" : null,
        preview ? preview : null,
      ].filter(Boolean);

      // Bark 内容整体上限保护
      const body = truncate(lines.join("\n"), 1800);

      // 7) Bark endpoint
      const endpoint = normalizeEndpoint(env.BARK_ENDPOINT);
      if (!endpoint) {
        return json({ ok: false, error: "Missing env.BARK_ENDPOINT" }, 500);
      }

      // 8) Bark query params
      const qs = new URLSearchParams();
      if (env.BARK_GROUP) qs.set("group", env.BARK_GROUP);

      const barkUrl =
        `${endpoint}/${encodeURIComponent(title)}/${encodeURIComponent(body)}` +
        (qs.toString() ? `?${qs.toString()}` : "");

      // 9) 调用 Bark
      const resp = await fetch(barkUrl, { method: "GET" });
      if (!resp.ok) {
        const t = truncate(await resp.text().catch(() => ""), 300);
        return json(
          {
            ok: false,
            error: "Bark request failed",
            status: resp.status,
            response: t,
          },
          502
        );
      }

      return json(
        {
          ok: true,
          pushed: true,
          used: {
            title,
            bodyPreview: truncate(body, 240),
            group: env.BARK_GROUP || "",
            event: event || "",
          },
          received: {
            // 用于排查：返回你发来的字段（可按需删除，避免暴露内容）
            emailId: payload.emailId,
            messageId: payload.messageId,
            fromAddress: payload.fromAddress,
            subject: payload.subject,
            receivedAt: payload.receivedAt,
            toAddress: payload.toAddress,
          },
        },
        200
      );
    } catch (e) {
      return json({ ok: false, error: "Unhandled error", detail: String(e?.message || e) }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function safeStr(v) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function toInt(v, fallback) {
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeEndpoint(url) {
  const s = safeStr(url).trim();
  if (!s) return "";
  return s.replace(/\/+$/, "");
}

function normalizeText(s) {
  return safeStr(s)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(s, max) {
  const str = safeStr(s);
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}

function stripHtml(html) {
  const s = safeStr(html);
  if (!s) return "";
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim();
}

function formatTime(iso, timeZone) {
  const s = safeStr(iso).trim();
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  try {
    const fmt = new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    return fmt.format(d);
  } catch {
    return d.toISOString();
  }
}
