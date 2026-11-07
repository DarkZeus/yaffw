import { useRef, useState } from "react";
import type {
	AudioMix,
	OutputQualitySetting,
	OutputSettings,
	ReadyMediaAsset,
} from "@/editor-core/model";
import {
	OUTPUT_SUBJECTIVE_QUALITY_CHOICES,
	cloneOutputSettings,
	getOutputResolutionChoices,
	resolveOutputAudioProfile,
	resolveOutputPlan,
	resolveOutputVideoProfile,
} from "@/editor-core/output-settings";
import { MEDIABUNNY_OUTPUT_SUPPORT } from "../adapters/mediabunny-output-support";
import {
	type ExportPreset,
	saveLastUsedSettings,
} from "../presets/export-preset-store";

type OutputSettingsTransaction = {
	opening: OutputSettings;
	draft: OutputSettings;
	automaticReplacementMessage: string | null;
};

export function useOutputSettingsDraft({
	asset,
	audioMix,
	exportRunning,
	onApplyOutputSettings,
	outputSettings,
}: {
	asset: ReadyMediaAsset;
	audioMix: AudioMix;
	exportRunning: boolean;
	onApplyOutputSettings: (outputSettings: OutputSettings) => boolean;
	outputSettings: OutputSettings;
}) {
	const [transaction, setTransaction] =
		useState<OutputSettingsTransaction | null>(null);
	const transactionRef = useRef<OutputSettingsTransaction | null>(null);
	const applying = useRef(false);
	const activeDraft = transaction?.draft ?? outputSettings;
	const resolutionChoices = getOutputResolutionChoices(asset);
	const plan = validateDraft(activeDraft);

	function publish(next: OutputSettingsTransaction | null) {
		transactionRef.current = next;
		setTransaction(next);
	}

	function openModal() {
		if (exportRunning || transactionRef.current) return;
		const opening = cloneOutputSettings(outputSettings);
		publish({ opening, draft: opening, automaticReplacementMessage: null });
	}

	function closeModal() {
		publish(null);
	}

	function resetDraft() {
		const current = transactionRef.current;
		if (current) replaceDraft(current.opening, null);
	}

	function replaceDraft(draft: OutputSettings, message?: string | null) {
		const current = transactionRef.current;
		if (!current) return;
		publish({
			...current,
			draft,
			automaticReplacementMessage:
				message === undefined ? current.automaticReplacementMessage : message,
		});
	}

	function copyDraft() {
		const current = transactionRef.current;
		return current && cloneOutputSettings(current.draft);
	}

	function validateDraft(draft: OutputSettings) {
		return resolveOutputPlan({
			asset,
			audioMix,
			outputSettings: draft,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		});
	}

	function applyDraft() {
		const current = transactionRef.current;
		if (
			!current ||
			exportRunning ||
			applying.current ||
			validateDraft(current.draft).kind === "invalid"
		)
			return;

		const draft = cloneOutputSettings(current.draft);
		applying.current = true;
		try {
			if (!onApplyOutputSettings(draft)) return;
			closeModal();
			try {
				saveLastUsedSettings(window.localStorage, draft);
			} catch {
				// Browser-local preset storage is optional for an accepted session change.
			}
		} finally {
			applying.current = false;
		}
	}

	function loadPreset(preset: ExportPreset) {
		setReconciledDraft(cloneOutputSettings(preset.outputSettings));
	}

	function changeContainer(containerId: string) {
		const nextDraft = copyDraft();
		if (!nextDraft) return;
		nextDraft.container =
			containerId === "default-output-profile"
				? { kind: "default-output-profile" }
				: { container: containerId, kind: "documented-container" };

		if (nextDraft.videoCodec.kind === "default-output-profile") {
			nextDraft.videoCodec = { kind: "preserve-source" };
		}
		if (nextDraft.audioCodec.kind === "default-output-profile") {
			nextDraft.audioCodec = { kind: "preserve-source" };
		}

		setReconciledDraft(nextDraft);
	}

	function changeVideoCodec(codec: string) {
		const nextDraft = copyDraft();
		if (!nextDraft) return;
		nextDraft.videoCodec =
			codec === "default-output-profile"
				? { kind: "default-output-profile" }
				: codec === "preserve-source"
					? { kind: "preserve-source" }
					: { codec, kind: "documented-codec" };

		setReconciledDraft(nextDraft);
	}

	function changeAudioCodec(codec: string) {
		const nextDraft = copyDraft();
		if (!nextDraft) return;
		nextDraft.audioCodec =
			codec === "no-audio"
				? { kind: "no-audio" }
				: codec === "default-output-profile"
					? { kind: "default-output-profile" }
					: codec === "preserve-source"
						? { kind: "preserve-source" }
						: { codec, kind: "documented-codec" };

		setReconciledDraft(nextDraft);
	}

	function changeResolution(value: string) {
		const choice = resolutionChoices.find(
			({ setting }) => resolutionSettingValue(setting) === value,
		);
		if (!choice) {
			return;
		}

		const nextDraft = copyDraft();
		if (!nextDraft) return;
		nextDraft.resolution = { ...choice.setting };
		replaceDraft(nextDraft);
	}

	function changeQuality(mediaKind: "audio" | "video", value: string) {
		const nextDraft = copyDraft();
		if (!nextDraft) return;
		const currentSetting =
			mediaKind === "video" ? nextDraft.videoQuality : nextDraft.audioQuality;
		let nextSetting: OutputQualitySetting;
		if (value === "preserve-source") {
			nextSetting = { kind: "preserve-source" };
		} else if (value === "custom-bitrate") {
			nextSetting = {
				bitrateBps:
					currentSetting.kind === "custom-bitrate"
						? currentSetting.bitrateBps
						: mediaKind === "video"
							? 5_000_000
							: 192_000,
				kind: "custom-bitrate",
			};
		} else {
			const quality = OUTPUT_SUBJECTIVE_QUALITY_CHOICES.find(
				(choice) => choice.value === value,
			)?.value;
			if (!quality) {
				return;
			}
			nextSetting = { kind: "subjective-quality", quality };
		}

		if (mediaKind === "video") {
			nextDraft.videoQuality = nextSetting;
		} else {
			nextDraft.audioQuality = nextSetting;
		}
		replaceDraft(nextDraft);
	}

	function changeCustomBitrate(
		mediaKind: "audio" | "video",
		bitrateBps: number,
	) {
		const nextDraft = copyDraft();
		if (!nextDraft) return;
		const nextSetting: OutputQualitySetting = {
			bitrateBps,
			kind: "custom-bitrate",
		};
		if (mediaKind === "video") {
			nextDraft.videoQuality = nextSetting;
		} else {
			nextDraft.audioQuality = nextSetting;
		}
		replaceDraft(nextDraft);
	}

	function setReconciledDraft(nextDraft: OutputSettings) {
		const videoProfile = resolveOutputVideoProfile({
			asset,
			outputSettings: nextDraft,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		});

		const audioProfile = resolveOutputAudioProfile({
			asset,
			audioMix,
			outputSettings: nextDraft,
			support: MEDIABUNNY_OUTPUT_SUPPORT,
		});
		const replacementMessages: string[] = [];

		if (videoProfile.kind === "resolved" && videoProfile.automaticReplacement) {
			nextDraft.videoCodec = {
				codec: videoProfile.videoCodec,
				kind: "documented-codec",
			};
			replacementMessages.push(
				`${formatCodecName(videoProfile.automaticReplacement.requestedCodec)} cannot be preserved in ${videoProfile.container.label}. ${formatCodecName(videoProfile.videoCodec)} was selected automatically.`,
			);
		}
		if (audioProfile.kind === "resolved" && audioProfile.automaticReplacement) {
			nextDraft.audioCodec = {
				codec: audioProfile.automaticReplacement.audioCodec,
				kind: "documented-codec",
			};
			replacementMessages.push(
				`${formatCodecName(audioProfile.automaticReplacement.requestedCodec)} cannot be preserved in ${audioProfile.container.label}. ${formatCodecName(audioProfile.audioCodec)} was selected automatically.`,
			);
		}
		replaceDraft(nextDraft, replacementMessages.join(" ") || null);
	}
	return {
		activeDraft,
		applyDraft,
		automaticReplacementMessage:
			transaction?.automaticReplacementMessage ?? null,
		changeAudioCodec,
		changeContainer,
		changeCustomBitrate,
		changeQuality,
		changeResolution,
		changeVideoCodec,
		closeModal,
		draftIsValid: plan.kind === "resolved",
		loadPreset,
		open: transaction !== null,
		openModal,
		resetDraft,
		resolutionChoices,
		validationError: plan.kind === "invalid" ? plan.error : undefined,
	};
}

export function formatCodecName(codec: string | undefined): string {
	if (!codec) {
		return "Unknown source codec";
	}

	const normalized = codec.toLowerCase();
	if (normalized === "avc" || normalized === "h264") {
		return "AVC";
	}
	if (normalized === "hevc" || normalized === "h265") {
		return "HEVC";
	}

	return normalized.toUpperCase();
}

export function resolutionSettingValue(
	setting: OutputSettings["resolution"],
): string {
	return setting.kind === "target-dimensions"
		? `${setting.width}x${setting.height}`
		: setting.kind;
}
