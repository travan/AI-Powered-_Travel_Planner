// Isolated SMTP sink. No messages leave the test machine.
import { SMTPServer } from "smtp-server";
import { createServer } from "node:http";
const messages = [];
let failNext = false;
new SMTPServer({
  authOptional: true,
  disabledCommands: ["STARTTLS"],
  onData(stream, session, callback) {
    let raw = "";
    stream.on("data", (chunk) => {
      raw += chunk;
    });
    stream.on("end", () => {
      if (failNext) {
        failNext = false;
        const error = new Error("Temporary test relay error");
        error.responseCode = 451;
        callback(error);
        return;
      }
      messages.push({ to: session.envelope.rcptTo.map((r) => r.address), raw });
      callback();
    });
  },
}).listen(3351, "127.0.0.1");
createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  if (req.url === "/health") return res.end("{}");
  if (req.method === "POST" && req.url === "/fail-next") {
    failNext = true;
    return res.end("{}");
  }
  if (req.method === "DELETE") messages.length = 0;
  res.end(JSON.stringify(messages));
}).listen(3350, "127.0.0.1");
