// light/dark before first paint. shared by / and /chat (same localStorage key).
// "system" (or nothing stored) follows prefers-color-scheme.
export const THEME_KEY = "persona-theme";

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.setAttribute("data-theme",d?"dark":"light");e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;
