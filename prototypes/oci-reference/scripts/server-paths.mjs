export function resolvePreviewAsset(pathname) {
  if (pathname === "/") return "index.html";
  if (pathname === "/favicon.ico") return "assets/favicon.svg";
  return pathname.replace(/^\/+/, "");
}
