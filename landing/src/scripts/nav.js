// Nav gets its glass background once the page scrolls.
const nav = document.querySelector("[data-nav]");
if (nav) {
	const sync = () =>
		nav.setAttribute("data-scrolled", String(window.scrollY > 12));
	window.addEventListener("scroll", sync, { passive: true });
	sync();
}
