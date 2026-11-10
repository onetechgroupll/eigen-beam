import type { PublicSlide } from './decks';
import type { ReplayEvent, RoomStats } from './server/rooms';
import type { Locale } from './i18n';

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

export function conversionCta(context: ConversionCtaContext, locale: Locale = 'de'): ConversionCta {
	const de = locale === 'de';
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
			title: 'Präsentation beendet.',
			body: 'Kein PDF nötig: Sieh dir die Session im Replay noch einmal an.',
			primary: 'Replay ansehen',
			secondary: 'Eigenes Deck erstellen'
		};
	}
	if (context === 'share') {
		return {
			kicker: de ? 'NÄCHSTER SCHRITT' : 'NEXT STEP',
			title: de ? 'Dieses Deck kopieren, anpassen, live testen.' : 'Copy this deck, adapt it, and test it live.',
			body: de ? 'Aus einem geteilten Deck wird mit einem Klick dein eigener Live-Sync-Pitch.' : 'Turn a shared deck into your own live-sync pitch with one click.',
			primary: de ? 'Eigene Kopie starten' : 'Start your own copy'
		};
	}
	if (context === 'recap') {
		return {
			kicker: de ? 'NÄCHSTER SCHRITT' : 'NEXT STEP',
			title: de ? 'Aus dem Recap wird dein nächster Live-Sync-Test.' : 'Turn the recap into your next live-sync test.',
			body: de ? 'Kopiere das Deck, kürze es auf deinen Raum und starte es beim nächsten Termin direkt auf den Phones.' : 'Copy the deck, trim it for your room, and start it directly on phones at the next meeting.',
			primary: de ? 'Eigene Kopie starten' : 'Start your own copy'
		};
	}
	return {
		kicker: de ? 'WEITER NUTZEN' : 'KEEP USING IT',
		title: de ? 'Aus dem Replay wird dein eigenes Phone-Deck.' : 'Turn the replay into your own phone-native deck.',
		body: de ? 'Nimm die Struktur, mach sie zu deinem Pitch und teste Live-Sync im nächsten Termin.' : 'Use the structure for your pitch and test live sync at the next meeting.',
		primary: de ? 'Eigenes Deck bauen' : 'Build your own deck'
	};
}

export function pacingHint(slide: PublicSlide | undefined, locale: Locale = 'de'): PacingHint {
	const de = locale === 'de';
	if (!slide) {
		return { seconds: 0, tone: 'good', label: de ? 'Bereit' : 'Ready', detail: de ? 'Keine Folie ausgewählt.' : 'No slide selected.' };
	}
	const text = [slide.eyebrow, slide.headline, slide.body, slide.metric, slide.quote, slide.attribution, ...(slide.reveal ?? [])]
		.filter(Boolean)
		.join(' ');
	const words = text.trim().split(/\s+/).filter(Boolean).length;
	const seconds = Math.max(MIN_SECONDS, Math.round(words / WORDS_PER_SECOND) + (slide.reveal?.length ?? 0) * REVEAL_SECONDS);
	if (seconds <= 30) return { seconds, tone: 'tight', label: de ? 'Kurz halten' : 'Keep it short', detail: de ? 'Ein Gedanke, dann weiter.' : 'One thought, then move on.' };
	if (seconds <= 55) return { seconds, tone: 'good', label: de ? 'Gutes Tempo' : 'Good pace', detail: de ? 'Genug Kontext, ohne die Folie zu überladen.' : 'Enough context without overloading the slide.' };
	return { seconds, tone: 'dense', label: de ? 'Dicht' : 'Dense', detail: de ? 'Kürzen oder bewusst langsamer sprechen.' : 'Shorten it or speak deliberately more slowly.' };
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

export function liveSentimentLabel(points: SentimentPoint[], locale: Locale = 'de'): string {
	const de = locale === 'de';
	const total = points.reduce((sum, p) => sum + p.score, 0);
	const questions = points.reduce((sum, p) => sum + p.questions, 0);
	const positiveSignals = points.reduce((sum, p) => sum + p.reactions + p.bookmarks, 0);
	if (total >= 6) return de ? 'starkes Signal' : 'strong signal';
	if (total >= 2) return de ? 'gute Resonanz' : 'good response';
	if (questions >= 2 && questions >= positiveSignals) return de ? 'offene Fragen' : 'open questions';
	if (total <= -3) return de ? 'Klärungsbedarf' : 'needs clarification';
	return de ? 'ruhig' : 'quiet';
}

export function reopenInsight(stats: Pick<RoomStats, 'joins' | 'reopens'>, locale: Locale = 'de'): ReopenInsight {
	const de = locale === 'de';
	const joins = Math.max(0, stats.joins || 0);
	const reopens = Math.max(0, stats.reopens || 0);
	const rate = joins > 0 ? Math.round((reopens / joins) * 100) : 0;
	if (reopens === 0) return { rate: 0, label: de ? 'Erstkontakte' : 'First opens', detail: de ? 'Noch keine Wiederöffnungen.' : 'No reopens yet.', tone: 'quiet' };
	if (rate >= 50) return { rate, label: de ? 'Starker Rückgriff' : 'Strong return', detail: `${reopens} ${de ? 'Wiederöffnungen' : 'reopens'} · ${rate}% Re-Open-Rate.`, tone: 'hot' };
	return { rate, label: de ? 'Wieder geöffnet' : 'Reopened', detail: `${reopens} ${de ? 'Wiederöffnungen' : 'reopens'} · ${rate}% Re-Open-Rate.`, tone: 'returning' };
}
