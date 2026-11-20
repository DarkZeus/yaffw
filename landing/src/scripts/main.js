import { EDITOR_URL } from "../links.js";
// Home page behaviour. Progressive enhancement only; the page reads fine without JS.
import { createTimeline, createSceneView } from "./timeline.js";

const reduceMotion = window.matchMedia(
	"(prefers-reduced-motion: reduce)",
).matches;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

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

// Selection demo: the viewer shows the shot under the playhead.
const viewer = $("[data-viewer]");
const showScene = viewer
	? createSceneView(viewer, { still: reduceMotion })
	: () => {};
mountTimeline($("[data-demo]"), {
	onChange: (s) => showScene(s.ph),
});

// Preview card: same footage as the demo, frozen at the timecode it displays (00:00:07.003).
const miniViewer = $(".mini-viewer");
if (miniViewer) createSceneView(miniViewer, { still: true })(7.003);

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

/* ───────── Local-first diagram ───────── */
// Code arrives once on first view; the file loop pauses offscreen.
const bound = $("[data-bound]");
onVisible(
	bound,
	(vis) => {
		if (vis) bound.dataset.live = "";
		bound.dataset.playing = String(vis);
	},
	0.35,
);

/* ───────── Level meters ───────── */
const meters = $$("[data-meter]").map((m) => ({
	base: Number(m.dataset.meter),
	bars: $$("i", m).map((el) => ({ el, v: 0.4, target: 0.5 })),
}));
if (reduceMotion) {
	meters.forEach((m) =>
		m.bars.forEach((b, i) =>
			b.el.style.setProperty("--l", (0.55 * m.base + i * 0.04).toFixed(2)),
		),
	);
} else {
	let meterRaf = 0;
	let meterLast = 0;
	const meterTick = (now) => {
		if (now - meterLast > 70) {
			meterLast = now;
			const beat = 0.75 + 0.25 * Math.sin(now / 420);
			meters.forEach((m) =>
				m.bars.forEach((b) => {
					b.target = clamp(
						m.base * beat * (0.5 + Math.random() * 0.45),
						0.05,
						0.97,
					);
				}),
			);
		}
		meters.forEach((m) =>
			m.bars.forEach((b) => {
				// fast attack, slow release — like a real peak meter
				b.v += (b.target - b.v) * (b.target > b.v ? 0.5 : 0.08);
				b.el.style.setProperty("--l", b.v.toFixed(3));
			}),
		);
		meterRaf = requestAnimationFrame(meterTick);
	};
	onVisible($(".mixer"), (vis) => {
		cancelAnimationFrame(meterRaf);
		if (vis) meterRaf = requestAnimationFrame(meterTick);
	});
}

/* ───────── Bento pointer light ───────── */
// CSS fades the light in on hover; this only tells it where the pointer is.
if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
	$$(".bento .card").forEach((card) =>
		card.addEventListener("pointermove", (ev) => {
			const r = card.getBoundingClientRect();
			card.style.setProperty("--mx", `${ev.clientX - r.left}px`);
			card.style.setProperty("--my", `${ev.clientY - r.top}px`);
		}),
	);
}

/* ───────── Small looping illustrations ───────── */
const every = (el, ms, fn) => {
	if (!el || reduceMotion) return;
	let id = 0;
	onVisible(el, (vis) => {
		clearInterval(id);
		if (vis) id = setInterval(() => fn(), ms);
	});
};

// Formats
const formats = $("[data-formats]");
if (formats) {
	const chips = $$(".formats__row span", formats);
	const specs = [
		["H.264", "AAC"],
		["H.265", "AAC"],
		["AV1", "Opus"],
		["VP9", "Opus"],
		["H.264", "AAC"],
	];
	let fi = 0;
	const showFormat = () => {
		chips.forEach((c, i) => c.classList.toggle("is-on", i === fi));
		swapText($("[data-spec-v]", formats), specs[fi][0]);
		swapText($("[data-spec-a]", formats), specs[fi][1]);
	};
	showFormat();
	every(formats, 1800, () => {
		fi = (fi + 1) % chips.length;
		showFormat();
	});
}

// Workbench layout
const layoutDemo = $(".layout-demo");
if (layoutDemo) {
	const panes = ["a", "b", "c", "d", "e"].map((k) =>
		$(`.pane--${k}`, layoutDemo),
	);
	// [x, y, w, h] in % for Preview, Export, Transport, Audio, Selection
	const layouts = [
		[
			[0, 0, 62, 56],
			[62, 0, 38, 56],
			[0, 56, 100, 14],
			[0, 70, 24, 30],
			[24, 70, 76, 30],
		],
		[
			[0, 0, 70, 58],
			[70, 0, 30, 100],
			[0, 58, 70, 14],
			[0, 72, 22, 28],
			[22, 72, 48, 28],
		],
		[
			[24, 0, 76, 56],
			[76, 70, 24, 30],
			[0, 56, 100, 14],
			[0, 0, 24, 56],
			[0, 70, 76, 30],
		],
	];
	let li = 0;
	const apply = (next, animate) => {
		panes.forEach((p, i) => {
			const [x, y, w, h] = layouts[next][i];
			const prev = layouts[li][i];
			const moved = animate && prev.join() !== layouts[next][i].join();
			p.classList.toggle("is-moving", moved);
			p.style.setProperty("--x", x);
			p.style.setProperty("--y", y);
			p.style.setProperty("--w", w);
			p.style.setProperty("--h", h);
		});
		li = next;
		if (animate)
			setTimeout(
				() => panes.forEach((p) => p.classList.remove("is-moving")),
				900,
			);
	};
	apply(0, false);
	every(layoutDemo, 2800, () => apply((li + 1) % layouts.length, true));
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

/* Only enhance content below the viewport after the rest of initialization
   succeeds. Never hide existing content, including a deep-linked section. */
if (!reduceMotion) {
	const revealObserver = new IntersectionObserver((entries) => {
		entries.forEach((entry) => {
			if (!entry.isIntersecting) return;
			entry.target.animate(
				[
					{ opacity: 0, translate: "0 8px" },
					{ opacity: 1, translate: "0 0" },
				],
				{ duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
			);
			revealObserver.unobserve(entry.target);
		});
	});
	$$("[data-reveal]").forEach((el) => {
		if (el.getBoundingClientRect().top >= window.innerHeight)
			revealObserver.observe(el);
	});
}
