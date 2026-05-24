import { CheckCircle, Loader2, Upload } from "lucide-react";
import { Progress } from "./progress";

type ProgressToastProps = {
	progress: number;
	message: string;
	isComplete?: boolean;
	speed?: number;
};

export const ProgressToast = ({
	progress,
	message,
	isComplete = false,
	speed,
}: ProgressToastProps) => {
	return (
		<div className="flex min-w-[300px] flex-col gap-3">
			<div className="flex items-center gap-2">
				{isComplete ? (
					<CheckCircle className="size-4 text-workbench-progress" />
				) : (
					<Upload className="size-4 text-primary" />
				)}
				<span className="text-sm font-medium">{message}</span>
			</div>

			<Progress
				value={Math.min(100, Math.max(0, progress))}
				className="w-full"
			/>

			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span>{Math.round(progress)}%</span>
				{speed && !isComplete && (
					<div className="flex items-center gap-1">
						<Loader2 className="size-3 animate-spin" />
						<span>{speed.toFixed(1)} MB/s</span>
					</div>
				)}
				{isComplete && (
					<span className="font-medium text-workbench-progress">Complete!</span>
				)}
			</div>
		</div>
	);
};
