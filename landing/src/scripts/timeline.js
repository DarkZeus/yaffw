// Selection-timeline engine shared by the demo and the shortcuts playground.

export const isTyping = (e) =>
	/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) ||
	e.target.isContentEditable;

export const DURATION = 93.525;
export const FPS = 30;
const MIN_GAP = 0.5;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const rng = (seed) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const formatTime = (sec, withHours = true) => {
	const ms = Math.round(sec * 1000);
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	const s = Math.floor((ms % 60_000) / 1000);
	const r = ms % 1000;
	const pad = (n, l = 2) => String(n).padStart(l, "0");
	const core = `${pad(m)}:${pad(s)}.${pad(r, 3)}`;
	return withHours ? `${pad(h)}:${core}` : core;
};

// Abstract "scenes" painted with gradients, same recipe as the landing.
const SCENES = [
	[250, 40, 0.42, 30, 22],
	[210, 160, 0.5, 70, 30],
	[60, 30, 0.62, 50, 18],
	[30, 260, 0.36, 22, 40],
	[280, 220, 0.3, 64, 26],
	[90, 140, 0.55, 40, 34],
	[200, 70, 0.46, 78, 20],
	[20, 50, 0.6, 30, 28],
];
const SCENE_LAYERS = (() => {
	const rand = rng(7);
	const shape = rng(11);
	return SCENES.map(([skyH, groundH, light, sunX, sunY]) => {
		const horizon = 52 + Math.round(rand() * 14);
		const angle = 170 + Math.round(rand() * 20);
		// Far ridge silhouette: a jagged top edge, flat bottom (hidden behind the ground).
		let peaks = "";
		for (let x = 0; x <= 100; x += 4)
			peaks += `${x}% ${(10 + shape() * 20 + 10 * Math.sin(x / 9 + skyH)).toFixed(1)}%,`;
		return {
			horizon,
			// +1 / -1: which way the camera drifts through this shot
			dir: shape() < 0.5 ? -1 : 1,
			sun: `radial-gradient(circle at ${sunX}% ${sunY}%, oklch(${(light + 0.38).toFixed(2)} 0.12 ${skyH + 30}) 0 6%, oklch(${(light + 0.2).toFixed(2)} 0.1 ${skyH + 30} / 0.5) 10%, oklch(${(light + 0.12).toFixed(2)} 0.08 ${skyH + 30} / 0.16) 18%, transparent 34%)`,
			ground: `linear-gradient(${angle}deg, transparent ${horizon}%, oklch(0.14 0.02 ${groundH}) ${horizon + 0.4}% ${horizon + 8}%, oklch(0.2 0.04 ${groundH}) 100%)`,
			sky: `linear-gradient(to bottom, oklch(${light.toFixed(2)} 0.08 ${skyH}), oklch(${(light * 0.55).toFixed(2)} 0.06 ${skyH + 20}))`,
			ridge: `oklch(${(light * 0.62).toFixed(2)} 0.05 ${(skyH + groundH) / 2})`,
			ridgePath: `polygon(0% 100%, ${peaks} 100% 100%)`,
		};
	});
})();
export const sceneBackgrounds = SCENE_LAYERS.map((l) =>
	[l.sun, l.ground, l.sky].join(","),
);
const sceneIndex = (t) =>
	Math.min(SCENES.length - 1, Math.floor((t / DURATION) * SCENES.length));
export const sceneAt = (t) => sceneBackgrounds[sceneIndex(t)];

/**
 * Paint the scenes into `el` as parallax layers and return `show(t)`.
 * The frame is a pure function of the playhead, so play, scrub and seek all agree;
 * each shot gets a slow camera drift, nearer layers moving further. `still` holds the camera.
 */
export function createSceneView(el, { still = false } = {}) {
	el.insertAdjacentHTML(
		"afterbegin",
		`<div class="scene" aria-hidden="true"><div class="scene__cam"><i class="scene__sky"></i><i class="scene__sun"></i><i class="scene__ridge"></i><i class="scene__ground"></i></div></div>`,
	);
	const [cam, sky, sun, ridge, ground] = [
		"cam",
		"sky",
		"sun",
		"ridge",
		"ground",
	].map((k) => el.querySelector(`.scene__${k}`));
	let shown = -1;
	return (t) => {
		const pos = clamp(t / DURATION, 0, 1) * SCENES.length;
		const i = sceneIndex(t);
		const l = SCENE_LAYERS[i];
		if (i !== shown) {
			// Shot change: a hard cut, like real footage.
			shown = i;
			sky.style.background = l.sky;
			sun.style.background = l.sun;
			ground.style.background = l.ground;
			ridge.style.background = l.ridge;
			ridge.style.clipPath = l.ridgePath;
			ridge.style.top = `${l.horizon - 22}%`;
		}
		// -0.5 → 0.5 across the shot
		const p = still ? 0 : pos - i - 0.5;
		const d = l.dir * p;
		cam.style.scale = String(1.06 + 0.06 * p * l.dir);
		sun.style.translate = `${(-d * 3).toFixed(3)}% ${(p * 6).toFixed(3)}%`;
		ridge.style.translate = `${(-d * 8).toFixed(3)}% 0`;
		ground.style.translate = `${(-d * 14).toFixed(3)}% 0`;
	};
}

export function waveSVG(bars = 260, seed = 42) {
	const wr = rng(seed);
	let d = "";
	for (let i = 0; i < bars; i++) {
		const t = i / bars;
		const env =
			0.35 +
			0.35 * Math.sin(t * Math.PI * 3.2 + 0.6) ** 2 +
			0.25 * Math.sin(t * Math.PI * 11 + 1.3) ** 2;
		const intro = clamp(t * 14, 0.05, 1) * clamp((1 - t) * 18, 0.05, 1);
		const a = clamp(env * intro * (0.45 + wr() * 0.6), 0.02, 0.98) * 46;
		d += `M${i + 0.15} ${50 - a}h0.7v${a * 2}h-0.7z`;
	}
	return `<svg class="wave" viewBox="0 0 ${bars} 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 50H${bars}" stroke="var(--workbench-waveform-guide)" stroke-width="0.6" vector-effect="non-scaling-stroke"/><path d="${d}" fill="currentColor"/></svg>`;
}

export function rulerHTML(majors = 4) {
	let out = "";
	for (let i = 0; i <= majors * 5; i++) {
		const f = i / (majors * 5);
		if (i % 5 === 0) {
			out += `<i class="major" style="left:${f * 100}%"></i>`;
			if (i < majors * 5)
				out += `<span style="left:${f * 100}%">${formatTime(f * DURATION)}</span>`;
		} else out += `<i style="left:${f * 100}%"></i>`;
	}
	return out;
}

export function filmstripHTML() {
	return sceneBackgrounds
		.map(
			(bg, i) =>
				`<div class="frame" style="--bg:${bg}" data-tc="${formatTime((i / SCENES.length) * DURATION, false)}"></div>`,
		)
		.join("");
}

/**
 * Wire a timeline inside `root`. Looks for: [data-timeline] (pointer surface),
 * [data-handle=start|end], [data-play], [data-seek=±n], [data-step=±n], [data-loop], [data-reset],
 * and text outputs [data-out=timecode|duration|start|end].
 */
export function createTimeline(
	root,
	{ start = 0.18, end = 0.72, onChange, isActive = () => true } = {},
) {
	const $ = (s) => root.querySelector(s);
	const $$ = (s) => [...root.querySelectorAll(s)];
	const timeline = $("[data-timeline]");
	const tracks = $$(".playhead-track");
	const state = {
		s: DURATION * start,
		e: DURATION * end,
		ph: DURATION * start,
		playing: false,
		loop: true,
	};
	const listeners = new Set(onChange ? [onChange] : []);
	const offs = [];
	const on = (el, type, fn, opts) => {
		el.addEventListener(type, fn, opts);
		offs.push(() => el.removeEventListener(type, fn, opts));
	};

	const render = (reason) => {
		const ph = (state.ph / DURATION).toFixed(5);
		tracks.forEach((t) => t.style.setProperty("--ph", ph));
		root.dataset.playing = String(state.playing);
		$$("[data-out]").forEach((el) => {
			const k = el.dataset.out;
			const short = el.hasAttribute("data-short");
			el.textContent = formatTime(
				k === "timecode"
					? state.ph
					: k === "duration"
						? state.e - state.s
						: k === "start"
							? state.s
							: state.e,
				!short,
			);
		});
		// Selection and handles only change on user input, never on a playback frame.
		if (reason !== "tick") {
			root.style.setProperty("--s", (state.s / DURATION).toFixed(5));
			root.style.setProperty("--e", (state.e / DURATION).toFixed(5));
			$$("[data-handle]").forEach((h) => {
				const v = h.dataset.handle === "start" ? state.s : state.e;
				h.setAttribute("aria-valuemin", "0");
				h.setAttribute("aria-valuemax", String(DURATION));
				h.setAttribute("aria-valuenow", v.toFixed(3));
				h.setAttribute("aria-valuetext", formatTime(v));
			});
		}
		listeners.forEach((fn) => fn(state, reason));
	};

	const api = {
		state,
		render,
		subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
		setStart: (t) => (
			(state.s = clamp(t, 0, state.e - MIN_GAP)),
			render("start")
		),
		setEnd: (t) => (
			(state.e = clamp(t, state.s + MIN_GAP, DURATION)),
			render("end")
		),
		seek: (t) => ((state.ph = clamp(t, 0, DURATION)), render("seek")),
		setPlaying,
		reset: () => ((state.s = 0), (state.e = DURATION), render("reset")),
	};

	let last = 0;
	let raf = 0;
	function tick(now) {
		const dt = Math.min(0.5, (now - last) / 1000);
		last = now;
		state.ph += dt;
		if (state.ph >= state.e) {
			if (state.loop) state.ph = state.s + (state.ph - state.e);
			else {
				state.ph = state.e;
				return setPlaying(false);
			}
		}
		render("tick");
		if (state.playing) raf = requestAnimationFrame(tick);
	}
	function setPlaying(onoff) {
		state.playing = onoff;
		$$("[data-play]").forEach((b) =>
			b.setAttribute("aria-label", onoff ? "Pause" : "Play selection"),
		);
		cancelAnimationFrame(raf);
		if (onoff) {
			if (state.ph < state.s || state.ph >= state.e - 0.02) state.ph = state.s;
			last = performance.now();
			raf = requestAnimationFrame(tick);
		}
		render("play");
	}

	if (timeline) {
		const timeAt = (x) => {
			const r = timeline.getBoundingClientRect();
			return clamp((x - r.left) / r.width, 0, 1) * DURATION;
		};
		let drag = null;
		const move = (ev) => {
			if (!drag) return;
			const t = timeAt(ev.clientX);
			if (drag === "start") api.setStart(t);
			else if (drag === "end") api.setEnd(t);
			else api.seek(t);
		};
		on(timeline, "pointerdown", (ev) => {
			if (ev.button !== 0) return;
			const handle = ev.target.closest("[data-handle]");
			drag = handle ? handle.dataset.handle : "playhead";
			if (handle) handle.dataset.dragging = "true";
			timeline.setPointerCapture(ev.pointerId);
			move(ev);
			if (!handle) ev.preventDefault();
		});
		on(timeline, "pointermove", move);
		const endDrag = () => {
			$$("[data-dragging]").forEach((h) => delete h.dataset.dragging);
			drag = null;
		};
		on(timeline, "pointerup", endDrag);
		on(timeline, "pointercancel", endDrag);
	}

	$$("[data-handle]").forEach((el) =>
		on(el, "keydown", (ev) => {
			const step = ev.shiftKey ? 1 / FPS : 1;
			const dir = /Left|Down/.test(ev.key)
				? -1
				: /Right|Up/.test(ev.key)
					? 1
					: 0;
			if (!dir) return;
			ev.preventDefault();
			ev.stopPropagation();
			if (el.dataset.handle === "start") api.setStart(state.s + dir * step);
			else api.setEnd(state.e + dir * step);
		}),
	);
	$$("[data-play]").forEach((b) =>
		on(b, "click", () => setPlaying(!state.playing)),
	);
	$$("[data-loop]").forEach((b) =>
		on(b, "click", () => {
			state.loop = !state.loop;
			b.setAttribute("aria-pressed", String(state.loop));
		}),
	);
	$$("[data-seek]").forEach((b) =>
		on(b, "click", () => api.seek(state.ph + Number(b.dataset.seek))),
	);
	$$("[data-step]").forEach((b) =>
		on(b, "click", () => api.seek(state.ph + Number(b.dataset.step) / FPS)),
	);
	$$("[data-reset]").forEach((b) => on(b, "click", api.reset));

	// Shortcuts are live while isActive() says so (e.g. the timeline fills most of the viewport).
	const onKeydown = (ev) => {
		if (!isActive() || ev.metaKey || ev.ctrlKey || ev.altKey || isTyping(ev))
			return;
		const onButton = /^(BUTTON|A)$/.test(document.activeElement?.tagName);
		const k = ev.key;
		if (k === " ") {
			if (onButton) return;
			setPlaying(!state.playing);
		} else if (k === "k" || k === "K") setPlaying(!state.playing);
		else if (k === "j" || k === "J") api.seek(state.ph - 10);
		else if (k === "l" || k === "L") api.seek(state.ph + 10);
		else if (k === "[") api.setStart(state.ph);
		else if (k === "]") api.setEnd(state.ph);
		else if (
			(k === "ArrowLeft" || k === "ArrowRight") &&
			!ev.target.closest("[data-handle]")
		) {
			api.seek(
				state.ph + (k === "ArrowLeft" ? -1 : 1) * (ev.shiftKey ? 1 / FPS : 1),
			);
		} else return;
		ev.preventDefault();
		root.dispatchEvent(new CustomEvent("tl-key", { detail: ev }));
	};
	on(document, "keydown", onKeydown);

	render("init");
	api.destroy = () => {
		cancelAnimationFrame(raf);
		offs.forEach((f) => f());
		listeners.clear();
	};
	return api;
}

export const ICONS = {
	play: '<svg class="i-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.5v9l7-4.5z" fill="currentColor"/></svg><svg class="i-pause" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor"/></svg>',
	back10:
		'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4L4 8l4 4M12 4L8 8l4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
	fwd10:
		'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l4 4-4 4M8 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
	prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3.5v9M12 4L7 8l5 4z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
	next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 3.5v9M4 4l5 4-5 4z" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
	loop: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7V6a2 2 0 0 1 2-2h7l-2-2M13 9v1a2 2 0 0 1-2 2H4l2 2" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>',
	reset:
		'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.5M3 2.5V5h2.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};

/** Standard timeline markup: ruler + video lane + audio lane + selection + handles + playhead. */
export function timelineHTML({
	ruler = true,
	video = true,
	audio = true,
} = {}) {
	return `<div class="timeline${ruler ? "" : " timeline--noruler"}" data-timeline>
		${ruler ? `<div class="ruler" aria-hidden="true">${rulerHTML()}</div>` : ""}
		${video ? `<div class="lane lane--video" aria-hidden="true">${filmstripHTML()}</div>` : ""}
		${audio ? `<div class="lane lane--audio" aria-hidden="true">${waveSVG()}</div>` : ""}
		<div class="shade shade--l" aria-hidden="true"></div>
		<div class="shade shade--r" aria-hidden="true"></div>
		<div class="selection" aria-hidden="true"></div>
		<button class="handle handle--start" type="button" disabled role="slider" aria-label="Selection start" data-handle="start"></button>
		<button class="handle handle--end" type="button" disabled role="slider" aria-label="Selection end" data-handle="end"></button>
		<div class="playhead-track" aria-hidden="true"><div class="playhead"><i></i></div></div>
	</div>`;
}
