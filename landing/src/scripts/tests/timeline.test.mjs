// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimeline, DURATION, FPS, timelineHTML } from "../timeline.js";

let timeline;
let root;
let surface;
let frames;
let clock;

function key(value, options = {}) {
	document.body.dispatchEvent(
		new KeyboardEvent("keydown", { key: value, bubbles: true, ...options }),
	);
}
function advance(seconds) {
	for (let i = 0; i < seconds * 10; i++) {
		clock += 100;
		const callbacks = [...frames.values()];
		frames.clear();
		callbacks.forEach((callback) => callback(clock));
	}
}
function pointer(type, target, time, pointerId = 1) {
	const event = new MouseEvent(type, {
		bubbles: true,
		button: 0,
		clientX: (time / DURATION) * 1000,
	});
	Object.defineProperty(event, "pointerId", { value: pointerId });
	target.dispatchEvent(event);
}
function select(start, end) {
	timeline.setEnd(end);
	timeline.setStart(start);
}

beforeEach(() => {
	frames = new Map();
	clock = 0;
	let id = 0;
	vi.spyOn(performance, "now").mockImplementation(() => clock);
	vi.stubGlobal("requestAnimationFrame", (callback) => {
		frames.set(++id, callback);
		return id;
	});
	vi.stubGlobal("cancelAnimationFrame", (frame) => frames.delete(frame));
	document.body.innerHTML = `<section>${timelineHTML()}<button data-play></button><button data-loop></button><button data-step="1"></button><output data-out="start"></output><output data-out="end"></output><output data-out="timecode"></output></section>`;
	root = document.querySelector("section");
	surface = root.querySelector("[data-timeline]");
	surface.getBoundingClientRect = () => ({ left: 0, width: 1000 });
	surface.setPointerCapture = vi.fn();
	surface.hasPointerCapture = () => true;
	surface.releasePointerCapture = vi.fn();
	timeline = createTimeline(root);
});
afterEach(() => {
	timeline.destroy();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("landing transport matches the editor workflow", () => {
	it("starts with the whole asset selected, Playhead zero, and loop disabled", () => {
		expect(timeline.state).toEqual({
			s: 0,
			e: DURATION,
			ph: 0,
			playing: false,
			loop: false,
		});
		expect(root.querySelector("[data-loop]").getAttribute("aria-pressed")).toBe(
			"false",
		);
	});
	it("plays beyond Selection boundaries with loop off and stops at media end", () => {
		select(10, 20);
		timeline.seek(25);
		timeline.setPlaying(true);
		expect(timeline.state.ph).toBe(25);
		advance(1);
		expect(timeline.state.ph).toBeCloseTo(26);
		timeline.seek(DURATION - 0.05);
		advance(0.1);
		expect(timeline.state.ph).toBe(DURATION);
		expect(timeline.state.playing).toBe(false);
	});
	it("loops only after entry and recomputes entry after seeking", () => {
		select(10, 11);
		root.querySelector("[data-loop]").click();
		timeline.seek(12);
		timeline.setPlaying(true);
		advance(1);
		expect(timeline.state.ph).toBeCloseTo(13);
		timeline.seek(9.9);
		advance(1.2);
		expect(timeline.state.ph).toBeGreaterThanOrEqual(10);
		expect(timeline.state.ph).toBeLessThan(10.3);
		timeline.seek(20);
		advance(0.1);
		expect(timeline.state.ph).toBeCloseTo(20.1);
	});
	it("recomputes loop entry when Selection moves away from the Playhead", () => {
		select(10, 20);
		timeline.seek(15);
		root.querySelector("[data-loop]").click();
		timeline.setStart(30);
		timeline.setEnd(31);
		timeline.setPlaying(true);
		advance(1);
		expect(timeline.state.ph).toBeCloseTo(16);
	});
	it("sets crossed boundaries at the Playhead and moves the opposite edge minimally", () => {
		select(10, 20);
		timeline.seek(30);
		key("[");
		expect(timeline.state.s).toBe(30);
		expect(timeline.state.e).toBeCloseTo(30 + 1 / FPS);
		expect(timeline.state.ph).toBe(30);
		timeline.seek(5);
		key("]");
		expect(timeline.state.e).toBe(5);
		expect(timeline.state.s).toBeCloseTo(5 - 1 / FPS);
		expect(timeline.state.ph).toBe(5);
		const start = root.querySelector('[data-handle="start"]');
		const end = root.querySelector('[data-handle="end"]');
		expect(Number(start.getAttribute("aria-valuemax"))).toBeCloseTo(
			DURATION - 1 / FPS,
		);
		expect(Number(end.getAttribute("aria-valuemin"))).toBeCloseTo(1 / FPS);
	});
	it("pauses for both toolbar and keyboard frame steps", () => {
		timeline.seek(10);
		timeline.setPlaying(true);
		root.querySelector('[data-step="1"]').click();
		expect(timeline.state.playing).toBe(false);
		expect(timeline.state.ph).toBeCloseTo(10 + 1 / FPS);
		timeline.setPlaying(true);
		key("ArrowLeft", { shiftKey: true });
		expect(timeline.state.playing).toBe(false);
		expect(timeline.state.ph).toBeCloseTo(10);
	});
	it("moves a range as a draft without seeking and commits on release", () => {
		select(10, 20);
		timeline.seek(5);
		const body = root.querySelector("[data-selection-body]");
		pointer("pointerdown", body, 15);
		pointer("pointermove", surface, 25);
		expect(timeline.state).toMatchObject({ s: 10, e: 20, ph: 5 });
		expect(root.querySelector('[data-out="start"]').textContent).toBe(
			"00:00:20.000",
		);
		pointer("pointerup", surface, 25);
		expect(timeline.state).toMatchObject({ s: 20, e: 30, ph: 5 });
	});
	it("clamps a body move to the asset while preserving length", () => {
		select(10, 20);
		pointer("pointerdown", root.querySelector("[data-selection-body]"), 15);
		pointer("pointerup", surface, DURATION + 10);
		expect(timeline.state.e).toBe(DURATION);
		expect(timeline.state.e - timeline.state.s).toBeCloseTo(10);
	});
	it("scrubs an edge draft, ignores other pointers, and restores cancellation", () => {
		select(10, 20);
		timeline.seek(5);
		pointer("pointerdown", root.querySelector('[data-handle="start"]'), 10);
		pointer("pointermove", surface, 14, 2);
		expect(root.querySelector('[data-out="start"]').textContent).toBe(
			"00:00:10.000",
		);
		pointer("pointermove", surface, 14);
		expect(root.querySelector('[data-out="timecode"]').textContent).toBe(
			"00:00:14.000",
		);
		expect(timeline.state).toMatchObject({ s: 10, e: 20, ph: 5 });
		pointer("pointercancel", surface, 14);
		expect(timeline.state).toMatchObject({ s: 10, e: 20, ph: 5 });
		expect(root.querySelector('[data-out="timecode"]').textContent).toBe(
			"00:00:05.000",
		);
	});
	it("seeks empty waveform space without changing Selection", () => {
		select(10, 20);
		pointer("pointerdown", root.querySelector(".lane--audio"), 40);
		pointer("pointerup", surface, 40);
		expect(timeline.state).toMatchObject({ s: 10, e: 20, ph: 40 });
	});
	it("keeps keyboard focus with the gesture being edited", () => {
		const start = root.querySelector('[data-handle="start"]');
		start.disabled = false;
		root.tabIndex = -1;
		pointer("pointerdown", start, 0);
		expect(document.activeElement).toBe(start);
		pointer("pointerup", surface, 1);
		pointer("pointerdown", root.querySelector("[data-selection-body]"), 10);
		expect(document.activeElement).toBe(root);
		pointer("pointerup", surface, 11);
	});
	it("lets its owner discard an unfinished gesture before hiding the surface", () => {
		select(10, 20);
		timeline.seek(5);
		pointer("pointerdown", root.querySelector('[data-handle="start"]'), 10);
		pointer("pointermove", surface, 14);
		timeline.cancelGesture();
		pointer("pointerup", surface, 14);
		expect(timeline.state).toMatchObject({ s: 10, e: 20, ph: 5 });
		expect(root.querySelector('[data-out="start"]').textContent).toBe(
			"00:00:10.000",
		);
	});
	it("yields Space to native disclosure activation", () => {
		const details = document.createElement("details");
		details.open = true;
		details.innerHTML = '<summary tabindex="0">Try keyboard controls</summary>';
		document.body.prepend(details);
		const summary = details.querySelector("summary");
		summary.focus();
		const event = new KeyboardEvent("keydown", {
			key: " ",
			bubbles: true,
			cancelable: true,
		});
		summary.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(timeline.state.playing).toBe(false);
	});
});
