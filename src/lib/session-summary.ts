import type { PublicSlide } from './decks';
import type { ReplayEvent, ReplaySnapshot, RoomStats } from './server/rooms';
import { detectContentLocale, type Locale } from './i18n';

export type SessionSummarySlide = {
	index: number;
	label: string;
	headline: string;
	score: number;
	reactions: number;
	questions: number;
	bookmarks: number;
};

export type SessionSummaryQuestionGroup = {
	slide: number;
	label: string;
	headline: string;
	count: number;
};

export type SessionSummary = {
	id: string;
	totals: RoomStats & { durationMinutes: number; engagements: number; reopenRate: number };
	topSlides: SessionSummarySlide[];
	questionsBySlide: SessionSummaryQuestionGroup[];
	whatLanded: string[];
	clarifyNext: string[];
	markdown: string;
};

export function buildSessionSummary(replay: ReplaySnapshot, now = Date.now()): SessionSummary {
	const locale = detectContentLocale(replay.slides);
	const durationMinutes = sessionDurationMinutes(replay, now);
	const engagements = replay.stats.reactions + replay.stats.questions + replay.stats.bookmarks;
	const reopenRate = replay.stats.joins > 0 ? Math.round((replay.stats.reopens / replay.stats.joins) * 100) : 0;
	const topSlides = slideSummaries(replay.slides as PublicSlide[], replay.events).filter((slide) => slide.score > 0).slice(0, 5);
	const questionsBySlide = questionGroups(replay.slides as PublicSlide[], replay.events);
	const whatLanded = topSlides.length
		? topSlides.slice(0, 3).map((slide) => locale === 'de' ? `${slide.label} „${slide.headline}“ hatte die stärkste Resonanz (${signalText(slide, locale)}).` : `${slide.label} “${slide.headline}” had the strongest response (${signalText(slide, locale)}).`)
		: [locale === 'de' ? 'Noch keine klaren Resonanz-Signale — beim nächsten Test bewusst Reaktionen/Merker beobachten.' : 'No clear response signals yet — watch reactions and saves deliberately in the next test.'];
	const clarifyNext = questionsBySlide.length
		? questionsBySlide.slice(0, 3).map((group) => locale === 'de' ? `${group.label} „${group.headline}“ bekam ${group.count} Frage${group.count === 1 ? '' : 'n'} — dort beim nächsten Mal früher Kontext geben.` : `${group.label} “${group.headline}” received ${group.count} question${group.count === 1 ? '' : 's'} — add context earlier next time.`)
		: [locale === 'de' ? 'Keine Fragen im Rückkanal — die Story war entweder klar oder der Raum hat noch nicht aktiv gefragt.' : 'No audience questions — the story was either clear or the room did not ask actively yet.'];
	const totals = { ...replay.stats, durationMinutes, engagements, reopenRate };
	const summaryWithoutMarkdown = { id: replay.id, totals, topSlides, questionsBySlide, whatLanded, clarifyNext };
	return { ...summaryWithoutMarkdown, markdown: sessionSummaryMarkdown(summaryWithoutMarkdown, locale) };
}


export function sessionSummaryMarkdown(summary: Omit<SessionSummary, 'markdown'>, locale: Locale = 'de'): string {
	const de = locale === 'de';
	const lines = [
		de ? '# Session-Zusammenfassung' : '# Session Summary',
		'',
		`${de ? 'Raum' : 'Room'}: ${summary.id}`,
		`${de ? 'Dauer' : 'Duration'}: ${summary.totals.durationMinutes} min`,
		`Joins: ${summary.totals.joins} · Peak: ${summary.totals.peakConcurrent} · Re-Opens: ${summary.totals.reopens} (${summary.totals.reopenRate}%)`,
		`${de ? 'Signale' : 'Signals'}: ${summary.totals.engagements} · ${de ? 'Reaktionen' : 'Reactions'}: ${summary.totals.reactions} · ${de ? 'Fragen' : 'Questions'}: ${summary.totals.questions} · ${de ? 'Merker' : 'Saves'}: ${summary.totals.bookmarks}`,
		'',
		de ? '## Was gelandet ist' : '## What landed'
	];
	for (const line of summary.whatLanded) lines.push(`- ${line}`);
	lines.push('', de ? '## Was du nächstes Mal klären solltest' : '## What to clarify next time');
	for (const line of summary.clarifyNext) lines.push(`- ${line}`);
	lines.push('', de ? '## Top-Folien' : '## Top slides');
	if (summary.topSlides.length === 0) {
		lines.push(de ? '- Noch keine Top-Folie mit Signalen.' : '- No top slide with signals yet.');
	} else {
		for (const slide of summary.topSlides) lines.push(`- ${slide.label} “${slide.headline}” — Score ${slide.score} (${signalText(slide, locale)})`);
	}
	if (summary.questionsBySlide.length) {
		lines.push('', de ? '## Fragen nach Folie' : '## Questions by slide');
		for (const group of summary.questionsBySlide) lines.push(`- ${group.label} “${group.headline}” — ${group.count} ${de ? `Frage${group.count === 1 ? '' : 'n'}` : `question${group.count === 1 ? '' : 's'}`}`);
	}
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function slideSummaries(slides: PublicSlide[], events: ReplayEvent[]): SessionSummarySlide[] {
	return slides.map((slide, index) => {
		const reactions = events.filter((event) => event.type === 'reaction' && event.slide === index).length;
		const questions = events.filter((event) => event.type === 'question' && event.slide === index).length;
		const bookmarks = events.filter((event) => event.type === 'bookmark' && event.slide === index).length;
		return {
			index,
			label: `F${index + 1}`,
			headline: slide?.headline ?? `Folie ${index + 1}`,
			score: reactions + questions + bookmarks * 2,
			reactions,
			questions,
			bookmarks
		};
	}).sort((a, b) => b.score - a.score || a.index - b.index);
}

function questionGroups(slides: PublicSlide[], events: ReplayEvent[]): SessionSummaryQuestionGroup[] {
	const counts = new Map<number, number>();
	for (const event of events) if (event.type === 'question') counts.set(event.slide, (counts.get(event.slide) ?? 0) + 1);
	return [...counts.entries()]
		.filter(([slide]) => Number.isInteger(slide) && slide >= 0 && slide < slides.length)
		.sort((a, b) => b[1] - a[1] || a[0] - b[0])
		.map(([slide, count]) => ({ slide, label: `F${slide + 1}`, headline: slides[slide]?.headline ?? `Folie ${slide + 1}`, count }));
}

function sessionDurationMinutes(replay: ReplaySnapshot, now: number): number {
	const start = replay.stats.startedAt || replay.events[0]?.ts || now;
	const endEvent = [...replay.events].reverse().find((event) => event.type === 'end') ?? replay.events[replay.events.length - 1];
	const end = endEvent?.ts ?? now;
	return Math.max(0, Math.round((end - start) / 60_000));
}

function signalText(slide: Pick<SessionSummarySlide, 'reactions' | 'questions' | 'bookmarks'>, locale: Locale): string {
	const de = locale === 'de';
	return [
		slide.reactions ? `${slide.reactions}× ${de ? 'Reaktion' : 'reaction'}` : '',
		slide.questions ? `${slide.questions}× ${de ? 'Frage' : 'question'}` : '',
		slide.bookmarks ? `${slide.bookmarks}× ${de ? 'Merker' : 'save'}` : ''
	].filter(Boolean).join(' · ') || (de ? 'keine Einzelsignale' : 'no individual signals');
}
