// Selection-timeline engine shared by the demo and the shortcuts playground.

export const isTyping = (e) =>
	/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) ||
	e.target.isContentEditable;

export const DURATION = 93.525;
export const FPS = 30;
const MIN_GAP = 1 / FPS;

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
 * Wire the illustrative timeline. Selection is committed on pointer release;
 * onChange receives the visible draft during a gesture and the committed state otherwise.
 * This fixed-30-FPS simulation uses seconds, rather than the editor's media-time core.
 */
export function createTimeline(root, { onChange, isActive = () => true } = {}) {
	const $ = (s) => root.querySelector(s);
	const $$ = (s) => [...root.querySelectorAll(s)];
	const timeline = $("[data-timeline]");
	const tracks = $$(".playhead-track");
	const state = { s: 0, e: DURATION, ph: 0, playing: false, loop: false };
	let draft = null;
	let drag = null;
	let loopEntered = false;
	let last = 0;
	let raf = 0;
	const listeners = new Set(onChange ? [onChange] : []);
	const offs = [];
	const on = (el, type, fn, opts) => {
		el.addEventListener(type, fn, opts);
		offs.push(() => el.removeEventListener(type, fn, opts));
	};
	const repositionLoop = () => {
		loopEntered = state.ph >= state.s && state.ph < state.e;
	};
	// Same boundary-command rule as editor-core/selection: honor the requested
	// edge, moving the opposite edge only as far as the minimum duration requires.
	const withStart = (selection, time) => {
		const s = clamp(time, 0, DURATION - MIN_GAP);
		return { s, e: Math.max(selection.e, s + MIN_GAP) };
	};
	const withEnd = (selection, time) => {
		const e = clamp(time, MIN_GAP, DURATION);
		return { s: Math.min(selection.s, e - MIN_GAP), e };
	};
	const render = (reason) => {
		const visible = draft ? { ...state, ...draft } : state;
		const ph = (visible.ph / DURATION).toFixed(5);
		tracks.forEach((track) => track.style.setProperty("--ph", ph));
		root.dataset.playing = String(state.playing);
		$$("[data-play]").forEach((button) =>
			button.setAttribute("aria-label", state.playing ? "Pause" : "Play"),
		);
		$$("[data-loop]").forEach((button) =>
			button.setAttribute("aria-pressed", String(state.loop)),
		);
		$$("[data-out]").forEach((el) => {
			const key = el.dataset.out;
			el.textContent = formatTime(
				key === "timecode"
					? visible.ph
					: key === "duration"
						? visible.e - visible.s
						: key === "start"
							? visible.s
							: visible.e,
				!el.hasAttribute("data-short"),
			);
		});
		if (reason !== "tick") {
			root.style.setProperty("--s", (visible.s / DURATION).toFixed(5));
			root.style.setProperty("--e", (visible.e / DURATION).toFixed(5));
			$$("[data-handle]").forEach((handle) => {
				const start = handle.dataset.handle === "start";
				const value = start ? visible.s : visible.e;
				handle.setAttribute("aria-valuemin", String(start ? 0 : MIN_GAP));
				handle.setAttribute(
					"aria-valuemax",
					String(start ? DURATION - MIN_GAP : DURATION),
				);
				handle.setAttribute("aria-valuenow", String(value));
				handle.setAttribute("aria-valuetext", formatTime(value));
			});
		}
		listeners.forEach((fn) => fn(visible, reason));
	};
	const updateSelection = (next, reason) => {
		Object.assign(state, next);
		repositionLoop();
		render(reason);
	};
	const finishGesture = (reason) => {
		if (!drag) return;
		const pointerId = drag.pointerId;
		drag = null;
		draft = null;
		delete root.dataset.dragging;
		$$("[data-dragging]").forEach((handle) => delete handle.dataset.dragging);
		if (timeline.hasPointerCapture?.(pointerId))
			timeline.releasePointerCapture(pointerId);
		repositionLoop();
		render(reason);
	};
	const api = {
		state,
		render,
		cancelGesture: () => finishGesture("cancel"),
		subscribe: (fn) => (listeners.add(fn), () => listeners.delete(fn)),
		setStart: (time) => updateSelection(withStart(state, time), "start"),
		setEnd: (time) => updateSelection(withEnd(state, time), "end"),
		seek: (time) => {
			state.ph = clamp(time, 0, DURATION);
			repositionLoop();
			render("seek");
		},
		setPlaying,
		reset: () => updateSelection({ s: 0, e: DURATION }, "reset"),
	};
	function tick(now) {
		const dt = Math.min(0.5, (now - last) / 1000);
		last = now;
		const previous = state.ph;
		state.ph = Math.min(DURATION, state.ph + dt);
		if (state.loop) {
			if (
				(state.ph >= state.s && state.ph < state.e) ||
				(previous < state.s && state.ph >= state.s)
			)
				loopEntered = true;
			if (loopEntered && state.ph >= state.e) state.ph = state.s;
		}
		if (state.ph >= DURATION) return setPlaying(false);
		render("tick");
		if (state.playing) raf = requestAnimationFrame(tick);
	}
	function setPlaying(playing) {
		state.playing = playing;
		cancelAnimationFrame(raf);
		if (playing) {
			if (state.ph === DURATION) state.ph = 0;
			repositionLoop();
			last = performance.now();
			raf = requestAnimationFrame(tick);
		}
		render("play");
	}
	const stepFrame = (direction) => {
		setPlaying(false);
		api.seek(state.ph + direction / FPS);
	};

	if (timeline) {
		const timeAt = (x) => {
			const bounds = timeline.getBoundingClientRect();
			return clamp((x - bounds.left) / bounds.width, 0, 1) * DURATION;
		};
		const readDraft = (clientX) => {
			const initial = drag.initial;
			const delta = timeAt(clientX) - drag.time;
			if (drag.kind === "range") {
				const length = initial.e - initial.s;
				const s = clamp(initial.s + delta, 0, DURATION - length);
				return { s, e: s + length, ph: initial.ph };
			}
			if (drag.kind === "playhead") return { ...initial, ph: timeAt(clientX) };
			const selection =
				drag.kind === "start"
					? withStart(initial, initial.s + delta)
					: withEnd(initial, initial.e + delta);
			return { ...selection, ph: selection[drag.kind === "start" ? "s" : "e"] };
		};
		const ownsPointer = (event) => drag && event.pointerId === drag.pointerId;
		const finish = (commit, event) => {
			if (!drag || (event && !ownsPointer(event))) return;
			if (commit) Object.assign(state, readDraft(event.clientX));
			finishGesture(commit ? "commit" : "cancel");
		};
		on(timeline, "pointerdown", (event) => {
			if (drag || event.button !== 0 || event.isPrimary === false) return;
			const handle = event.target.closest("[data-handle]");
			const body = event.target.closest("[data-selection-body]");
			const kind = handle ? handle.dataset.handle : body ? "range" : "playhead";
			setPlaying(false);
			drag = {
				kind,
				pointerId: event.pointerId,
				time: timeAt(event.clientX),
				initial: { s: state.s, e: state.e, ph: state.ph },
			};
			draft = kind === "playhead" ? readDraft(event.clientX) : drag.initial;
			root.dataset.dragging = kind;
			if (handle) handle.dataset.dragging = "true";
			timeline.setPointerCapture(event.pointerId);
			(handle || root).focus({ preventScroll: true });
			event.preventDefault();
			render("preview");
		});
		on(timeline, "pointermove", (event) => {
			if (!ownsPointer(event)) return;
			draft = readDraft(event.clientX);
			render("preview");
		});
		on(timeline, "pointerup", (event) => finish(true, event));
		on(timeline, "pointercancel", (event) => finish(false, event));
		on(timeline, "lostpointercapture", (event) => finish(false, event));
		on(window, "blur", () => finish(false));
		on(document, "keydown", (event) => {
			if (drag && event.key === "Escape") {
				event.preventDefault();
				finish(false);
			}
		});
	}
	$$("[data-handle]").forEach((el) =>
		on(el, "keydown", (event) => {
			if (drag) return;
			const step = event.shiftKey ? 1 / FPS : 1;
			const direction = /Left|Down/.test(event.key)
				? -1
				: /Right|Up/.test(event.key)
					? 1
					: 0;
			if (!direction) return;
			event.preventDefault();
			event.stopPropagation();
			if (el.dataset.handle === "start")
				api.setStart(state.s + direction * step);
			else api.setEnd(state.e + direction * step);
		}),
	);
	$$("[data-play]").forEach((button) =>
		on(button, "click", () => setPlaying(!state.playing)),
	);
	$$("[data-loop]").forEach((button) =>
		on(button, "click", () => {
			state.loop = !state.loop;
			repositionLoop();
			render("loop");
		}),
	);
	$$("[data-seek]").forEach((button) =>
		on(button, "click", () => api.seek(state.ph + Number(button.dataset.seek))),
	);
	$$("[data-step]").forEach((button) =>
		on(button, "click", () => stepFrame(Number(button.dataset.step))),
	);
	$$("[data-reset]").forEach((button) => on(button, "click", api.reset));

	// Shortcuts are live only for the active timeline; typing and native button activation win.
	on(document, "keydown", (event) => {
		if (
			drag ||
			!isActive() ||
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			isTyping(event)
		)
			return;
		const onNativeControl = /^(BUTTON|A|SUMMARY)$/.test(
			document.activeElement?.tagName,
		);
		const key = event.key;
		if (key === " ") {
			if (onNativeControl) return;
			setPlaying(!state.playing);
		} else if (/^k$/i.test(key)) setPlaying(!state.playing);
		else if (/^j$/i.test(key)) api.seek(state.ph - 10);
		else if (/^l$/i.test(key)) api.seek(state.ph + 10);
		else if (key === "[") api.setStart(state.ph);
		else if (key === "]") api.setEnd(state.ph);
		else if (
			(key === "ArrowLeft" || key === "ArrowRight") &&
			!event.target.closest("[data-handle]")
		) {
			const direction = key === "ArrowLeft" ? -1 : 1;
			if (event.shiftKey) stepFrame(direction);
			else api.seek(state.ph + direction);
		} else return;
		event.preventDefault();
		root.dispatchEvent(new CustomEvent("tl-key", { detail: event }));
	});
	render("init");
	api.destroy = () => {
		cancelAnimationFrame(raf);
		offs.forEach((off) => off());
		listeners.clear();
	};
	return api;
}

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
		<div class="selection" data-selection-body aria-hidden="true"></div>
		<button class="handle handle--start" type="button" disabled role="slider" aria-label="Selection start" data-handle="start"></button>
		<button class="handle handle--end" type="button" disabled role="slider" aria-label="Selection end" data-handle="end"></button>
		<div class="playhead-track" aria-hidden="true"><div class="playhead"><i></i></div></div>
	</div>`;
}
