// Nav gets its glass background once the page scrolls.
const nav = document.querySelector("[data-nav]");
if (nav) {
	const sync = () =>
		nav.setAttribute("data-scrolled", String(window.scrollY > 12));
	window.addEventListener("scroll", sync, { passive: true });
	sync();
}

const menu = document.querySelector("[data-section-menu]");
if (menu) {
	const summary = menu.querySelector("summary");
	document.addEventListener("keydown", (event) => {
		if (event.key !== "Escape" || !menu.open) return;
		menu.open = false;
		summary.focus();
		event.preventDefault();
	});
	document.addEventListener("pointerdown", (event) => {
		if (!menu.contains(event.target)) menu.open = false;
	});
	document.addEventListener("focusin", (event) => {
		if (!menu.contains(event.target)) menu.open = false;
	});
	menu.addEventListener("click", (event) => {
		if (
			!event.target.closest("a") ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey ||
			event.defaultPrevented
		)
			return;
		// Let native fragment activation move focus before hiding its source link.
		setTimeout(() => (menu.open = false), 0);
	});
	window.addEventListener("pageshow", () => (menu.open = false));
	nav?.setAttribute("data-enhanced", "");
}
