
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname !== "/hook") {
      return new Response("Not Found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // token 鉴权（query）
    if (env.WEBHOOK_TOKEN) {
      const token = url.searchParams.get("token");
      if (!token || token !== env.WEBHOOK_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const expectedEvent = (env.EXPECTED_EVENT || "new_message").trim();
    const event = request.headers.get("X-Webhook-Event");
    if (event && event !== expectedEvent) {
      return json({ ok: true, ignored: true, reason: `Unexpected event: ${event}` }, 200);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ ok: false, error: "Content-Type must be application/json" }, 415);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON body" }, 400);
    }

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

    const dedupId = payload.messageId || payload.emailId;
    if (dedupId) {
      const ttl = toInt(env.DEDUP_TTL_SECONDS, 600);
      const dedupKey = new Request(`https://dedup.local/${encodeURIComponent(dedupId)}`);

      const hit = await caches.default.match(dedupKey);
      if (hit) {
        return json({ ok: true, dedup: true, id: dedupId }, 200);
      }

      await caches.default.put(
        dedupKey,
        new Response("1", { headers: { "Cache-Control": `max-age=${ttl}` } })
      );
    }

    const bark = resolveBarkEndpoint(env.BARK_ENDPOINT);
    if (!bark.ok) {
      return json({ ok: false, error: bark.error }, 500);
    }
    if (!bark.deviceKey) {
      return json(
        { ok: false, error: "Missing device key in env.BARK_ENDPOINT" },
        500
      );
    }

    const title = payload.subject || "(No Subject)";

    const tz = env.TIME_ZONE || "Asia/Shanghai";
    const atText = formatTime(payload.receivedAt, tz);

    const previewChars = toInt(env.PREVIEW_CHARS, 200);
    const textFromHtml = stripHtml(payload.html);
    const mainText = normalizeText(payload.content || textFromHtml);
    const preview = truncate(mainText, previewChars);

    const lines = [
      // payload.messageId ? `MessageId: ${payload.messageId}` : null,
      // payload.emailId ? `EmailId: ${payload.emailId}` : null,
      preview ? "" : null,
      preview ? preview : null,
      payload.fromAddress ? `From: ${payload.fromAddress}` : null,
      payload.toAddress ? `To: ${payload.toAddress}` : null,
      atText ? `At: ${atText}` : null,
    ].filter(Boolean);

    const maxBody = toInt(env.MAX_BARK_BODY_CHARS, 1800);
    const body = maxBody > 0 ? truncate(lines.join("\n"), maxBody) : lines.join("\n");

    const barkPayload = {
      title,
      body,
      device_key: bark.deviceKey,
    };
    if (env.BARK_GROUP) barkPayload.group = env.BARK_GROUP;

    ctx.waitUntil(pushToBark(bark.pushUrl, barkPayload));

    return json(
      {
        ok: true,
        accepted: true,
        dedupId: dedupId || "",
        used: {
          title,
          bodyPreview: truncate(body, 240),
          group: env.BARK_GROUP || "",
          event: event || "",
        },
      },
      200
    );
  },
};

async function pushToBark(url, payload) {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const detail = await readResponseSnippet(resp);
      if (detail) {
        console.log("Bark push failed:", resp.status, detail);
      } else {
        console.log("Bark push failed:", resp.status);
      }
    }
  } catch (e) {
    console.log("Bark push exception:", String(e?.message || e));
  }
}

/* ---------------- helpers ---------------- */

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


async function readResponseSnippet(resp) {
  try {
    const text = await resp.text();
    return truncate(text, 800);
  } catch {
    return "";
  }
}

function resolveBarkEndpoint(url) {
  const raw = normalizeEndpoint(url);
  if (!raw) return { ok: false, error: "Missing env.BARK_ENDPOINT" };

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Invalid env.BARK_ENDPOINT" };
  }

  const path = parsed.pathname.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";

  if (last.toLowerCase() === "push") {
    return {
      ok: true,
      pushUrl: `${parsed.origin}${path}`,
      deviceKey: "",
    };
  }

  const deviceKey = last;
  const basePath = segments.length > 1 ? `/${segments.slice(0, -1).join("/")}` : "";

  return {
    ok: true,
    pushUrl: `${parsed.origin}${basePath}/push`,
    deviceKey,
  };
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
