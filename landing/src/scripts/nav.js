// Nav gets its glass background once the page scrolls.
const nav = document.querySelector("[data-nav]");
if (nav) {
	const sync = () =>
		nav.setAttribute("data-scrolled", String(window.scrollY > 12));
	window.addEventListener("scroll", sync, { passive: true });
	sync();
}

/* ───────── Header and footer section links ─────────
   Header and footer links scroll to their section without writing `#section` into the URL.
   From another page, the target rides along in sessionStorage instead of the hash.
   Other links (changelog entries, in-page content) keep normal anchor behaviour. */
const PENDING = "yaffw:scroll-to";
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

/** Scroll to the element with `id` (or the top when `id` is empty) and move focus there. */
const scrollToTarget = (id, smooth) => {
	const el = id ? document.getElementById(id) : null;
	if (id && !el) return false;
	const behavior = smooth && !reduceMotion.matches ? "smooth" : "instant";
	if (!el) {
		window.scrollTo({ top: 0, behavior });
		return true;
	}
	el.scrollIntoView({ behavior, block: "start" });
	// Keyboard and screen-reader users continue from the section, as with a real anchor jump.
	if (!el.matches("a[href], button, input, select, textarea, [tabindex]")) {
		el.setAttribute("tabindex", "-1");
		el.setAttribute("data-scroll-target", ""); // no focus ring around a whole section (base.css)
	}
	el.focus({ preventScroll: true });
	return true;
};

document.addEventListener("click", (ev) => {
	if (ev.defaultPrevented || ev.button !== 0) return;
	if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
	const link =
		ev.target instanceof Element ? ev.target.closest("a[href]") : null;
	if (!link || link.target || !link.closest("[data-nav], .footer")) return;

	const url = new URL(link.href);
	if (url.origin !== location.origin) return;
	const id = decodeURIComponent(url.hash.slice(1));

	if (url.pathname === location.pathname) {
		if (scrollToTarget(id, true)) ev.preventDefault();
	} else if (id) {
		ev.preventDefault();
		sessionStorage.setItem(PENDING, id);
		location.assign(url.pathname + url.search);
	}
});

// Arrived from a header or footer link on another page. Base.astro already scrolled
// at reveal where supported; this moves focus there (and scrolls in other browsers).
const pending = sessionStorage.getItem(PENDING);
if (pending) {
	sessionStorage.removeItem(PENDING);
	scrollToTarget(pending, false);
}
