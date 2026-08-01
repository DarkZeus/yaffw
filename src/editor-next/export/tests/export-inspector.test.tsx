/* @vitest-environment jsdom */

import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultAudioMix } from "@/editor-core/audio-mix";
import {
	DEFAULT_OUTPUT_PROFILE,
	type ExportProgress,
	type GeneratedMedia,
	type OutputSettings,
	type ReadyMediaAsset,
	type Selection,
	createDefaultOutputSettings,
} from "@/editor-core/model";
import { evaluateRuntimeSupport } from "@/editor-core/runtime-capabilities";
import type { ExportSessionState } from "@/editor-core/session";
import { ExportInspectorPanel } from "../inspector/export-inspector";

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	window.localStorage.clear();
});

describe("ExportInspectorPanel", () => {
	it("renders supported export review, requirements, and start action", () => {
		const onStartExport = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={onStartExport}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		const exportInspector = screen.getByLabelText("Export inspector");
		expect(exportInspector.className).toContain("bg-workbench-inspector");
		expect(screen.getByLabelText("Export review").className).toContain(
			"overflow-visible",
		);
		expect(within(exportInspector).getByText("Output")).toBeTruthy();
		expect(within(exportInspector).queryByText("Current settings")).toBeNull();
		expect(within(exportInspector).getByText("Requirements")).toBeTruthy();
		expect(
			within(exportInspector).getByText("Documented output profile"),
		).toBeTruthy();
		expect(within(exportInspector).getByText("Browser APIs")).toBeTruthy();
		expect(screen.getByLabelText("Output settings panel")).toBeTruthy();
		expect(
			within(exportInspector).getByRole("button", {
				name: "Output settings",
			}),
		).toBeTruthy();
		expect(within(exportInspector).queryByText("GPU Acceleration")).toBeNull();
		expect(within(exportInspector).queryByText("Selected range")).toBeNull();
		const exportReview = screen.getByLabelText("Export review");
		expect(within(exportReview).getByText("Format")).toBeTruthy();
		expect(
			within(exportReview).getByText("MP4 / H.264 video / AAC audio"),
		).toBeTruthy();
		expect(
			within(exportInspector).getAllByText("Export").length,
		).toBeGreaterThan(0);
		expect(within(exportInspector).getByText("Whole file export")).toBeTruthy();
		expect(within(exportInspector).getByText("Range")).toBeTruthy();
		expect(
			within(exportInspector).getAllByText("Whole file").length,
		).toBeGreaterThan(0);
		expect(screen.queryByLabelText("Export strategy")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Start export" }));
		expect(onStartExport).toHaveBeenCalledTimes(1);
	});

	it("opens the Output settings modal shell without applying cancelled draft state", () => {
		const onApplyOutputSettings = vi.fn();
		const onStartExport = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={onApplyOutputSettings}
				onStartExport={onStartExport}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));

		const outputSettingsDialog = screen.getByRole("dialog", {
			name: "Output settings",
		});
		expect(outputSettingsDialog.className).toContain("quality-settings-dialog");
		const generalTab = within(outputSettingsDialog).getByRole("tab", {
			name: "General",
		});
		expect(generalTab.className).toContain(
			"data-[state=active]:before:bg-workbench-selected",
		);
		expect(
			within(outputSettingsDialog).getByRole("tab", { name: "Video" }),
		).toBeTruthy();
		expect(
			within(outputSettingsDialog).getByRole("tab", { name: "Audio" }),
		).toBeTruthy();
		const aiTab = within(outputSettingsDialog).getByRole("tab", {
			name: "AI",
		}) as HTMLButtonElement;
		expect(aiTab.disabled).toBe(true);
		expect(aiTab.getAttribute("data-state")).toBe("inactive");
		expect(within(outputSettingsDialog).queryByText("AI Upscaling")).toBeNull();

		fireEvent.mouseDown(aiTab, { button: 0, ctrlKey: false });
		fireEvent.click(aiTab);

		expect(aiTab.getAttribute("data-state")).toBe("inactive");
		expect(within(outputSettingsDialog).queryByText("AI Upscaling")).toBeNull();
		expect(
			within(outputSettingsDialog).queryByText("Frame Interpolation"),
		).toBeNull();
		expect(
			(
				within(outputSettingsDialog).getByRole("tab", {
					name: "Subtitles",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			within(outputSettingsDialog).getByText(
				"Changing output settings may re-encode video and can change output size, quality, and processing time.",
			),
		).toBeTruthy();
		expect(
			within(outputSettingsDialog).queryByText("GPU Acceleration"),
		).toBeNull();
		const outputPlan =
			within(outputSettingsDialog).getByLabelText("Output plan");
		expect(within(outputPlan).getByText("Output frame")).toBeTruthy();
		expect(
			within(outputPlan).getByRole("figure", {
				name: "Output frame proportions, 1920x1080",
			}),
		).toBeTruthy();
		expect(within(outputPlan).getByText("Same as source")).toBeTruthy();
		expect(
			within(outputPlan).queryByRole("img", {
				name: "Target resolution is smaller than source",
			}),
		).toBeNull();
		expect(
			within(outputPlan).queryByRole("img", {
				name: "Target resolution is larger than source",
			}),
		).toBeNull();

		fireEvent.click(
			within(outputSettingsDialog).getByRole("button", {
				name: "Cancel",
			}),
		);
		expect(onApplyOutputSettings).not.toHaveBeenCalled();
		expect(
			screen.queryByRole("dialog", { name: "Output settings" }),
		).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		const reopenedDialog = screen.getByRole("dialog", {
			name: "Output settings",
		});
		fireEvent.click(
			within(reopenedDialog).getByRole("button", {
				name: "Reset",
			}),
		);
		fireEvent.click(
			within(reopenedDialog).getByRole("button", {
				name: "Apply",
			}),
		);

		expect(onApplyOutputSettings).toHaveBeenCalledWith(defaultOutputSettings);
		expect(onStartExport).not.toHaveBeenCalled();
	});

	it("saves and loads Export presets as modal drafts before explicit Apply", () => {
		const onApplyOutputSettings = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={onApplyOutputSettings}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		let dialog = screen.getByRole("dialog", { name: "Output settings" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Presets" }));
		fireEvent.change(
			within(dialog).getByRole("combobox", { name: "Container" }),
			{ target: { value: "webm" } },
		);
		fireEvent.change(
			within(dialog).getByRole("textbox", { name: "Export preset name" }),
			{ target: { value: "  Web sharing  " } },
		);
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Save preset" }),
		);

		expect(within(dialog).getByText("Web sharing saved.")).toBeTruthy();
		expect(onApplyOutputSettings).not.toHaveBeenCalled();
		fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		dialog = screen.getByRole("dialog", { name: "Output settings" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Presets" }));
		fireEvent.change(
			within(dialog).getByRole("combobox", { name: "Saved Export preset" }),
			{ target: { value: "Web sharing" } },
		);
		fireEvent.click(within(dialog).getByRole("button", { name: "Load" }));

		expect(
			(
				within(dialog).getByRole("combobox", {
					name: "Container",
				}) as HTMLSelectElement
			).value,
		).toBe("webm");
		expect(
			within(dialog).getByText(
				"Web sharing loaded into the draft. Apply to update the editing session.",
			),
		).toBeTruthy();
		expect(onApplyOutputSettings).not.toHaveBeenCalled();

		fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
		expect(onApplyOutputSettings).toHaveBeenCalledWith({
			...defaultOutputSettings,
			audioCodec: { codec: "opus", kind: "documented-codec" },
			container: { container: "webm", kind: "documented-container" },
			videoCodec: { codec: "vp9", kind: "documented-codec" },
		});
	});

	it("requires confirmation before overwriting or deleting an Export preset", () => {
		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		const dialog = screen.getByRole("dialog", { name: "Output settings" });
		fireEvent.click(within(dialog).getByRole("button", { name: "Presets" }));
		const presetName = within(dialog).getByRole("textbox", {
			name: "Export preset name",
		});
		fireEvent.change(presetName, { target: { value: "Archive" } });
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Save preset" }),
		);
		fireEvent.click(
			within(dialog).getByRole("button", { name: "Save preset" }),
		);

		const overwrite = within(dialog).getByLabelText("Overwrite Export preset");
		expect(within(overwrite).getByText(/already exists/)).toBeTruthy();
		fireEvent.click(
			within(overwrite).getByRole("button", { name: "Overwrite" }),
		);

		fireEvent.click(
			within(dialog).getByRole("button", {
				name: "Delete selected Export preset",
			}),
		);
		const confirmation = within(dialog).getByLabelText("Delete Export preset");
		expect(within(confirmation).getByText(/Delete Archive/)).toBeTruthy();
		fireEvent.click(
			within(confirmation).getByRole("button", { name: "Delete" }),
		);
		expect(
			(
				within(dialog).getByRole("combobox", {
					name: "Saved Export preset",
				}) as HTMLSelectElement
			).disabled,
		).toBe(true);
	});

	it("filters video codecs and visibly replaces an incompatible preserved source codec", () => {
		const onApplyOutputSettings = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={onApplyOutputSettings}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		const dialog = screen.getByRole("dialog", { name: "Output settings" });
		const containerSelect = within(dialog).getByRole("combobox", {
			name: "Container",
		});

		expect(
			within(containerSelect)
				.getAllByRole("option")
				.map((option) => option.textContent),
		).toEqual([
			"Default output profile (MP4)",
			"MP4",
			"MOV",
			"Matroska (MKV)",
			"WebM",
			"MPEG transport stream",
		]);

		fireEvent.change(containerSelect, { target: { value: "webm" } });
		const videoTab = within(dialog).getByRole("tab", { name: "Video" });
		fireEvent.mouseDown(videoTab, { button: 0, ctrlKey: false });
		fireEvent.click(videoTab);

		const videoCodecSelect = within(dialog).getByRole("combobox", {
			name: "Video codec",
		}) as HTMLSelectElement;
		expect(videoCodecSelect.value).toBe("vp9");
		expect(
			within(videoCodecSelect)
				.getAllByRole("option")
				.map((option) => option.textContent),
		).toEqual(["Preserve source", "VP9", "AV1", "VP8"]);
		expect(
			within(dialog).getByText(
				"AVC cannot be preserved in WebM. VP9 was selected automatically. AAC cannot be preserved in WebM. OPUS was selected automatically.",
			),
		).toBeTruthy();

		const audioTab = within(dialog).getByRole("tab", { name: "Audio" });
		fireEvent.mouseDown(audioTab, { button: 0, ctrlKey: false });
		fireEvent.click(audioTab);
		const audioCodecSelect = within(dialog).getByRole("combobox", {
			name: "Audio codec",
		}) as HTMLSelectElement;
		expect(audioCodecSelect.value).toBe("opus");
		expect(
			within(audioCodecSelect)
				.getAllByRole("option")
				.map((option) => option.textContent),
		).toEqual(["Preserve source", "OPUS", "VORBIS"]);

		fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
		expect(onApplyOutputSettings).toHaveBeenCalledWith({
			...defaultOutputSettings,
			audioCodec: { codec: "opus", kind: "documented-codec" },
			container: { container: "webm", kind: "documented-container" },
			videoCodec: { codec: "vp9", kind: "documented-codec" },
		});
	});

	it("offers only source-relative downscales and applies the selected resolution", () => {
		const onApplyOutputSettings = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={onApplyOutputSettings}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		const dialog = screen.getByRole("dialog", { name: "Output settings" });
		const videoTab = within(dialog).getByRole("tab", { name: "Video" });
		fireEvent.mouseDown(videoTab, { button: 0, ctrlKey: false });
		fireEvent.click(videoTab);

		const resolutionSelect = within(dialog).getByRole("combobox", {
			name: "Resolution",
		});
		expect(
			within(resolutionSelect)
				.getAllByRole("option")
				.map((option) => option.textContent),
		).toEqual([
			"Preserve source (1920x1080)",
			"1280x720",
			"854x480",
			"640x360",
		]);

		fireEvent.change(resolutionSelect, { target: { value: "1280x720" } });
		expect(
			within(dialog).getByRole("img", {
				name: "Target resolution is smaller than source",
			}),
		).toBeTruthy();
		expect(within(dialog).getByText("Downscale from 1920x1080")).toBeTruthy();
		fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

		expect(onApplyOutputSettings).toHaveBeenCalledWith({
			...defaultOutputSettings,
			resolution: {
				height: 720,
				kind: "target-dimensions",
				width: 1280,
			},
		});
	});

	it("applies independent Subjective quality and custom bitrate choices", () => {
		const onApplyOutputSettings = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={onApplyOutputSettings}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		const dialog = screen.getByRole("dialog", { name: "Output settings" });
		const videoTab = within(dialog).getByRole("tab", { name: "Video" });
		fireEvent.mouseDown(videoTab, { button: 0, ctrlKey: false });
		fireEvent.click(videoTab);
		fireEvent.change(
			within(dialog).getByRole("combobox", { name: "Video quality" }),
			{ target: { value: "high" } },
		);

		const audioTab = within(dialog).getByRole("tab", { name: "Audio" });
		fireEvent.mouseDown(audioTab, { button: 0, ctrlKey: false });
		fireEvent.click(audioTab);
		fireEvent.change(
			within(dialog).getByRole("combobox", { name: "Audio quality" }),
			{ target: { value: "custom-bitrate" } },
		);
		const customAudioBitrate = within(dialog).getByRole("spinbutton", {
			name: "Custom audio quality bitrate in Mbps",
		});
		fireEvent.change(customAudioBitrate, { target: { value: "0" } });
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Apply",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			within(dialog).getByText(
				"Enter a positive whole-number audio bitrate in bits per second.",
			),
		).toBeTruthy();

		fireEvent.change(customAudioBitrate, { target: { value: "0.256" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));

		expect(onApplyOutputSettings).toHaveBeenCalledWith({
			...defaultOutputSettings,
			audioQuality: { bitrateBps: 256_000, kind: "custom-bitrate" },
			videoQuality: { kind: "subjective-quality", quality: "high" },
		});
	});

	it("summarizes applied video and audio quality in Export review", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.videoQuality = {
			kind: "subjective-quality",
			quality: "high",
		};
		outputSettings.audioQuality = {
			bitrateBps: 256_000,
			kind: "custom-bitrate",
		};

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={outputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		const review = screen.getByLabelText("Export review");
		expect(within(review).getByText("Video quality")).toBeTruthy();
		expect(within(review).getByText("High")).toBeTruthy();
		expect(within(review).getByText("Audio quality")).toBeTruthy();
		expect(within(review).getByText("256 Kbps")).toBeTruthy();
	});

	it("shows an applied documented output profile in Export review", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "webm",
			kind: "documented-container",
		};
		outputSettings.videoCodec = {
			codec: "vp9",
			kind: "documented-codec",
		};
		outputSettings.audioCodec = { kind: "preserve-source" };
		outputSettings.resolution = {
			height: 720,
			kind: "target-dimensions",
			width: 1280,
		};

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={outputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		const exportInspector = screen.getByLabelText("Export inspector");
		expect(
			within(exportInspector).getByText("WebM / VP9 video / OPUS audio"),
		).toBeTruthy();
		expect(
			within(exportInspector).getByText("Documented output profile"),
		).toBeTruthy();
		expect(
			within(screen.getByLabelText("Export review")).getByText("1280x720"),
		).toBeTruthy();
		expect(within(exportInspector).queryByText("MP4 export")).toBeNull();
	});

	it("blocks Apply and Export when no documented container state can be resolved", () => {
		const outputSettings = createDefaultOutputSettings();
		outputSettings.container = {
			container: "missing-container",
			kind: "documented-container",
		};

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={outputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(
			(
				screen.getByRole("button", {
					name: "Start export",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(
			screen.getByText(
				"The selected missing-container container is not documented by the browser-local media writer.",
			),
		).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Output settings" }));
		const dialog = screen.getByRole("dialog", { name: "Output settings" });
		expect(within(dialog).getByRole("alert").textContent).toContain(
			"The selected missing-container container is not documented",
		);
		expect(
			(
				within(dialog).getByRole("button", {
					name: "Apply",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("blocks Output settings while an export job is running", () => {
		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={runningExport({
					cancelSupported: true,
					progress: {
						phase: "encoding",
					},
				})}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(
			(
				screen.getByRole("button", {
					name: "Output settings",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		expect(screen.getByText("Locked")).toBeTruthy();
	});

	it("renders blocked export review with a disabled start action", () => {
		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{ status: "reviewing" }}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={invalidSelection}
			/>,
		);

		const exportInspector = screen.getByLabelText("Export inspector");
		expect(within(exportInspector).getAllByText("Blocked").length).toBe(2);
		expect(
			within(exportInspector).getByText("Documented output profile"),
		).toBeTruthy();
		expect(
			within(exportInspector).getByText(
				`Expected selection inside [0, ${readyAsset.durationUs}], got [${invalidSelection.startUs}, ${invalidSelection.endUs}].`,
			),
		).toBeTruthy();
		expect(
			(
				screen.getByRole("button", {
					name: "Start export",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});

	it("renders running export progress and cancel action when cancellation is supported", () => {
		const onCancelExport = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={runningExport({
					cancelSupported: true,
					progress: {
						completedRatio: 0.42,
						phase: "encoding",
					},
				})}
				onCancelExport={onCancelExport}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Encoding")).toBeTruthy();
		expect(screen.getByText("export-job")).toBeTruthy();
		expect(screen.getByLabelText("Export progress")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: "Cancel export" }));
		expect(onCancelExport).toHaveBeenCalledTimes(1);
	});

	it("hides cancel action when a running export cannot stop safely", () => {
		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={runningExport({
					cancelSupported: false,
					progress: {
						phase: "preparing",
					},
				})}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Preparing")).toBeTruthy();
		expect(screen.queryByRole("button", { name: "Cancel export" })).toBeNull();
		expect(screen.getByText("Cancellation unavailable")).toBeTruthy();
	});

	it("renders generated media status and forwards explicit delivery action", () => {
		const onDownloadGeneratedMedia = vi.fn();

		render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{
					delivered: false,
					generatedMedia,
					job: exportJob({ cancelSupported: true }),
					status: "succeeded",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={onDownloadGeneratedMedia}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Export complete")).toBeTruthy();
		expect(screen.getByText("Ready to download")).toBeTruthy();
		expect(screen.getByText("recording-export.mp4")).toBeTruthy();
		expect(
			within(screen.getByLabelText("Generated media status")).getByRole(
				"button",
				{
					name: "Download export",
				},
			),
		).toBeTruthy();
		expect(screen.getByLabelText("Generated media status").className).toContain(
			"overflow-visible",
		);
		expect(
			screen.getByLabelText("Generated media filename").className,
		).toContain("whitespace-normal");
		expect(
			screen.getByLabelText("Generated media filename").className,
		).toContain("[overflow-wrap:anywhere]");
		expect(
			screen.getByLabelText("Generated media filename").className,
		).not.toContain("break-all");

		fireEvent.click(screen.getByRole("button", { name: "Download export" }));
		expect(onDownloadGeneratedMedia).toHaveBeenCalledWith(generatedMedia);
	});

	it("renders delivered, failed, and cancelled export states", () => {
		const { rerender } = render(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{
					delivered: true,
					generatedMedia,
					job: exportJob({ cancelSupported: true }),
					status: "succeeded",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Delivered")).toBeTruthy();

		rerender(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{
					job: exportJob({ cancelSupported: true }),
					message: "Default export failed.",
					status: "failed",
					technicalDetails: "Encoder rejected the source video.",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Default export failed.")).toBeTruthy();
		expect(screen.getByText("Technical details")).toBeTruthy();

		rerender(
			<ExportInspectorPanel
				asset={readyAsset}
				audioMix={defaultAudioMix}
				exportState={{
					job: exportJob({ cancelSupported: true }),
					status: "cancelled",
				}}
				onCancelExport={() => undefined}
				onDownloadGeneratedMedia={() => undefined}
				onApplyOutputSettings={() => undefined}
				onStartExport={() => undefined}
				outputSettings={defaultOutputSettings}
				runtime={supportedRuntime}
				selection={fullSelection}
			/>,
		);

		expect(screen.getByText("Export cancelled.")).toBeTruthy();
	});
});

const supportedRuntime = evaluateRuntimeSupport({
	fileApi: true,
	mediaSource: true,
	objectUrl: true,
	videoDecoder: true,
	videoEncoder: true,
});

const defaultOutputSettings =
	createDefaultOutputSettings() satisfies OutputSettings;

const readyAsset = {
	durationUs: 12_000_000,
	exportCapability: {
		profile: DEFAULT_OUTPUT_PROFILE,
		supported: true,
	},
	frameTiming: {
		fps: 30,
		frameDurationUs: 33_333,
		source: "known",
	},
	id: "asset-export",
	label: "recording.mp4",
	provenance: {
		fileName: "recording.mp4",
		mimeType: "video/mp4",
		sizeBytes: 4_718_592,
	},
	tracks: {
		audio: [
			{
				channels: 2,
				codec: "aac",
				id: "audio-main",
				kind: "audio",
				label: "Voice",
				language: "eng",
				sampleRate: 48_000,
			},
		],
		video: [
			{
				codec: "h264",
				height: 1080,
				id: "video-main",
				kind: "video",
				label: "Main",
				width: 1920,
			},
		],
	},
} satisfies ReadyMediaAsset;

const defaultAudioMix = createDefaultAudioMix(readyAsset);

const fullSelection = {
	endUs: 12_000_000,
	startUs: 0,
} satisfies Selection;

const invalidSelection = {
	endUs: 12_000_001,
	startUs: 1_000_000,
} satisfies Selection;

const generatedMedia = {
	assetId: "asset-export",
	createdAtMs: 1_717_171_717,
	fileName: "recording-export.mp4",
	id: "generated-export",
	mimeType: "video/mp4",
	profile: DEFAULT_OUTPUT_PROFILE,
	selection: fullSelection,
	sizeBytes: 123,
} satisfies GeneratedMedia;

function runningExport({
	cancelSupported,
	progress,
}: {
	cancelSupported: boolean;
	progress: ExportProgress;
}): Extract<ExportSessionState, { status: "running" }> {
	return {
		job: exportJob({ cancelSupported, progress }),
		status: "running",
	};
}

function exportJob({
	cancelSupported,
	progress = {
		phase: "preparing",
	},
}: {
	cancelSupported: boolean;
	progress?: ExportProgress;
}): Extract<ExportSessionState, { status: "running" }>["job"] {
	return {
		cancelSupported,
		id: "export-job",
		progress,
		snapshot: {
			asset: readyAsset,
			audioMix: createDefaultAudioMix(readyAsset),
			outputSettings: createDefaultOutputSettings(),
			review: {
				method: {
					key: "fast",
					label: "Whole file export",
				},
				plannedOutput: {
					audioCodec: "aac",
					container: "mp4",
					label: "MP4 / H.264 video / AAC audio",
					videoCodec: "h264",
				},
				precision: {
					key: "full-asset",
					label: "Whole file",
				},
				profile: DEFAULT_OUTPUT_PROFILE,
				reason:
					"The current selection covers the full asset, so export can use the default output profile without boundary trimming.",
				supported: true,
			},
			selection: fullSelection,
		},
	};
}
