import { parseDeck } from '$lib/deck-parse';

export type ClarifyResult = { title: string; source: string; mode: 'local' | 'ai' };

export function localClarify(title: string, source: string): ClarifyResult {
	const slides = parseDeck(source);
	const blocks = slides.slice(0, 15).map((slide) => {
		const lines: string[] = [];
		if (slide.eyebrow) lines.push(oneIdea(slide.eyebrow, 42));
		if (slide.kind && slide.kind !== 'text') lines.push(`type: ${slide.kind}`);
		lines.push(`# ${oneIdea(slide.headline, 68)}`);
		if (slide.body) lines.push(oneIdea(slide.body, 110));
		if (slide.image) lines.push(`![${oneIdea(slide.headline, 80)}](${slide.image})`);
		for (const item of slide.reveal?.slice(0, 3) ?? []) lines.push(`++ ${oneIdea(item, 72)}`);
		if (slide.speakerNotes) lines.push(`notes: ${oneIdea(slide.speakerNotes, 180)}`);
		return lines.join('\n').trim();
	});
	return { title: oneIdea(title || blocks[0]?.replace(/^#\s*/, '') || 'Klares Deck', 70), source: blocks.join('\n\n---\n\n'), mode: 'local' };
}

export async function aiClarify(title: string, source: string): Promise<ClarifyResult | null> {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return null;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 20_000);
	try {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			signal: controller.signal,
			headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
			body: JSON.stringify({
				model: process.env.EB_CLAUDE_MODEL ?? 'claude-3-5-sonnet-latest',
				max_tokens: 1800,
				system: 'Du verdichtest eigen.beam Markdown-Slides. Output NUR JSON {"title":"...","source":"..."}. Vertikal/mobile-first 9:16. Eine Idee pro Slide. Maximal 15 Slides. Kurze Headlines, knappe Bodies, keine Textwände. Speaker Notes strikt als notes: ... behalten. --- trennt, keine Freiform-Layouts.',
				messages: [{ role: 'user', content: `Titel: ${title}\n\nMarkdown:\n${source.slice(0, 50000)}` }]
			})
		});
		if (!res.ok) return null;
		const json = await res.json() as { content?: Array<{ text?: string }> };
		const text = json.content?.map((part) => part.text ?? '').join('').trim() ?? '';
		const parsed = JSON.parse(text) as { title?: string; source?: string };
		if (!parsed.source) return null;
		return { title: parsed.title ?? title, source: parsed.source, mode: 'ai' };
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function oneIdea(value: string, max: number): string {
	const cleaned = value.replace(/\s+/g, ' ').trim();
	if (cleaned.length <= max) return cleaned;
	const cut = cleaned.slice(0, max - 1);
	return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max * 0.7))).trim()}…`;
}
