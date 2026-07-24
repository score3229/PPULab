// public api guard: cors, body-size cap, in-memory per-ip rate limit

import { NextRequest, NextResponse } from "next/server";

const num = (v: string | undefined, d: number) => {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : d;
};

// tunable without a code change via env
const WINDOW_MS = num(process.env.PPULAB_RATE_WINDOW_MS, 60_000); // 1 minute
const MAX_PER_WINDOW = num(process.env.PPULAB_RATE_MAX, 100); // requests / window / ip
const MAX_BODY_BYTES = num(process.env.PPULAB_MAX_BODY, 256 * 1024); // 256 KB

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
};

// json response with the cors headers attached, plus any extras
export function json(
  payload: unknown,
  status = 200,
  extra?: Record<string, string>
): NextResponse {
  return NextResponse.json(payload, { status, headers: { ...CORS, ...extra } });
}

// preflight: no body, just the cors headers
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// fixed-window counter per ip. burst at a window edge can reach up to 2x the
// cap, which is fine for abuse protection.
type Bucket = { count: number; start: number };
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function clientIp(req: NextRequest): string {
  // real client behind cloudflare, unspoofable
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

// drop stale buckets now and then so memory stays bounded
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS) return;
  lastSweep = now;
  for (const [ip, b] of buckets) {
    if (now - b.start > WINDOW_MS * 2) buckets.delete(ip);
  }
}

function rateLimit(req: NextRequest): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const ip = clientIp(req);
  let b = buckets.get(ip);
  if (!b || now - b.start > WINDOW_MS) {
    b = { count: 0, start: now };
    buckets.set(ip, b);
  }
  b.count++;
  if (b.count > MAX_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil((b.start + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfter };
  }
  return { ok: true };
}

// rate-limit, then read and size-cap the json body. returns the parsed body or
// a ready-to-return error response.
export async function guard(
  req: NextRequest
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; res: NextResponse }> {
  const rl = rateLimit(req);
  if (!rl.ok) {
    return {
      ok: false,
      res: json(
        { ok: false, error: { message: "rate limit exceeded, slow down and retry" } },
        429,
        { "Retry-After": String(rl.retryAfter) }
      ),
    };
  }

  const len = req.headers.get("content-length");
  if (len && Number(len) > MAX_BODY_BYTES) {
    return { ok: false, res: json({ ok: false, error: { message: "request body too large" } }, 413) };
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, res: json({ ok: false, error: { message: "request body too large" } }, 413) };
  }

  try {
    const body = text ? JSON.parse(text) : {};
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, res: json({ ok: false, error: { message: "invalid json body" } }, 400) };
  }
}
