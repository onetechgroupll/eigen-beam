import { requestDeckJson, type AiFallbackReason } from '$lib/server/claude';
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_TEXT_CHARS = 40_000;

export type ImportResult = { title: string; source: string; extractedChars: number; mode: 'local' | 'ai'; fallbackReason?: AiFallbackReason };

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
	if ('source' in layout) return { ...layout, extractedChars: text.length };
	const source = importTextToDeckSource(text);
	return { title: title || firstHeadline(source) || 'Importiertes Deck', source, extractedChars: text.length, mode: 'local', fallbackReason: layout.fallbackReason };
}

/** Claude re-layout of imported text; `fallbackReason` says why AI was not used. */
export async function aiImportLayout(title: string, text: string): Promise<{ title: string; source: string; mode: 'ai' } | { fallbackReason: AiFallbackReason }> {
	const ai = await requestDeckJson({
		label: 'import-layout',
		maxTokens: 16000,
		timeoutMs: 60_000,
		system: 'Du wandelst importierte PDF/PPT-Notizen in eigen.beam Markdown um. Output NUR JSON {"title":"...","source":"..."}. Vertikal/mobile-first: eine klare Idee pro Slide, kurze Headlines, --- trennt Slides, ++ für Reveal-Bullets. Keine erfundenen Fakten.',
		user: `Titel: ${title}\n\nExtrahierter Text:\n${text.slice(0, MAX_TEXT_CHARS)}`
	});
	if (!ai.ok) return { fallbackReason: ai.reason };
	return { title: ai.title?.trim() || title || firstHeadline(ai.source) || 'Importiertes Deck', source: ai.source, mode: 'ai' };
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
