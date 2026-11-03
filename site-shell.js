(() => {
  const path = window.location.pathname.replace(/\/{2,}/g, "/");
  let active = "";
  if (path === "/" || path === "/index.html") active = "/";
  else if (path.startsWith("/sessions/") || path.startsWith("/ateliers/")) active = "/ateliers/";
  else if (path.startsWith("/programme/")) active = "/programme/";
  else if (path.startsWith("/intervenants/")) active = "/intervenants/";
  else if (path.startsWith("/infos-pratiques/")) active = "/infos-pratiques/";
  else if (path.startsWith("/presence/")) active = "/presence/";
  else if (path.startsWith("/inscription/")) active = "/inscription/";

  document.querySelectorAll("#main-navigation a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const route = href.split("?")[0];
    if (active && route === active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
})();
