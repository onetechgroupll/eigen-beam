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

export function liveStatsDashboard(stats: AudienceStats, now = Date.now()): LiveStatsDashboard {
	const durationMinutes = Math.max(0, Math.round((now - stats.startedAt) / 60_000));
	const engagements = stats.reactions + stats.questions + stats.bookmarks;
	const reopenRate = stats.joins > 0 ? Math.round((stats.reopens / stats.joins) * 100) : 0;
	return {
		durationMinutes,
		engagements,
		reopenRate,
		joinLabel: `${stats.peakConcurrent} Peak / ${stats.joins} Joins`,
		presenceLabel: `${stats.currentViewers} live · Peak ${stats.peakConcurrent}`,
		engagementLabel: `${engagements} Signale · ${stats.questions} Fragen`
	};
}

export function fieldTestChecklist(stats: AudienceStats, viewerUrl: string): FieldTestChecklistItem[] {
	const cleanUrl = viewerUrl.trim();
	const hasJoinPath = cleanUrl.includes('/v/');
	const roomFilled = stats.peakConcurrent >= 8;
	const roomStarted = stats.joins > 0;
	const enoughCurrentlyLive = stats.currentViewers >= Math.min(3, Math.max(1, stats.peakConcurrent));
	const engagements = stats.reactions + stats.questions + stats.bookmarks;
	return [
		{
			label: 'Join-Pfad bereit',
			detail: hasJoinPath ? `Kurzlink/QR aktiv: ${cleanUrl}` : 'Viewer-Link noch nicht bereit.',
			status: hasJoinPath ? 'ready' : 'risk'
		},
		{
			label: '8 Phones im Raum',
			detail: roomFilled ? `${stats.peakConcurrent} Geräte waren gleichzeitig dabei.` : roomStarted ? `${stats.peakConcurrent} Peak — beim Feldtest bewusst Join-Zeit stoppen.` : 'Noch keine Viewer — erst QR/Shortlink testen.',
			status: roomFilled ? 'good' : roomStarted ? 'watch' : 'risk'
		},
		{
			label: 'Live-Sync beobachten',
			detail: enoughCurrentlyLive ? `${stats.currentViewers} Viewer hängen live am Stream.` : 'Wenn Leute im Raum sind: prüfen, ob alle nach Slide-Wechsel sofort folgen.',
			status: enoughCurrentlyLive ? 'good' : 'watch'
		},
		{
			label: 'Signal nach dem Talk',
			detail: stats.reopens > 0 ? `${stats.reopens} Re-Open(s) — Link wurde nach der Session wieder geöffnet.` : engagements > 0 ? `${engagements} Reaktionen/Fragen/Merker — Resonanz da, Re-Open später prüfen.` : 'Noch keine Re-Opens/Signale; nach dem Termin Recap-Link beobachten.',
			status: stats.reopens > 0 || engagements > 0 ? 'watch' : 'ready'
		}
	];
}
