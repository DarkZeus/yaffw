import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient();

export function getContext() {
	return {
		queryClient,
	};
}
