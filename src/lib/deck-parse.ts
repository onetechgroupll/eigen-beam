import type { CompareBlock, Slide, SlideKind, TimelineItem } from '$lib/decks';

const SEPARATOR = /^\s*---\s*$/;
const HEADING = /^\s*#{1,6}\s+(.*\S)\s*$/;
const IMAGE = /!\[([^\]]*)\]\(\s*([^)\s]+)[^)]*\)/;
const DIRECTIVE = /^\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*:\s*(.*)$/;
const REVEAL = /^\s*(?:\+\+|>>|reveal:)\s*(.+)$/i;
// Timeline entry `- label: text`. A spaced separator (`: ` or ` – `) wins, so
// labels may contain colons and hyphens (`- 09:30: Kick-off`, `- Kick-off - Start`).
// Compact entries without spaces (`- Q1:Pilot`) fall back to the strict pattern.
const TIMELINE_SPACED = /^\s*[-*]\s*(.+?)\s*(?::\s+|\s+[–—-]\s+)(.+)$/;
const TIMELINE = /^\s*[-*]\s*([^:–—-]+)\s*[:–—-]\s*(.+)$/;

export function parseDeck(source: string): Slide[] {
	const slides: Slide[] = [];
	const normalizedSource = source.replace(/\r\n?/g, '\n');
	for (const block of splitBlocks(normalizedSource)) {
		const slide = parseBlock(block);
		if (slide) slides.push(slide);
	}
	return slides;
}

function splitBlocks(source: string): string[] {
	const lines = source.split('\n');
	const blocks: string[][] = [[]];
	for (const line of lines) {
		if (SEPARATOR.test(line)) blocks.push([]);
		else blocks[blocks.length - 1].push(line);
	}
	return blocks.map((b) => b.join('\n'));
}

export function sanitizeImageUrl(value: string): string | undefined {
	const trimmed = value.trim();
	if (trimmed.startsWith('/assets/')) return trimmed;
	try {
		const url = new URL(trimmed);
		return url.protocol === 'https:' ? url.toString() : undefined;
	} catch {
		return undefined;
	}
}

function parseBlock(block: string): Slide | null {
	let text = block.trim();
	if (!text) return null;

	let image: string | undefined;
	let alt = '';
	const img = text.match(IMAGE);
	if (img) {
		alt = img[1].trim();
		image = sanitizeImageUrl(img[2].trim());
		text = text.replace(IMAGE, '').trim();
	}

	const rawLines = text.split('\n');
	let kindDirective: string | undefined;
	for (const raw of rawLines) {
		const directive = raw.match(DIRECTIVE);
		if (directive && ['type', 'kind'].includes(directive[1].toLowerCase())) {
			kindDirective = directive[2];
		}
	}
	const kind = normalizeKind(kindDirective, image);
	const directives = new Map<string, string>();
	const lines: string[] = [];
	const reveal: string[] = [];
	let speakerNotes: string | undefined;

	for (const raw of rawLines) {
		const revealMatch = raw.match(REVEAL);
		if (revealMatch) {
			reveal.push(cleanInline(revealMatch[1]));
			continue;
		}
		const directive = raw.match(DIRECTIVE);
		if (directive && isKnownDirective(directive[1], kind === 'quote')) {
			const key = directive[1].toLowerCase();
			if (key === 'notes' || key === 'speaker') speakerNotes = directive[2].trim();
			else directives.set(key, directive[2].trim());
			continue;
		}
		lines.push(raw);
	}

	const headingIdx = lines.findIndex((line) => HEADING.test(line));
	let eyebrow: string | undefined;
	let headline = '';
	let bodyLines: string[] = [];

	if (headingIdx >= 0) {
		eyebrow = collapse(lines.slice(0, headingIdx));
		headline = cleanInline(lines[headingIdx].replace(/^\s*#{1,6}\s+/, ''));
		bodyLines = lines.slice(headingIdx + 1);
	} else {
		const nonEmpty = lines.map((l) => l.trim()).filter(Boolean);
		if (nonEmpty.length > 0) {
			const [first, ...rest] = nonEmpty;
			headline = cleanInline(first);
			bodyLines = rest;
		}
	}

	const body = collapse(bodyLines);
	const quote = parseQuote(kind, headline, body, bodyLines, directives);
	const compare = parseCompare(kind, directives, bodyLines);
	const timeline = parseTimeline(kind, bodyLines);
	const metric = directives.get('number') ?? directives.get('metric') ?? (kind === 'number' ? headline : undefined);

	if (!headline && image) headline = alt || 'Bild';
	if (!headline && quote?.quote) headline = quote.quote;
	if (!headline) return null;

	return clean({
		eyebrow: eyebrow || directives.get('eyebrow') || undefined,
		headline,
		body: quote || compare || timeline ? undefined : body || undefined,
		image,
		kind,
		metric,
		quote: quote?.quote,
		attribution: quote?.attribution,
		compare,
		timeline,
		reveal: reveal.length ? reveal : undefined,
		speakerNotes
	});
}

function isKnownDirective(key: string, allowQuoteFields = false): boolean {
	const normalized = key.toLowerCase();
	return ['type', 'kind', 'eyebrow', 'notes', 'speaker', 'number', 'metric'].includes(normalized)
		|| (allowQuoteFields && ['quote', 'attribution'].includes(normalized));
}

function normalizeKind(value: string | undefined, image: string | undefined): SlideKind {
	const v = (value ?? '').toLowerCase().trim();
	if (v === 'text') return 'text';
	if (['number', 'quote', 'compare', 'timeline'].includes(v)) return v as SlideKind;
	if (['image', 'full-bleed', 'fullbleed'].includes(v)) return 'image';
	return image ? 'image' : 'text';
}

function parseQuote(kind: SlideKind, headline: string, body: string, lines: string[], directives: Map<string, string>): { quote: string; attribution?: string } | null {
	if (kind !== 'quote') return null;
	const quoteLine = lines.find((line) => line.trim().startsWith('>'));
	const quote = directives.get('quote') || cleanInline((quoteLine ?? headline).replace(/^\s*>\s*/, ''));
	const attribution = directives.get('attribution') || lines
		.map((line) => line.trim())
		.find((line) => /^[-—–]\s+/.test(line))
		?.replace(/^[-—–]\s+/, '')
		.trim();
	return { quote: quote || body || headline, attribution };
}

function parseCompare(kind: SlideKind, directives: Map<string, string>, lines: string[]): CompareBlock | undefined {
	if (kind !== 'compare') return undefined;
	let left = directives.get('left') ?? '';
	let right = directives.get('right') ?? '';
	for (const line of lines) {
		const m = line.match(/^\s*(left|right)\s*:\s*(.+)$/i);
		if (!m) continue;
		if (m[1].toLowerCase() === 'left') left = m[2].trim();
		else right = m[2].trim();
	}
	const l = splitTitleBody(left || 'Vorher');
	const r = splitTitleBody(right || 'Nachher');
	return { leftTitle: l.title, leftBody: l.body, rightTitle: r.title, rightBody: r.body };
}

function parseTimeline(kind: SlideKind, lines: string[]): TimelineItem[] | undefined {
	if (kind !== 'timeline') return undefined;
	const items = lines
		.map((line) => line.match(TIMELINE_SPACED) ?? line.match(TIMELINE))
		.filter((m): m is RegExpMatchArray => Boolean(m))
		.map((m) => ({ label: cleanInline(m[1]), text: cleanInline(m[2]) }));
	return items.length ? items : undefined;
}

function splitTitleBody(value: string): { title: string; body?: string } {
	const [title, ...rest] = value.split('|').map((part) => part.trim()).filter(Boolean);
	return { title: title || '—', body: rest.join(' | ') || undefined };
}

function collapse(lines: string[]): string {
	return lines.map((l) => unescapeReservedSourceLine(l).trim()).filter(Boolean).join(' ').trim();
}

function unescapeReservedSourceLine(line: string): string {
	const match = line.match(/^(\s*)\\(.*)$/);
	if (!match) return line;
	const [, whitespace, content] = match;
	if (isReservedSourceLine(content.replace(/^\\+/, ''))) {
		return `${whitespace}${content}`;
	}
	return line;
}

function isReservedSourceLine(line: string): boolean {
	const directive = line.match(DIRECTIVE);
	return REVEAL.test(line)
		|| TIMELINE_SPACED.test(line)
		|| TIMELINE.test(line)
		|| /^\s*(?:left|right)\s*:/i.test(line)
		|| SEPARATOR.test(line)
		|| Boolean(directive && isKnownDirective(directive[1], true));
}

function cleanInline(value: string): string {
	return value
		.trim()
		.replace(/^[-*+]\s+/, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/__([^_]+)__/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.trim();
}

function clean(s: Slide): Slide {
	const out: Slide = { headline: s.headline };
	if (s.eyebrow) out.eyebrow = s.eyebrow;
	if (s.body) out.body = s.body;
	if (s.image) out.image = s.image;
	if (s.kind && s.kind !== 'text') out.kind = s.kind;
	if (s.metric) out.metric = s.metric;
	if (s.quote) out.quote = s.quote;
	if (s.attribution) out.attribution = s.attribution;
	if (s.compare) out.compare = s.compare;
	if (s.timeline) out.timeline = s.timeline;
	if (s.reveal?.length) out.reveal = s.reveal;
	if (s.speakerNotes) out.speakerNotes = s.speakerNotes;
	return out;
}
