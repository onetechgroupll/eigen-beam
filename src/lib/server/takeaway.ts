import type { PublicSlide } from '$lib/decks';
import type { ReplayEvent, ReplaySnapshot } from '$lib/server/rooms';
import { detectContentLocale, type Locale } from '$lib/i18n';

export type TakeawaySlide = {
	index: number;
	headline: string;
	body?: string;
	image?: string;
	signals: { bookmarks: number; reactions: number; questions: number };
};

export type Takeaway = {
	id: string;
	slideCount: number;
	bookmarkCount: number;
	slides: TakeawaySlide[];
	markdown: string;
};

export function buildTakeaway(replay: ReplaySnapshot): Takeaway {
	const selected = selectedSlideIndexes(replay.events, replay.slides.length);
	const slides = selected.map((index) => takeawaySlide(index, replay.slides[index] as PublicSlide, replay.events));
	const bookmarkCount = replay.events.filter((event) => event.type === 'bookmark').length;
	const markdown = takeawayMarkdown(replay.id, slides, bookmarkCount, detectContentLocale(replay.slides));
	return { id: replay.id, slideCount: replay.slides.length, bookmarkCount, slides, markdown };
}

export function takeawayMarkdown(roomId: string, slides: TakeawaySlide[], bookmarkCount: number, locale: Locale = 'de'): string {
	const de = locale === 'de';
	const lines = [`# Takeaway`, '', `Room: ${roomId}`, `${de ? 'Gemerkte Folien' : 'Saved slides'}: ${bookmarkCount}`, ''];
	if (slides.length === 0) {
		lines.push(de ? 'Noch keine gemerkten Folien.' : 'No saved slides yet.');
		return `${lines.join('\n')}\n`;
	}
	for (const slide of slides) {
		lines.push(`## ${slide.index + 1}. ${slide.headline}`);
		if (slide.body) lines.push('', slide.body);
		if (slide.image) lines.push('', `![${escapeMarkdownAlt(slide.headline)}](${slide.image})`);
		const signals = [
			slide.signals.bookmarks ? `${slide.signals.bookmarks}× ${de ? 'gemerkt' : 'saved'}` : '',
			slide.signals.reactions ? `${slide.signals.reactions}× ${de ? 'Reaktion' : 'reaction'}` : '',
			slide.signals.questions ? `${slide.signals.questions}× ${de ? 'Frage' : 'question'}` : ''
		].filter(Boolean).join(' · ');
		if (signals) lines.push('', `_${signals}_`);
		lines.push('');
	}
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function selectedSlideIndexes(events: ReplayEvent[], slideCount: number): number[] {
	const bookmarks = unique(events.filter((event) => event.type === 'bookmark').map((event) => event.slide), slideCount);
	if (bookmarks.length) return bookmarks;
	return unique(events.filter((event) => event.type === 'reaction' || event.type === 'question').map((event) => event.slide), slideCount).slice(0, 5);
}

function takeawaySlide(index: number, slide: PublicSlide, events: ReplayEvent[]): TakeawaySlide {
	return {
		index,
		headline: slide.headline,
		body: slide.body,
		image: slide.image,
		signals: {
			bookmarks: events.filter((event) => event.type === 'bookmark' && event.slide === index).length,
			reactions: events.filter((event) => event.type === 'reaction' && event.slide === index).length,
			questions: events.filter((event) => event.type === 'question' && event.slide === index).length
		}
	};
}

function unique(values: number[], slideCount: number): number[] {
	return [...new Set(values.filter((value) => Number.isInteger(value) && value >= 0 && value < slideCount))].sort((a, b) => a - b);
}

function escapeMarkdownAlt(value: string): string {
	return value.replace(/[\]\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
}
