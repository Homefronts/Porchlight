// node cdp.mjs eval "<js expr>"   |   node cdp.mjs shot <out.png>
import fs from "node:fs";
const [cmd, arg] = process.argv.slice(2);
const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page" && t.url.startsWith("http://localhost:1420/") && !t.url.includes("floating-player")) ?? targets[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
};
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) =>
  new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
if (cmd === "eval") {
  const r = await send("Runtime.evaluate", { expression: arg, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result?.exceptionDetails ?? r, null, 1));
} else if (cmd === "shot") {
  const r = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(arg, Buffer.from(r.result.data, "base64"));
  console.log("saved", arg);
}
ws.close();
