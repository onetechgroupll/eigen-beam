import type { ReplaySnapshot } from './server/rooms';
import { buildSessionSummary, type SessionSummary } from './session-summary';
import { detectContentLocale, type Locale } from './i18n';

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
	const locale = detectContentLocale(replay.slides);
	const de = locale === 'de';
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
		de ? 'Hi zusammen,' : 'Hi everyone,',
		'',
		de ? 'danke für die Session. Hier ist die Kurzfassung mit Replay und den wichtigsten Signalen:' : 'thanks for the session. Here is the short version with the replay and the most important signals:',
		'',
		`${de ? 'Replay ansehen' : 'View replay'}: ${replayUrl}`,
		`${de ? 'Summary laden' : 'Download summary'}: ${summaryUrl}`,
		`${de ? 'Takeaway laden' : 'Download takeaway'}: ${takeawayUrl}`,
		'',
		de ? 'Was gelandet ist:' : 'What landed:',
		...landed.map((line) => `- ${line}`),
		'',
		de ? 'Nächstes Mal / offene Punkte:' : 'Next time / open points:',
		...clarify.map((line) => `- ${line}`),
		'',
		strongest ? `${de ? 'Top-Folie' : 'Top slide'}: ${strongest.label} “${strongest.headline}” (${strongest.score} ${de ? 'Signale' : 'signals'}).` : (de ? 'Top-Folie: noch keine klaren Signale.' : 'Top slide: no clear signals yet.'),
		'',
		de ? 'Viele Grüße' : 'Best'
	];
	const chatText = [
		`${de ? 'Kurzfassung zur Session' : 'Session summary'}: ${replayUrl}`,
		strongest ? `${de ? 'Top-Folie' : 'Top slide'}: ${strongest.label} “${strongest.headline}”.` : '',
		`Summary: ${summaryUrl}`
	].filter(Boolean).join('\n');
	const links = [
		{ label: de ? 'Replay ansehen' : 'View replay', href: replayUrl },
		{ label: de ? 'Summary laden' : 'Download summary', href: summaryUrl },
		{ label: de ? 'Takeaway laden' : 'Download takeaway', href: takeawayUrl }
	];
	const markdown = followUpPackMarkdown({ id: replay.id, subject, emailBody: emailLines.join('\n'), chatText, links }, locale);
	return { id: replay.id, subject, emailBody: emailLines.join('\n'), chatText, links, markdown };
}

export function followUpPackMarkdown(pack: Omit<FollowUpPack, 'markdown'>, locale: Locale = 'de'): string {
	const de = locale === 'de';
	const lines = [
		de ? '# Follow-up-Paket' : '# Follow-up Pack',
		'',
		`${de ? 'Raum' : 'Room'}: ${pack.id}`,
		`${de ? 'Betreff' : 'Subject'}: ${pack.subject}`,
		'',
		de ? '## Mail-Entwurf' : '## Email draft',
		'',
		pack.emailBody,
		'',
		de ? '## Gruppenchat-Kurzfassung' : '## Group chat summary',
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
