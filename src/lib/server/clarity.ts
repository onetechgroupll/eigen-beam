import { requestDeckJson, type AiFallbackReason } from '$lib/server/claude';
import { escapeReservedSourceLine, parseDeck } from '$lib/deck-parse';

export type ClarifyResult = { title: string; source: string; mode: 'local' | 'ai'; fallbackReason?: AiFallbackReason };

export function localClarify(title: string, source: string): ClarifyResult {
	const slides = parseDeck(source);
	const blocks = slides.slice(0, 15).map((slide) => {
		const lines: string[] = [];
		if (slide.eyebrow) lines.push(escapeReservedSourceLine(oneIdea(slide.eyebrow, 42)));
		if (slide.kind && slide.kind !== 'text') lines.push(`type: ${slide.kind}`);
		lines.push(`# ${oneIdea(slide.headline, 68)}`);
		if (slide.body) lines.push(escapeReservedSourceLine(oneIdea(slide.body, 110)));
		if (slide.image) lines.push(`![${oneIdea(slide.headline, 80)}](${slide.image})`);
		for (const item of slide.reveal?.slice(0, 3) ?? []) lines.push(`++ ${oneIdea(item, 72)}`);
		if (slide.speakerNotes) lines.push(`notes: ${oneIdea(slide.speakerNotes, 180)}`);
		return lines.join('\n').trim();
	});
	return { title: oneIdea(title || blocks[0]?.replace(/^#\s*/, '') || 'Klares Deck', 70), source: blocks.join('\n\n---\n\n'), mode: 'local' };
}

/** Claude clarity pass with a local fallback; `fallbackReason` says why AI was not used. */
export async function clarifyDeck(title: string, source: string): Promise<ClarifyResult> {
	const ai = await requestDeckJson({
		label: 'clarity',
		maxTokens: 16000,
		timeoutMs: 60_000,
		system: 'Du verdichtest eigen.beam Markdown-Slides. Output NUR JSON {"title":"...","source":"..."}. Vertikal/mobile-first 9:16. Eine Idee pro Slide. Maximal 15 Slides. Kurze Headlines, knappe Bodies, keine Textwände. Speaker Notes strikt als notes: ... behalten. --- trennt, keine Freiform-Layouts.',
		user: `Titel: ${title}\n\nMarkdown:\n${source.slice(0, 50000)}`
	});
	if (ai.ok) return { title: ai.title ?? title, source: ai.source, mode: 'ai' };
	return { ...localClarify(title, source), fallbackReason: ai.reason };
}

function oneIdea(value: string, max: number): string {
	const cleaned = value.replace(/\s+/g, ' ').trim();
	if (cleaned.length <= max) return cleaned;
	const cut = cleaned.slice(0, max - 1);
	return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max * 0.7))).trim()}…`;
}
