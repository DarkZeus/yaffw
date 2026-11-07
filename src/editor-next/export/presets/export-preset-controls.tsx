import { Popover } from "@base-ui/react/popover";
import { Bookmark, ChevronUp, FolderOpen, Save, Trash2 } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	type ExportPresetOptions,
	type PresetConfirmation,
	useExportPresets,
} from "./use-export-presets";

export function ExportPresetControls(props: ExportPresetOptions) {
	const {
		canChoosePreset,
		canConfirm,
		canDelete,
		canLoad,
		canSave,
		canUpdate,
		changePresetName,
		confirmation,
		confirmPresetChange,
		dismissConfirmation,
		exportPresets,
		interaction,
		loadSelectedPreset,
		panelOpen,
		presetName,
		requestDelete,
		requestSave,
		requestUpdate,
		selectedPreset,
		selectPreset,
		togglePresetPanel,
	} = useExportPresets(props);
	const { exportRunning } = props;
	const id = useId();
	const triggerIds = {
		save: `${id}-save`,
		update: `${id}-update`,
		delete: `${id}-delete`,
	};
	const triggerId = confirmation
		? triggerIds[
				confirmation.kind === "delete" ? "delete" : confirmation.source
			]
		: null;

	function handleConfirmationOpenChange(
		open: boolean,
		{ trigger }: Popover.Root.ChangeEventDetails,
	) {
		if (!open) return dismissConfirmation();
		const requests = {
			[triggerIds.save]: requestSave,
			[triggerIds.update]: requestUpdate,
			[triggerIds.delete]: requestDelete,
		};
		requests[trigger?.id ?? ""]?.();
	}

	return (
		<div className="relative">
			<Button
				aria-expanded={panelOpen}
				aria-controls={panelOpen ? `${id}-panel` : undefined}
				className="h-10 w-full justify-start"
				disabled={exportRunning}
				onClick={togglePresetPanel}
				size="sm"
				type="button"
				variant="outline"
			>
				<Bookmark data-icon="inline-start" />
				<span className="min-w-0 flex-1 truncate text-left">
					{selectedPreset ? `Presets · ${selectedPreset.name}` : "Presets"}
				</span>
				<ChevronUp data-icon="inline-end" />
			</Button>
			{panelOpen ? (
				<Popover.Root
					open={confirmation !== null && !exportRunning}
					triggerId={triggerId}
					onOpenChange={handleConfirmationOpenChange}
				>
					<section
						aria-label="Export presets"
						id={`${id}-panel`}
						className="absolute bottom-11 left-0 z-20 grid max-h-[calc(100dvh-14rem)] w-[min(28rem,calc(100vw-5rem))] gap-2.5 overflow-y-auto rounded border border-workbench-border-strong bg-workbench-inspector p-3 shadow-none"
					>
						<div>
							<div className="text-xs font-semibold text-foreground">
								Export presets
							</div>
							<p className="mt-1 text-[11px] leading-4 text-muted-foreground">
								Saved in this browser. Apply to use loaded settings.
							</p>
						</div>
						<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
							<label className="grid gap-1.5 text-xs font-medium text-foreground">
								<span>Saved preset</span>
								<select
									aria-label="Saved Export preset"
									className="h-8 min-w-0 rounded border border-workbench-border bg-workbench-hover/35 px-2 text-sm text-foreground outline-none focus:border-workbench-focus focus:ring-2 focus:ring-workbench-focus/25"
									disabled={!canChoosePreset}
									onChange={(event) => selectPreset(event.currentTarget.value)}
									value={selectedPreset?.name ?? ""}
								>
									<option value="">
										{exportPresets.length === 0
											? "No saved presets"
											: "Choose a preset"}
									</option>
									{exportPresets.map((preset) => (
										<option key={preset.name} value={preset.name}>
											{preset.name}
										</option>
									))}
								</select>
							</label>
							<div className="flex items-end gap-1.5">
								<Button
									disabled={!canLoad}
									onClick={loadSelectedPreset}
									size="sm"
									type="button"
									variant="outline"
								>
									<FolderOpen data-icon="inline-start" />
									Load
								</Button>
								<Popover.Trigger
									disabled={!canUpdate}
									id={triggerIds.update}
									render={
										<Button size="sm" variant="outline">
											Update
										</Button>
									}
								/>
								<Popover.Trigger
									disabled={!canDelete}
									id={triggerIds.delete}
									render={
										<Button
											aria-label="Delete selected Export preset"
											size="icon"
											variant="outline"
										>
											<Trash2 />
										</Button>
									}
								/>
							</div>
						</div>
						<div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
							<label
								className="grid gap-1.5 text-xs font-medium text-foreground"
								htmlFor="export-preset-name"
							>
								<span>Preset name</span>
								<Input
									aria-label="Export preset name"
									disabled={exportRunning}
									id="export-preset-name"
									onChange={(event) =>
										changePresetName(event.currentTarget.value)
									}
									placeholder="e.g. Web sharing"
									value={presetName}
								/>
							</label>
							<Popover.Trigger
								disabled={!canSave}
								id={triggerIds.save}
								render={
									<Button className="self-end" size="sm" variant="outline">
										<Save data-icon="inline-start" />
										Save preset
									</Button>
								}
							/>
						</div>
						{interaction?.kind === "error" ? (
							<p className="text-xs text-destructive" role="alert">
								{interaction.message}
							</p>
						) : null}
						{interaction?.kind === "success" ? (
							<output className="text-xs text-muted-foreground">
								{interaction.message}
							</output>
						) : null}
					</section>
					<PresetConfirmationPopover
						confirmation={confirmation}
						disabled={!canConfirm}
						onConfirm={confirmPresetChange}
					/>
				</Popover.Root>
			) : null}
		</div>
	);
}

function PresetConfirmationPopover({
	confirmation,
	disabled,
	onConfirm,
}: {
	confirmation: PresetConfirmation | null;
	disabled: boolean;
	onConfirm: () => void;
}) {
	const isDeleting = confirmation?.kind === "delete";

	return (
		<Popover.Portal>
			<Popover.Positioner
				align="end"
				className="workbench dark z-[60]"
				side="top"
				sideOffset={6}
			>
				<Popover.Popup className="w-72 max-w-[calc(100vw-2rem)] rounded border border-workbench-border-strong bg-workbench-inspector p-3 shadow-xl">
					<Popover.Title className="text-xs font-semibold text-foreground">
						{isDeleting ? "Delete Export preset" : "Overwrite Export preset"}
					</Popover.Title>
					<Popover.Description className="mt-1 text-xs leading-5 wrap-anywhere text-foreground">
						{confirmation &&
							(isDeleting
								? `Delete ${confirmation.name}? This cannot be undone.`
								: `Replace the saved settings for ${confirmation.name}?`)}
					</Popover.Description>
					<div className="mt-2 flex justify-end gap-2">
						<Popover.Close
							render={
								<Button size="sm" variant="outline">
									Cancel
								</Button>
							}
						/>
						<Button
							disabled={disabled}
							onClick={onConfirm}
							size="sm"
							type="button"
							variant={isDeleting ? "destructive" : "default"}
						>
							{isDeleting ? "Delete" : "Overwrite"}
						</Button>
					</div>
				</Popover.Popup>
			</Popover.Positioner>
		</Popover.Portal>
	);
}
