import { EDITOR_URL } from "../links.js";
// Home page behaviour. Progressive enhancement only; the page reads fine without JS.
import { createTimeline } from "./timeline.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Run `fn(visible, entry)` whenever `el` enters/leaves the viewport. */
const onVisible = (el, fn, threshold = 0.15) => {
	if (!el) return;
	new IntersectionObserver(
		(entries) => entries.forEach((e) => fn(e.isIntersecting, e)),
		{ threshold },
	).observe(el);
};

/** Replace text and fade the new value in (opacity only, so fine under reduced motion). */
const swapText = (el, text) => {
	if (!el || el.textContent === text) return;
	el.textContent = text;
	el.animate([{ opacity: 0 }, { opacity: 1 }], {
		duration: 150,
		easing: "cubic-bezier(0.22, 1, 0.36, 1)",
	});
};

// Hero ↵ hint: Enter at the top of the page opens the editor.
document.addEventListener("keydown", (ev) => {
	if (
		ev.key !== "Enter" ||
		ev.metaKey ||
		ev.ctrlKey ||
		ev.altKey ||
		ev.shiftKey
	)
		return;
	if (document.activeElement !== document.body || window.scrollY > 240) return;
	window.location.href = EDITOR_URL;
});

/* ───────── Timelines (selection demo + shortcut playground) ───────── */
// Keyboard shortcuts drive whichever timeline fills most of the viewport.
const mountTimeline = (root, { onChange, onActive } = {}) => {
	if (!root) return null;
	let active = false;
	const disclosure = root.closest("details");
	const isActive = () => active && (!disclosure || disclosure.open);
	const tl = createTimeline(root, { onChange, isActive });
	const publishActive = () => {
		root.setAttribute("data-active", String(isActive()));
		onActive?.(isActive());
	};
	onVisible(
		root,
		(_, entry) => {
			active = entry.intersectionRatio >= 0.55;
			publishActive();
			if (!entry.isIntersecting && tl.state.playing) tl.setPlaying(false);
		},
		[0, 0.55, 0.8],
	);
	disclosure?.addEventListener("toggle", () => {
		publishActive();
		if (!disclosure.open) {
			tl.cancelGesture();
			tl.setPlaying(false);
		}
	});
	$$("button", root).forEach((button) => (button.disabled = false));
	root.dataset.ready = "";
	return tl;
};

// The optional reference illustrates range controls without depicting another editor.
mountTimeline($("[data-demo]"));

// Shortcut playground: the pressed shortcut's row lights up.
const playground = $("[data-try]");
if (playground) {
	const rows = $$("#shortcuts [data-row]");
	const hint = $("[data-hint]", playground);
	mountTimeline(playground, {
		onActive: (on) =>
			(hint.textContent = on
				? "Shortcuts are live"
				: "Scroll here, then try the keys"),
	});
	const rowFor = (ev) => {
		if (ev.key === " " || /^k$/i.test(ev.key)) return 0;
		if (ev.key.startsWith("Arrow")) return ev.shiftKey ? 3 : 1;
		if (/^[jl]$/i.test(ev.key)) return 2;
		return 4;
	};
	playground.addEventListener("tl-key", ({ detail: ev }) => {
		const row = rows[rowFor(ev)];
		rows.forEach((r) => r.classList.toggle("is-hit", r === row));
		$$(".cap", row).forEach((c) => {
			c.classList.add("is-pressed");
			setTimeout(() => c.classList.remove("is-pressed"), 160);
		});
	});
}

/* ───────── Repo card: command tabs + copy ───────── */
const repo = $("[data-repo]");
if (repo) {
	const tabs = $$("[data-tab]", repo);
	const panes = $$("[data-pane]", repo);
	const copy = $("[data-copy]", repo);
	const command = $("[data-command]", repo);
	const feedback = $("[data-copy-status]", repo);
	let copyFeedbackTimer;
	// Automatic activation: arrow navigation both focuses and selects the tab.
	const activateTab = (index) => {
		tabs.forEach((tab, i) => {
			tab.setAttribute("aria-selected", String(i === index));
			tab.tabIndex = i === index ? 0 : -1;
		});
		panes.forEach((pane, i) => (pane.hidden = i !== index));
		copy.hidden = index !== 0;
		feedback.textContent = "";
	};
	tabs.forEach((tab, index) => {
		tab.addEventListener("click", () => {
			activateTab(index);
			tab.focus();
		});
		tab.addEventListener("keydown", (event) => {
			let next;
			if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
			else if (event.key === "ArrowLeft")
				next = (index + tabs.length - 1) % tabs.length;
			else if (event.key === "Home") next = 0;
			else if (event.key === "End") next = tabs.length - 1;
			else return;
			event.preventDefault();
			event.stopPropagation();
			activateTab(next);
			tabs[next].focus();
		});
	});
	copy.addEventListener("click", async () => {
		const label = $("[data-label]", copy);
		clearTimeout(copyFeedbackTimer);
		copy.removeAttribute("data-copied");
		try {
			await navigator.clipboard.writeText(command.textContent.trim());
			swapText(label, "Copied");
			copy.setAttribute("data-copied", "true");
			feedback.textContent = "Commands copied.";
		} catch {
			command.closest("pre").focus({ preventScroll: true });
			const selection = window.getSelection();
			const range = document.createRange();
			range.selectNodeContents(command);
			selection?.removeAllRanges();
			selection?.addRange(range);
			swapText(label, "Copy manually");
			feedback.textContent = `${selection ? "Commands selected." : "Select the commands."} Use Copy in your browser or device’s text-selection menu.`;
		}
		copyFeedbackTimer = setTimeout(() => {
			swapText(label, "Copy");
			copy.removeAttribute("data-copied");
		}, 1600);
	});
	$(".repo__tabs", repo).hidden = false;
	copy.hidden = false;
}
