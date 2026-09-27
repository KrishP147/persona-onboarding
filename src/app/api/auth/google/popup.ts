// Tiny standalone HTML for the OAuth popup. When done, it tells the opener and closes.
export function popupPage(opts: { title: string; body?: string; result?: { ok: boolean; error?: string }; sessionId?: string }) {
  const script = opts.result
    ? `<script>
  const msg = ${JSON.stringify({ type: "persona-gmail", ...opts.result })};
  try { if (window.opener) { window.opener.postMessage(msg, window.location.origin); window.close(); } } catch (e) {}
  // No opener (popup was opened as a tab, or blocked): go back to the app.
  setTimeout(() => { window.location.href = "/${opts.sessionId ? `?s=${opts.sessionId}` : ""}"; }, 800);
</script>`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title}</title>
<style>body{font-family:system-ui,sans-serif;background:#16171b;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px}
main{max-width:360px;text-align:center}button{background:#6366f1;color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:15px;cursor:pointer}a{color:#aab}</style>
</head><body><main><h2>${opts.title}</h2>${opts.body ?? ""}</main>${script}</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
