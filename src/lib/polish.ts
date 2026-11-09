import type { PublicSlide } from './decks';
import type { ReplayEvent, RoomStats } from './server/rooms';

export type PacingHint = {
	seconds: number;
	tone: 'tight' | 'good' | 'dense';
	label: string;
	detail: string;
};

export type SentimentPoint = {
	label: string;
	score: number;
	reactions: number;
	questions: number;
	bookmarks: number;
};

export type ConversionCtaContext = 'home' | 'viewer-ended' | 'recap' | 'replay' | 'share';

export type ConversionCta = {
	kicker: string;
	title: string;
	body: string;
	primary: string;
	secondary?: string;
};

export type ReopenInsight = {
	rate: number;
	label: string;
	detail: string;
	tone: 'quiet' | 'returning' | 'hot';
};

const WORDS_PER_SECOND = 2.4;
const MIN_SECONDS = 18;
const REVEAL_SECONDS = 5;
const QUESTION_WEIGHT = -1;
const BOOKMARK_WEIGHT = 2;
const REACTION_WEIGHT = 1;

export function conversionCta(context: ConversionCtaContext): ConversionCta {
	if (context === 'home') {
		return {
			kicker: 'EIGEN.BEAM',
			title: 'Dein Beamer. In jeder Hosentasche.',
			body: 'Starte eine Live-Sync-Session in Sekunden: Du führst, alle Phones folgen — ohne Beamer, App oder PDF-Chaos.',
			primary: 'Live-Sync testen',
			secondary: 'Deck vorbereiten'
		};
	}
	if (context === 'viewer-ended') {
		return {
			kicker: 'SESSION BEENDET',
			title: 'Das war kein PDF. Das war live synchron.',
			body: 'Kein PDF zum Nachschicken: Sieh dir die Session nochmal an oder bau direkt dein eigenes Phone-Deck für den nächsten Raum ohne Beamer.',
			primary: 'Replay ansehen',
			secondary: 'Eigenes Deck bauen'
		};
	}
	if (context === 'share') {
		return {
			kicker: 'NÄCHSTER SCHRITT',
			title: 'Dieses Deck kopieren, anpassen, live testen.',
			body: 'Aus einem geteilten Deck wird mit einem Klick dein eigener Live-Sync-Pitch.',
			primary: 'Eigene Kopie starten'
		};
	}
	if (context === 'recap') {
		return {
			kicker: 'NÄCHSTER SCHRITT',
			title: 'Aus dem Recap wird dein nächster Live-Sync-Test.',
			body: 'Kopiere das Deck, kürze es auf deinen Raum und starte es beim nächsten Termin direkt auf den Phones.',
			primary: 'Eigene Kopie starten'
		};
	}
	return {
		kicker: 'WEITER NUTZEN',
		title: 'Aus dem Replay wird dein eigenes Phone-Deck.',
		body: 'Nimm die Struktur, mach sie zu deinem Pitch und teste Live-Sync im nächsten Termin.',
		primary: 'Eigenes Deck bauen'
	};
}

export function pacingHint(slide: PublicSlide | undefined): PacingHint {
	if (!slide) {
		return { seconds: 0, tone: 'good', label: 'Bereit', detail: 'Keine Folie ausgewählt.' };
	}
	const text = [slide.eyebrow, slide.headline, slide.body, slide.metric, slide.quote, slide.attribution, ...(slide.reveal ?? [])]
		.filter(Boolean)
		.join(' ');
	const words = text.trim().split(/\s+/).filter(Boolean).length;
	const seconds = Math.max(MIN_SECONDS, Math.round(words / WORDS_PER_SECOND) + (slide.reveal?.length ?? 0) * REVEAL_SECONDS);
	if (seconds <= 30) return { seconds, tone: 'tight', label: 'Kurz halten', detail: 'Ein Gedanke, dann weiter.' };
	if (seconds <= 55) return { seconds, tone: 'good', label: 'Gutes Tempo', detail: 'Genug Kontext, ohne die Folie zu überladen.' };
	return { seconds, tone: 'dense', label: 'Dicht', detail: 'Kürzen oder bewusst langsamer sprechen.' };
}

export function replaySentiment(events: ReplayEvent[], slideCount: number): SentimentPoint[] {
	const count = Math.max(1, slideCount);
	let points: SentimentPoint[] = Array.from({ length: count }, (_, i) => ({
		label: `${i + 1}`,
		score: 0,
		reactions: 0,
		questions: 0,
		bookmarks: 0
	}));
	for (const event of events) {
		points = applySentimentSignal(points, event.slide ?? 0, event.type);
	}
	return points;
}

export function sentimentEventWeight(type: ReplayEvent['type']): number {
	if (type === 'reaction') return REACTION_WEIGHT;
	if (type === 'bookmark') return BOOKMARK_WEIGHT;
	if (type === 'question') return QUESTION_WEIGHT;
	return 0;
}

export function applySentimentSignal(points: SentimentPoint[], slide: number, type: ReplayEvent['type']): SentimentPoint[] {
	if (points.length === 0) return points;
	const index = Math.max(0, Math.min(points.length - 1, Math.floor(slide || 0)));
	return points.map((point, i) => {
		if (i !== index) return point;
		return {
			...point,
			score: point.score + sentimentEventWeight(type),
			reactions: point.reactions + (type === 'reaction' ? 1 : 0),
			questions: point.questions + (type === 'question' ? 1 : 0),
			bookmarks: point.bookmarks + (type === 'bookmark' ? 1 : 0)
		};
	});
}

export function liveSentimentLabel(points: SentimentPoint[]): string {
	const total = points.reduce((sum, p) => sum + p.score, 0);
	const questions = points.reduce((sum, p) => sum + p.questions, 0);
	const positiveSignals = points.reduce((sum, p) => sum + p.reactions + p.bookmarks, 0);
	if (total >= 6) return 'starkes Signal';
	if (total >= 2) return 'gute Resonanz';
	if (questions >= 2 && questions >= positiveSignals) return 'offene Fragen';
	if (total <= -3) return 'Klärungsbedarf';
	return 'ruhig';
}

export function reopenInsight(stats: Pick<RoomStats, 'joins' | 'reopens'>): ReopenInsight {
	const joins = Math.max(0, stats.joins || 0);
	const reopens = Math.max(0, stats.reopens || 0);
	const rate = joins > 0 ? Math.round((reopens / joins) * 100) : 0;
	if (reopens === 0) return { rate: 0, label: 'Erstkontakte', detail: 'Noch keine Wiederöffnungen.', tone: 'quiet' };
	if (rate >= 50) return { rate, label: 'Starker Rückgriff', detail: `${reopens} Wiederöffnungen · ${rate}% Re-Open-Rate.`, tone: 'hot' };
	return { rate, label: 'Wieder geöffnet', detail: `${reopens} Wiederöffnungen · ${rate}% Re-Open-Rate.`, tone: 'returning' };
}
