import type { Locale } from './i18n';

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

export function presenterFeedItem(event: PresenterFeedSource, locale: Locale = 'de'): PresenterFeedItem {
	const de = locale === 'de';
	const slideLabel = `F${Math.max(0, event.slide) + 1}`;
	if (event.type === 'question') {
		return {
			kind: 'question',
			label: de ? 'Frage' : 'Question',
			text: `${slideLabel} · ${(event.text ?? '').trim().slice(0, 180) || (de ? 'Frage gestellt' : 'Question asked')}`,
			slide: event.slide,
			ts: event.ts
		};
	}
	if (event.type === 'bookmark') {
		return { kind: 'bookmark', label: de ? 'Merker' : 'Save', text: `${slideLabel} ${de ? 'wurde gemerkt' : 'was saved'}`, slide: event.slide, ts: event.ts };
	}
	return {
		kind: 'reaction',
		label: de ? 'Reaktion' : 'Reaction',
		text: `${slideLabel} · ${event.reaction || '👍'}`,
		slide: event.slide,
		ts: event.ts
	};
}
