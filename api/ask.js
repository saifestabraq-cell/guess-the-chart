import Anthropic from "@anthropic-ai/sdk";

// Answers one yes/no question about the secret person. The prompt is built here,
// and the reply is locked to a tiny JSON schema, so this endpoint can't be used
// as a general-purpose Claude proxy.

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const yr = (y) => (y <= 0 ? `${1 - y} BC` : String(y));

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string", enum: ["yes", "no", "unsure", "not_yes_no"] },
    named: { type: "boolean" },
  },
  required: ["answer", "named"],
  additionalProperties: false,
};

// Very small per-instance throttle; add a real limiter (e.g. Upstash) for heavy traffic.
const hits = new Map();
function throttled(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "Questions are not configured" });

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0] || "anon";
  if (throttled(ip)) return res.status(429).json({ error: "Too many questions" });

  const b = req.body || {};
  const name = clip(b.name, 80);
  const question = clip(b.question, 300);
  if (!name || !question) return res.status(400).json({ error: "Missing name or question" });

  const m = Math.min(12, Math.max(1, Number(b.m) || 1));
  const born = `${MONTHS[m - 1]} ${Number(b.d) || 1}, ${yr(Number(b.y) || 0)}${b.julian ? " (Julian calendar)" : ""} in ${clip(b.place, 80)}`;
  const surname = name.split(" ").slice(-1)[0];

  const prompt = `You are the host of a guessing game. The secret person is ${name} (${clip(b.desc, 160)}), born ${born}.
The player is trying to identify them by asking yes or no questions. Answer from well known, verifiable facts about this person. Never reveal the name, never give hints beyond the answer.
Player's question: """${question}"""
Use "unsure" only when the truth is genuinely unknown or ambiguous. Use "not_yes_no" when the question cannot be answered with yes or no. Set "named" true only if the question directly names this exact secret person as its guess (e.g. "Is it ${surname}?"), otherwise false.`;

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: ANSWER_SCHEMA } },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") return res.status(200).json({ answer: "unsure", named: false });
    const text = response.content.find((c) => c.type === "text")?.text;
    if (!text) return res.status(502).json({ error: "No answer" });
    const out = JSON.parse(text);
    return res.status(200).json({ answer: out.answer, named: out.named === true });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Rate limited" });
    if (error instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: "Invalid API key" });
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return res.status(502).json({ error: "Upstream error" });
    }
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
}
