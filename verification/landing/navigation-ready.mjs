// A committed URL/load event can precede pagereveal, native fragment focus,
// and the end of a cross-document view transition. Do not start the next
// navigation while the browser is still presenting the previous document.
export async function navigationReady(page) {
	await page.evaluate(async () => {
		await document.activeViewTransition?.finished;
	});
}
