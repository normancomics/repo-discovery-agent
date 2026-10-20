// Minimal x402 v2 "exact" scheme on Base mainnet using the keyless PayAI facilitator.
import type { Request, Response, NextFunction, RequestHandler } from "express";

export const PAY_TO = process.env.PAY_TO ?? "0x3d95D4A6DbaE0Cd0643a82b13A13b08921D6ADf7";
export const FACILITATOR = process.env.FACILITATOR_URL ?? "https://facilitator.payai.network";
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const NETWORK = "eip155:8453";

export interface PaidRoute {
  path: string; method: "GET"; priceUsd: number; description: string;
  queryParams: Record<string, { type: string; description: string; required?: boolean }>;
  pathParams?: Record<string, string>; example: unknown; inputExample: Record<string, string>;
}

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
export const atomic = (usd: number) => String(Math.round(usd * 1_000_000));

export function requirements(route: PaidRoute) {
  return { scheme: "exact", network: NETWORK, amount: atomic(route.priceUsd), asset: USDC_BASE, payTo: PAY_TO,
    maxTimeoutSeconds: 300, extra: { name: "USD Coin", version: "2" } };
}

export function paymentRequired(route: PaidRoute, base: string, error: string) {
  return {
    x402Version: 2, error,
    resource: { url: base + route.path, description: route.description, mimeType: "application/json" },
    accepts: [requirements(route)],
    extensions: { bazaar: {
      info: { input: { type: "http", method: route.method, queryParams: route.inputExample }, output: { type: "json", example: route.example } },
      schema: { type: "object", properties: { input: { type: "object", properties: {
        queryParams: { type: "object", properties: Object.fromEntries(Object.entries(route.queryParams).map(([k, v]) => [k, { type: v.type, description: v.description }])),
          required: Object.entries(route.queryParams).filter(([, v]) => v.required).map(([k]) => k) } } } } },
    } },
  };
}

async function facilitator(op: "verify" | "settle", payload: unknown, route: PaidRoute) {
  const res = await fetch(`${FACILITATOR}/${op}`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ x402Version: 2, paymentPayload: payload, paymentRequirements: requirements(route) }),
    signal: AbortSignal.timeout(30_000) });
  return (await res.json()) as { isValid?: boolean; invalidReason?: string; success?: boolean; errorReason?: string };
}

/** Wraps a handler that returns JSON; verifies payment first, settles only after the work succeeds. */
export function paid(route: PaidRoute, base: () => string, work: (req: Request) => Promise<{ status: number; body: unknown }>): RequestHandler {
  return async (req: Request, res: Response, _next: NextFunction) => {
    const deny = (err: string) => { const p = paymentRequired(route, base(), err); res.set("PAYMENT-REQUIRED", b64(p)).status(402).json(p); };
    const sig = req.get("payment-signature") ?? req.get("x-payment");
    if (!sig) return deny("Payment required");
    let payload: unknown;
    try { payload = JSON.parse(Buffer.from(sig, "base64").toString("utf8")); } catch { return deny("Malformed payment header"); }
    try { const v = await facilitator("verify", payload, route); if (!v.isValid) return deny(v.invalidReason ?? "Invalid payment"); }
    catch { return res.status(502).json({ error: "Facilitator verify failed" }); }
    let out: { status: number; body: unknown };
    try { out = await work(req); } catch (e) { return res.status(500).json({ error: (e as Error).message }); }
    if (out.status >= 400) return res.status(out.status).json(out.body); // not charged
    try {
      const s = await facilitator("settle", payload, route);
      if (!s.success) return res.status(402).json({ error: "Settlement failed", detail: s });
      res.set("PAYMENT-RESPONSE", b64(s)).set("X-PAYMENT-RESPONSE", b64(s));
    } catch { return res.status(502).json({ error: "Facilitator settle failed" }); }
    res.status(out.status).json(out.body);
  };
}
