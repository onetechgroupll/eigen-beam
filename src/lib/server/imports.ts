export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;

export type ImportResult = { title: string; source: string; extractedChars: number; mode: 'local' | 'ai' };

export function importTextToDeckSource(text: string): string {
	const clean = normalizeText(text).slice(0, MAX_TEXT_CHARS);
	const chunks = clean.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean);
	const blocks = (chunks.length ? chunks : [clean]).map((chunk) => {
		const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
		const headline = clampLine(lines[0] ?? 'Importierte Folie', 80);
		const body = lines.slice(1).join('\n').trim();
		return body ? `# ${headline}\n${body}` : `# ${headline}`;
	});
	return blocks.join('\n\n---\n\n');
}

export async function importFileToDeckSource(file: File, title = ''): Promise<ImportResult> {
	if (file.size > MAX_IMPORT_BYTES) throw Object.assign(new Error('Import-Datei zu groß (max. 20 MB).'), { status: 413 });
	const bytes = new Uint8Array(await file.arrayBuffer());
	const name = file.name.toLowerCase();
	const mime = file.type;
	let text = '';
	if (name.endsWith('.pptx') || mime.includes('presentation')) text = await extractPptxText(bytes);
	else if (name.endsWith('.pdf') || mime === 'application/pdf') text = extractPdfText(bytes);
	else text = new TextDecoder().decode(bytes);
	if (!text.trim()) throw Object.assign(new Error('Konnte aus der Datei keinen Text extrahieren.'), { status: 422 });
	const layout = await aiImportLayout(title || file.name.replace(/\.[^.]+$/, ''), text);
	if (layout) return { ...layout, extractedChars: text.length };
	const source = importTextToDeckSource(text);
	return { title: title || firstHeadline(source) || 'Importiertes Deck', source, extractedChars: text.length, mode: 'local' };
}

export async function aiImportLayout(title: string, text: string): Promise<{ title: string; source: string; mode: 'ai' } | null> {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return null;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 25_000);
	try {
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			signal: controller.signal,
			headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
			body: JSON.stringify({
				model: process.env.EB_CLAUDE_MODEL ?? 'claude-3-5-sonnet-latest',
				max_tokens: 2200,
				system: 'Du wandelst importierte PDF/PPT-Notizen in eigen.beam Markdown um. Output NUR JSON {"title":"...","source":"..."}. Vertikal/mobile-first: eine klare Idee pro Slide, kurze Headlines, --- trennt Slides, ++ für Reveal-Bullets. Keine erfundenen Fakten.',
				messages: [{ role: 'user', content: `Titel: ${title}\n\nExtrahierter Text:\n${text.slice(0, MAX_TEXT_CHARS)}` }]
			})
		});
		if (!res.ok) return null;
		const json = await res.json() as { content?: Array<{ text?: string }> };
		const raw = json.content?.map((p) => p.text ?? '').join('').trim() ?? '';
		const parsed = JSON.parse(raw) as { title?: string; source?: string };
		if (!parsed.source?.trim()) return null;
		return { title: parsed.title?.trim() || title || firstHeadline(parsed.source) || 'Importiertes Deck', source: parsed.source, mode: 'ai' };
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

export async function extractPptxText(bytes: Uint8Array): Promise<string> {
	try {
		const AdmZip = await loadAdmZip();
		const zip = new AdmZip(Buffer.from(bytes));
		const entries = zip.getEntries()
			.filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
			.sort((a, b) => naturalSlideNo(a.entryName) - naturalSlideNo(b.entryName));
		return entries.map((e) => extractXmlText(e.getData().toString('utf8'))).filter(Boolean).join('\n\n');
	} catch {
		return '';
	}
}

async function loadAdmZip(): Promise<new (buffer?: Buffer) => { getEntries(): Array<{ entryName: string; getData(): Buffer }> }> {
	const mod = await import('adm-zip');
	return ((mod as { default?: unknown }).default ?? mod) as new (buffer?: Buffer) => { getEntries(): Array<{ entryName: string; getData(): Buffer }> };
}

export function extractPdfText(bytes: Uint8Array): string {
	const raw = new TextDecoder('latin1').decode(bytes);
	const parts: string[] = [];
	for (const m of Array.from(raw.matchAll(/\(([^()]{1,500})\)\s*Tj/g))) parts.push(unescapePdf(m[1]));
	for (const m of Array.from(raw.matchAll(/\[((?:\s*\([^()]{1,500}\)\s*)+)\]\s*TJ/g))) {
		for (const inner of Array.from(m[1].matchAll(/\(([^()]{1,500})\)/g))) parts.push(unescapePdf(inner[1]));
	}
	return normalizeText(parts.join('\n'));
}

function extractXmlText(xml: string): string {
	return Array.from(xml.matchAll(/<a:t>(.*?)<\/a:t>/g))
		.map((m) => decodeXml(m[1]))
		.map((s) => s.trim())
		.filter(Boolean)
		.join('\n');
}

function normalizeText(text: string): string {
	return text.replace(/\r\n?/g, '\n').replace(/[\t ]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function clampLine(line: string, max: number): string {
	return line.length <= max ? line : `${line.slice(0, max - 1).trim()}…`;
}

function firstHeadline(source: string): string {
	return source.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
}

function naturalSlideNo(name: string): number {
	return Number(name.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
}

function decodeXml(s: string): string {
	return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function unescapePdf(s: string): string {
	return s.replace(/\\([nrtbf()\\])/g, (_m, c: string) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' })[c] ?? c);
}
