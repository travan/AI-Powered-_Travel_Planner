import { createServer } from "node:http";
let mode = "success";
let callCount = 0;
let prompts = [];
createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/health") return res.end("{}");
  if (req.url === "/calls") return res.end(JSON.stringify({ count: callCount, prompts }));
  let body = "";
  for await (const chunk of req) body += chunk;
  if (req.url === "/scenario" && req.method === "POST") {
    mode = JSON.parse(body).mode;
    callCount = 0;
    prompts = [];
    return res.end("{}");
  }
  if (req.url !== "/api/chat") {
    res.statusCode = 404;
    return res.end("{}");
  }
  callCount++;
  const input = JSON.parse(body);
  prompts.push(input.messages?.find((message) => message.role === "user")?.content ?? "");
  if (
    input.think !== false ||
    input.stream !== true ||
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
  if (mode === "learning-quality") {
    result.days=[{city:"Tokyo",date:"2026-11-04",day_number:1,title:"Detailed day",activities:[
      ["07:00","meal","breakfast"],["08:00","visit"],["09:00","visit"],["10:00","visit"],["11:00","visit"],["12:00","meal","lunch"],["13:00","visit"],["14:00","visit"],["18:00","meal","dinner"],["19:00","visit"],["20:00","rest"]
    ].map(([time,kind,meal_slot],index)=>({name:kind==="meal"?`Restaurant ${index}`:`Tokyo venue ${index}`,time,kind,meal_slot,category:kind==="meal"?"food":"attraction",duration:"1h",duration_minutes:60,travel_minutes:0,cost:5,currency:"USD",price:{amount:5,currency:"USD",scope:"person",status:"estimated",basis:"planning_estimate",assumption:"Illustrative per-person allowance for this test itinerary; not a venue quote."},description:"Spend time discovering the local collection and its main highlights. Take a quiet break to enjoy the atmosphere and understand the neighborhood. Bring water and confirm opening hours before leaving for the next nearby stop.",maps_link:""})),daily_cost_estimate:45}];
    result.transport_summary=[{segment:"Walking route",from:"Tokyo",to:"Tokyo",recommended_mode:"walk",price:{amount:0,currency:"USD",scope:"group",status:"estimated",basis:"planning_estimate",assumption:"Walking route with no standalone fare in this test scenario."},options:[]}];
    result.hotels=[];result.restaurants=[];result.suggestions=[];
    result.budget_breakdown={accommodation:0,food:15,activities:30,transport:0,contingency:5,total:50,currency:"USD",per_person:50,per_day:50};
  }
  const content =
    mode === "malformed"
      ? '{"days":'
      : mode === "empty"
        ? ""
        : JSON.stringify(result);
  // Match the native streaming contract used by the real Ollama adapter.
  res.setHeader("content-type", "application/x-ndjson");
  res.write(`${JSON.stringify({ message: { content }, done: false })}\n`);
  res.end(
    `${JSON.stringify({
      message: { content: "" },
      done: true,
      done_reason: mode === "empty" ? "length" : "stop",
      prompt_eval_count: 320,
      eval_count: 180,
      total_duration: 2_400_000_000,
    })}\n`,
  );
}).listen(3349, "127.0.0.1");
