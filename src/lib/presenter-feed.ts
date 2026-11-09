export type PresenterFeedSource =
	| { type: 'reaction'; reaction?: string; slide: number; ts: number }
	| { type: 'question'; text?: string; slide: number; ts: number }
	| { type: 'bookmark'; slide: number; ts: number };

export type PresenterFeedItem = {
	kind: 'reaction' | 'question' | 'bookmark';
	label: string;
	text: string;
	slide: number;
	ts: number;
};

export function presenterFeedItem(event: PresenterFeedSource): PresenterFeedItem {
	const slideLabel = `F${Math.max(0, event.slide) + 1}`;
	if (event.type === 'question') {
		return {
			kind: 'question',
			label: 'Frage',
			text: `${slideLabel} · ${(event.text ?? '').trim().slice(0, 180) || 'Frage gestellt'}`,
			slide: event.slide,
			ts: event.ts
		};
	}
	if (event.type === 'bookmark') {
		return { kind: 'bookmark', label: 'Merker', text: `${slideLabel} wurde gemerkt`, slide: event.slide, ts: event.ts };
	}
	return {
		kind: 'reaction',
		label: 'Reaktion',
		text: `${slideLabel} · ${event.reaction || '👍'}`,
		slide: event.slide,
		ts: event.ts
	};
}
