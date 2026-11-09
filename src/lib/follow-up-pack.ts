import type { ReplaySnapshot } from './server/rooms';
import { buildSessionSummary, type SessionSummary } from './session-summary';

export type FollowUpPackLink = {
	label: string;
	href: string;
};

export type FollowUpPack = {
	id: string;
	subject: string;
	emailBody: string;
	chatText: string;
	links: FollowUpPackLink[];
	markdown: string;
};

export type FollowUpPackOptions = {
	baseUrl?: string;
	summary?: SessionSummary;
};

export function buildFollowUpPack(replay: ReplaySnapshot, options: FollowUpPackOptions = {}): FollowUpPack {
	const baseUrl = normalizeBaseUrl(options.baseUrl ?? '');
	const summary = options.summary ?? buildSessionSummary(replay);
	const replayUrl = absoluteUrl(baseUrl, `/replay/${replay.id}`);
	const summaryUrl = absoluteUrl(baseUrl, `/api/replay/${replay.id}/summary?format=md`);
	const takeawayUrl = absoluteUrl(baseUrl, `/api/replay/${replay.id}/takeaway?format=md`);
	const strongest = summary.topSlides[0];
	const subject = `Follow-up: eigen.beam Session ${replay.id}`;
	const landed = summary.whatLanded.slice(0, 2);
	const clarify = summary.clarifyNext.slice(0, 2);
	const emailLines = [
		'Hi zusammen,',
		'',
		'danke für die Session. Hier ist die Kurzfassung mit Replay und den wichtigsten Signalen:',
		'',
		`Replay ansehen: ${replayUrl}`,
		`Summary laden: ${summaryUrl}`,
		`Takeaway laden: ${takeawayUrl}`,
		'',
		'Was gelandet ist:',
		...landed.map((line) => `- ${line}`),
		'',
		'Nächstes Mal / offene Punkte:',
		...clarify.map((line) => `- ${line}`),
		'',
		strongest ? `Top-Folie: ${strongest.label} „${strongest.headline}“ (${strongest.score} Signale).` : 'Top-Folie: noch keine klaren Signale.',
		'',
		'Viele Grüße'
	];
	const chatText = [
		`Kurzfassung zur Session: ${replayUrl}`,
		strongest ? `Top-Folie: ${strongest.label} „${strongest.headline}“.` : '',
		`Summary: ${summaryUrl}`
	].filter(Boolean).join('\n');
	const links = [
		{ label: 'Replay ansehen', href: replayUrl },
		{ label: 'Summary laden', href: summaryUrl },
		{ label: 'Takeaway laden', href: takeawayUrl }
	];
	const markdown = followUpPackMarkdown({ id: replay.id, subject, emailBody: emailLines.join('\n'), chatText, links });
	return { id: replay.id, subject, emailBody: emailLines.join('\n'), chatText, links, markdown };
}

export function followUpPackMarkdown(pack: Omit<FollowUpPack, 'markdown'>): string {
	const lines = [
		'# Follow-up Pack',
		'',
		`Room: ${pack.id}`,
		`Subject: ${pack.subject}`,
		'',
		'## Mail-Entwurf',
		'',
		pack.emailBody,
		'',
		'## Gruppenchat-Kurzfassung',
		'',
		pack.chatText,
		'',
		'## Links',
		...pack.links.map((link) => `- [${link.label}](${link.href})`)
	];
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function normalizeBaseUrl(value: string): string {
	return value.trim().replace(/\/$/, '');
}

function absoluteUrl(baseUrl: string, path: string): string {
	return baseUrl ? `${baseUrl}${path}` : path;
}
