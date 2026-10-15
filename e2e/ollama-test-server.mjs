import { createServer } from "node:http";
let mode = "success";
createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/health") return res.end("{}");
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/scenario" && req.method === "POST") {
    mode = JSON.parse(body).mode;
    return res.end("{}");
  }
  if (req.url !== "/api/chat") {
    res.statusCode = 404;
    return res.end("{}");
  }
  const input = JSON.parse(body);
  if (
    input.think !== false ||
    input.stream !== false ||
    input.format !== "json"
  ) {
    res.statusCode = 400;
    return res.end('{"error":"unexpected Ollama options"}');
  }
  if (mode === "http-error") {
    res.statusCode = 500;
    return res.end('{"error":"model runner crashed"}');
  }
  const result = {
    title: "Tokyo local model trip",
    num_days: 1,
    num_travelers: 1,
    currency: "USD",
    days:
      mode === "no-days"
        ? []
        : [
            {
              city: "Tokyo",
              theme: "Temple morning",
              schedule: [
                {
                  activity: "Senso-ji",
                  time_slot: "09:00",
                  cost_estimate_usd: 10,
                  duration: "1 hour",
                },
              ],
            },
          ],
    budget_breakdown: { activities_estimate: 10 },
  };
  const content =
    mode === "malformed"
      ? '{"days":'
      : mode === "empty"
        ? ""
        : JSON.stringify(result);
  res.end(
    JSON.stringify({
      message: { content },
      done_reason: mode === "empty" ? "length" : "stop",
    }),
  );
}).listen(3349, "127.0.0.1");
