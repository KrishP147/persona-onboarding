// Tiny standalone HTML for the OAuth popup. When done, it tells the opener and closes.
// With `demo`, a failed sign-in isn't a dead end: the page offers a sample inbox and waits for a choice
// (the failure goes back to the chat only if they close it instead).
export function popupPage(opts: { title: string; body?: string; result?: { ok: boolean; error?: string }; sessionId?: string; demo?: boolean }) {
  const home = `/${opts.sessionId ? `?s=${opts.sessionId}` : ""}`;
  const msg = opts.result ? JSON.stringify({ type: "persona-gmail", ...opts.result }) : "null";
  const offerDemo = !!opts.demo && !!opts.sessionId && opts.result?.ok !== true;
  const script = !opts.result
    ? ""
    : offerDemo
      ? `<script>
  let told = false;
  const tell = () => { if (told) return; told = true; try { window.opener && window.opener.postMessage(${msg}, window.location.origin); } catch (e) {} };
  document.getElementById("demo").addEventListener("submit", () => { told = true; });
  window.addEventListener("pagehide", tell);
  document.getElementById("close").addEventListener("click", (e) => { e.preventDefault(); tell(); window.close(); setTimeout(() => { window.location.href = "${home}"; }, 300); });
</script>`
      : `<script>
  const msg = ${msg};
  try { if (window.opener) { window.opener.postMessage(msg, window.location.origin); window.close(); } } catch (e) {}
  // No opener (popup was opened as a tab, or blocked): go back to the app.
  setTimeout(() => { window.location.href = "${home}"; }, 800);
</script>`;
  const demo = offerDemo ? demoForm(opts.sessionId!, "Use a demo inbox instead") + `<p><a href="#" id="close">Close</a></p>` : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title}</title>
<style>body{font-family:system-ui,sans-serif;background:#16171b;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:360px;text-align:center}button,.btn{display:inline-block;background:#6366f1;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:15px;cursor:pointer;text-decoration:none;margin:4px 0}
.ghost{background:transparent;border:1px solid #555;color:#ddd}.small{font-size:13px;color:#99a}a{color:#aab}</style>
</head><body><main><h2>${opts.title}</h2>${opts.body ?? ""}${demo}</main>${script}</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export function demoForm(sessionId: string, label: string, ghost = true) {
  return `<form id="demo" method="post" action="/api/auth/google/demo"><input type="hidden" name="s" value="${sessionId}"><button type="submit"${ghost ? ' class="ghost"' : ""}>${label}</button></form>`;
}
