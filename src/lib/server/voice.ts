import { aiImportLayout, importTextToDeckSource } from '$lib/server/imports';

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type FetchLike = typeof fetch;

export type VoiceImportResult = { title: string; source: string; transcript: string; mode: 'local' | 'ai' };

export async function voiceFileToDeckSource(file: File, title = '', fetcher: FetchLike = fetch): Promise<VoiceImportResult> {
	const transcript = await transcribeAudio(file, fetcher);
	const deckTitle = title || file.name.replace(/\.[^.]+$/, '') || 'Voice Deck';
	const layout = await aiImportLayout(deckTitle, transcript);
	if (layout) return { ...layout, transcript, mode: 'ai' };
	return { title: deckTitle, source: importTextToDeckSource(transcript), transcript, mode: 'local' };
}

export async function transcribeAudio(file: File, fetcher: FetchLike = fetch): Promise<string> {
	if (file.size > MAX_AUDIO_BYTES) throw Object.assign(new Error('Audio-Datei zu groß (max. 25 MB).'), { status: 413 });
	if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
		const text = (await file.text()).trim();
		if (!text) throw Object.assign(new Error('Transkript ist leer.'), { status: 422 });
		return text;
	}
	const key = process.env.OPENAI_API_KEY || process.env.EB_OPENAI_API_KEY;
	if (!key) throw Object.assign(new Error('Voice→Slides braucht OPENAI_API_KEY oder EB_OPENAI_API_KEY für Transkription.'), { status: 501 });
	const form = new FormData();
	form.set('file', file);
	form.set('model', process.env.EB_TRANSCRIBE_MODEL || 'whisper-1');
	form.set('response_format', 'json');
	const res = await fetcher('https://api.openai.com/v1/audio/transcriptions', {
		method: 'POST',
		headers: { authorization: 'Bearer ' + key },
		body: form
	});
	if (!res.ok) throw Object.assign(new Error('Transkription fehlgeschlagen.'), { status: 502 });
	const json = await res.json() as { text?: unknown };
	const text = typeof json.text === 'string' ? json.text.trim() : '';
	if (!text) throw Object.assign(new Error('Transkription lieferte keinen Text.'), { status: 422 });
	return text;
}
