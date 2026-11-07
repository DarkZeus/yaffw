import { type RefObject, useCallback, useLayoutEffect, useRef } from "react";

export function useWorkspacePointer(
	elementRef: RefObject<HTMLDivElement | null>,
	enabled: boolean,
) {
	const pointerId = useRef<number | null>(null);
	useLayoutEffect(() => {
		const element = elementRef.current;
		if (!enabled || !element) return;
		const { ownerDocument } = element;
		const ownerWindow = ownerDocument.defaultView;
		function trackPointer(event: PointerEvent) {
			if (event.button !== 0 || !(event.target instanceof Element)) return;
			if (
				event.target.closest("[data-tabset-header], [data-separator]") ||
				(event.altKey && event.target.closest("[data-workbench-panel]"))
			) {
				pointerId.current = event.pointerId;
			}
		}
		function releasePointer(event: PointerEvent) {
			if (pointerId.current === event.pointerId) clearPointer();
		}
		function clearPointer() {
			pointerId.current = null;
		}
		element.addEventListener("pointerdown", trackPointer, true);
		ownerDocument.addEventListener("pointerup", releasePointer, true);
		ownerDocument.addEventListener("pointercancel", releasePointer, true);
		ownerWindow?.addEventListener("blur", clearPointer);
		return () => {
			element.removeEventListener("pointerdown", trackPointer, true);
			ownerDocument.removeEventListener("pointerup", releasePointer, true);
			ownerDocument.removeEventListener("pointercancel", releasePointer, true);
			ownerWindow?.removeEventListener("blur", clearPointer);
		};
	}, [elementRef, enabled]);

	return useCallback(() => {
		const id = pointerId.current;
		if (id === null) return;
		pointerId.current = null;
		// Workspace's disabled prop prevents new drags. Its current pointer
		// gesture still needs a cancellation before the tabsets are replaced.
		elementRef.current?.ownerDocument.dispatchEvent(
			new PointerEvent("pointercancel", { pointerId: id }),
		);
	}, [elementRef]);
}
