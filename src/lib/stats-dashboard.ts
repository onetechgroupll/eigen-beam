import type { Locale } from './i18n';

export type AudienceStats = {
	joins: number;
	currentViewers: number;
	peakConcurrent: number;
	reopens: number;
	reactions: number;
	questions: number;
	bookmarks: number;
	startedAt: number;
};

export type FieldTestChecklistItem = {
	label: string;
	detail: string;
	status: 'ready' | 'good' | 'watch' | 'risk';
};

export type LiveStatsDashboard = {
	durationMinutes: number;
	engagements: number;
	reopenRate: number;
	joinLabel: string;
	presenceLabel: string;
	engagementLabel: string;
};

export function liveStatsDashboard(stats: AudienceStats, now = Date.now(), locale: Locale = 'de'): LiveStatsDashboard {
	const de = locale === 'de';
	const durationMinutes = Math.max(0, Math.round((now - stats.startedAt) / 60_000));
	const engagements = stats.reactions + stats.questions + stats.bookmarks;
	const reopenRate = stats.joins > 0 ? Math.round((stats.reopens / stats.joins) * 100) : 0;
	return {
		durationMinutes,
		engagements,
		reopenRate,
		joinLabel: `${stats.peakConcurrent} Peak / ${stats.joins} Joins`,
		presenceLabel: `${stats.currentViewers} live · Peak ${stats.peakConcurrent}`,
		engagementLabel: `${engagements} ${de ? 'Signale' : 'signals'} · ${stats.questions} ${de ? 'Fragen' : 'questions'}`
	};
}

export function fieldTestChecklist(stats: AudienceStats, viewerUrl: string, locale: Locale = 'de'): FieldTestChecklistItem[] {
	const de = locale === 'de';
	const cleanUrl = viewerUrl.trim();
	const hasJoinPath = cleanUrl.includes('/v/');
	const roomFilled = stats.peakConcurrent >= 8;
	const roomStarted = stats.joins > 0;
	const enoughCurrentlyLive = stats.currentViewers >= Math.min(3, Math.max(1, stats.peakConcurrent));
	const engagements = stats.reactions + stats.questions + stats.bookmarks;
	return [
		{
			label: de ? 'Join-Pfad bereit' : 'Join path ready',
			detail: hasJoinPath ? `${de ? 'Kurzlink/QR aktiv' : 'Short link/QR active'}: ${cleanUrl}` : (de ? 'Viewer-Link noch nicht bereit.' : 'Viewer link is not ready yet.'),
			status: hasJoinPath ? 'ready' : 'risk'
		},
		{
			label: de ? '8 Phones im Raum' : '8 phones in the room',
			detail: roomFilled ? `${stats.peakConcurrent} ${de ? 'Geräte waren gleichzeitig dabei.' : 'devices were present at the same time.'}` : roomStarted ? `${stats.peakConcurrent} Peak — ${de ? 'beim Feldtest bewusst Join-Zeit stoppen.' : 'time the join flow during the field test.'}` : (de ? 'Noch keine Viewer — erst QR/Shortlink testen.' : 'No viewers yet — test the QR code or short link first.'),
			status: roomFilled ? 'good' : roomStarted ? 'watch' : 'risk'
		},
		{
			label: de ? 'Live-Sync beobachten' : 'Watch live sync',
			detail: enoughCurrentlyLive ? `${stats.currentViewers} ${de ? 'Viewer hängen live am Stream.' : 'viewers are live on the stream.'}` : (de ? 'Wenn Leute im Raum sind: prüfen, ob alle nach Slide-Wechsel sofort folgen.' : 'When people are in the room, check that everyone follows each slide change immediately.'),
			status: enoughCurrentlyLive ? 'good' : 'watch'
		},
		{
			label: de ? 'Signal nach dem Talk' : 'Signal after the talk',
			detail: stats.reopens > 0 ? `${stats.reopens} Re-Open(s) — ${de ? 'Link wurde nach der Session wieder geöffnet.' : 'the link was opened again after the session.'}` : engagements > 0 ? `${engagements} ${de ? 'Reaktionen/Fragen/Merker — Resonanz da, Re-Open später prüfen.' : 'reactions/questions/saves — response is visible; check reopens later.'}` : (de ? 'Noch keine Re-Opens/Signale; nach dem Termin Recap-Link beobachten.' : 'No reopens or signals yet; watch the recap link after the meeting.'),
			status: stats.reopens > 0 || engagements > 0 ? 'watch' : 'ready'
		}
	];
}
