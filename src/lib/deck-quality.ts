import { parseDeck } from './deck-parse';
import type { Slide } from './decks';

export type DeckReadyStatus = 'live_ready' | 'almost_ready' | 'needs_work';
export type DeckQualityIssueKind =
	| 'empty_deck'
	| 'too_many_slides'
	| 'too_few_slides'
	| 'headline_long'
	| 'body_dense'
	| 'slide_empty'
	| 'missing_cta'
	| 'reveal_missing'
	| 'desktop_suspect';
export type DeckQualityFix = 'shorten' | 'suggest_reveal' | 'add_cta';

export type DeckQualityIssue = {
	kind: DeckQualityIssueKind;
	severity: 'warn' | 'fix';
	message: string;
	slideIndex?: number;
};

export type DeckReadyCheck = {
	status: DeckReadyStatus;
	label: 'Live-ready' | 'Fast live-ready' | 'Needs work';
	summary: string;
	metrics: {
		slideCount: number;
		denseSlides: number;
		longHeadlines: number;
		revealSlides: number;
	};
	issues: DeckQualityIssue[];
	suggestedFixes: DeckQualityFix[];
};

const CTA_RE = /(nächster schritt|next step|cta|call to action|entscheidung|kontakt|demo|starten|loslegen|jetzt)/i;
const DESKTOP_RE = /(agenda|appendix|backup|roadmap|q[1-4]|quartal|chart|diagramm|tabelle|matrix|excel|dashboard)/i;

export function deckReadyCheck(slides: Slide[]): DeckReadyCheck {
	const issues: DeckQualityIssue[] = [];
	const denseSlideIndexes = new Set<number>();
	const longHeadlineIndexes = new Set<number>();
	let revealSlides = 0;

	if (slides.length === 0) {
		issues.push({ kind: 'empty_deck', severity: 'fix', message: 'Noch keine Folien erkannt.' });
	}
	if (slides.length > 15) issues.push({ kind: 'too_many_slides', severity: 'fix', message: `${slides.length} Folien — für eine Phone-Session auf höchstens 15 kürzen.` });
	if (slides.length > 0 && slides.length < 3) issues.push({ kind: 'too_few_slides', severity: 'warn', message: 'Sehr kurz — prüfe, ob Hook, Proof und nächster Schritt klar sind.' });

	slides.forEach((slide, index) => {
		const headline = slide.headline?.trim() ?? '';
		const body = slide.body?.trim() ?? '';
		const text = [headline, body, slide.eyebrow, slide.metric, slide.quote].filter(Boolean).join(' ');
		if (!headline || (headline.length < 3 && !body && !slide.image)) {
			issues.push({ kind: 'slide_empty', severity: 'fix', slideIndex: index, message: `F${index + 1}: fast leer — eine klare Headline setzen.` });
		}
		if (headline.length > 68) {
			longHeadlineIndexes.add(index);
			issues.push({ kind: 'headline_long', severity: 'fix', slideIndex: index, message: `F${index + 1}: Headline zu lang für Phones.` });
		}
		if (body.length > 170 || wordCount(body) > 28) {
			denseSlideIndexes.add(index);
			issues.push({ kind: 'body_dense', severity: 'fix', slideIndex: index, message: `F${index + 1}: zu viel Text — auf einen Satz oder Reveal trimmen.` });
		}
		if ((slide.reveal?.length ?? 0) > 0) revealSlides++;
		if (text.length > 240 || DESKTOP_RE.test(text)) {
			issues.push({ kind: 'desktop_suspect', severity: 'warn', slideIndex: index, message: `F${index + 1}: wirkt wie Desktop-/Report-Material — im Import kürzen.` });
		}
	});

	const last = slides[slides.length - 1];
	const lastText = [last?.eyebrow, last?.headline, last?.body].filter(Boolean).join(' ');
	if (slides.length > 0 && !CTA_RE.test(lastText)) {
		issues.push({ kind: 'missing_cta', severity: 'warn', message: 'Letzte Folie hat keinen klaren nächsten Schritt.' });
	}
	if (slides.length >= 4 && revealSlides === 0) {
		issues.push({ kind: 'reveal_missing', severity: 'warn', message: 'Keine Reveal-Punkte — ein Live-Talk profitiert von 1–2 kontrollierten Enthüllungen.' });
	}

	const fixIssues = issues.filter((issue) => issue.severity === 'fix').length;
	const warnIssues = issues.filter((issue) => issue.severity === 'warn').length;
	const status: DeckReadyStatus = fixIssues > 0 ? 'needs_work' : warnIssues > 0 ? 'almost_ready' : 'live_ready';
	const suggestedFixes: DeckQualityFix[] = [];
	if (denseSlideIndexes.size || longHeadlineIndexes.size || slides.length > 15) suggestedFixes.push('shorten');
	if (issues.some((issue) => issue.kind === 'reveal_missing' || issue.kind === 'body_dense')) suggestedFixes.push('suggest_reveal');
	if (issues.some((issue) => issue.kind === 'missing_cta')) suggestedFixes.push('add_cta');

	return {
		status,
		label: status === 'live_ready' ? 'Live-ready' : status === 'almost_ready' ? 'Fast live-ready' : 'Needs work',
		summary: `${slides.length} ${slides.length === 1 ? 'Folie' : 'Folien'} · ${denseSlideIndexes.size} zu dicht · ${longHeadlineIndexes.size} lange Headlines · ${revealSlides} Reveal-Momente`,
		metrics: { slideCount: slides.length, denseSlides: denseSlideIndexes.size, longHeadlines: longHeadlineIndexes.size, revealSlides },
		issues,
		suggestedFixes: Array.from(new Set(suggestedFixes))
	};
}

export function applyQualityFix(source: string, fix: DeckQualityFix): string {
	if (fix === 'add_cta') return addCtaSlide(source);
	if (fix === 'suggest_reveal') return suggestReveal(source);
	return shortenSource(source);
}

function addCtaSlide(source: string): string {
	const trimmed = source.trim();
	const slides = parseDeck(trimmed);
	const last = slides[slides.length - 1];
	const lastText = [last?.eyebrow, last?.headline, last?.body].filter(Boolean).join(' ');
	if (CTA_RE.test(lastText)) return source;
	const cta = 'Next\n# Nächster Schritt\nWas nach dieser Session konkret passieren soll.';
	return trimmed ? `${trimmed}\n\n---\n\n${cta}` : cta;
}

function suggestReveal(source: string): string {
	return splitBlocks(source).map((block) => {
		if (/^\s*\+\+/m.test(block)) return block;
		const lines = block.split(/\r?\n/);
		const bodyIndex = lines.findIndex((line) => line.trim() && !line.trim().startsWith('#') && !line.includes(':') && !line.trim().startsWith('!['));
		if (bodyIndex < 0) return block;
		const sentence = firstSentence(lines[bodyIndex].trim());
		if (!sentence || sentence.length < 12) return block;
		return `${block.trim()}\n++ ${sentence}`;
	}).join('\n\n---\n\n');
}

function shortenSource(source: string): string {
	return splitBlocks(source).map((block) => {
		const lines = block.split(/\r?\n/).map((line) => {
			const trimmed = line.trim();
			if (trimmed.startsWith('# ')) return `# ${truncate(trimmed.slice(2), 64)}`;
			if (!trimmed || trimmed.startsWith('type:') || trimmed.startsWith('left:') || trimmed.startsWith('right:') || trimmed.startsWith('notes:') || trimmed.startsWith('![') || trimmed.startsWith('++') || trimmed.startsWith('- ')) return line;
			return truncate(line, 130);
		});
		return lines.join('\n');
	}).slice(0, 15).join('\n\n---\n\n');
}

function splitBlocks(source: string): string[] {
	return source.split(/^---\s*$/m).map((block) => block.trim()).filter(Boolean);
}

function truncate(value: string, max: number): string {
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (normalized.length <= max) return normalized;
	return `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function firstSentence(value: string): string {
	return value.split(/(?<=[.!?])\s+/)[0]?.trim() ?? value.trim();
}

function wordCount(value: string): number {
	return value.trim().split(/\s+/).filter(Boolean).length;
}
