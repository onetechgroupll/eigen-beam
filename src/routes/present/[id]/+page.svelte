<script lang="ts">
	import { onMount } from 'svelte';
	import QRCode from 'qrcode';
	import SlideView from '$lib/components/SlideView.svelte';
	import { applySentimentSignal, liveSentimentLabel, pacingHint, reopenInsight, replaySentiment, type SentimentPoint } from '$lib/polish';
	import { presenterFeedItem, type PresenterFeedItem } from '$lib/presenter-feed';
	import { fieldTestChecklist, liveStatsDashboard } from '$lib/stats-dashboard';

	let { data } = $props();
	const initial = <T>(read: () => T): T => read();
	let current = $state(initial(() => data.current));
	let qr = $state('');
	let viewerUrl = $state('');
	let stats = $state(initial(() => ({ ...data.stats, questions: Math.max(data.stats.questions, data.questions.length) })));
	let feed = $state<PresenterFeedItem[]>([]);
	let questions = $state(initial(() => data.questions));
	let presenterEvents: EventSource | null = null;
	let sentimentPoints = $state<SentimentPoint[]>(initial(() => replaySentiment([], data.slides.length)));
	let showJoin = $state(false);
	let showCoach = $state(false);
	let showSession = $state(false);
	let showEndDialog = $state(false);
	let ending = $state(false);
	let endError = $state('');
	let ended = $state(initial(() => data.ended));
	let endedAt = $state<number | null>(initial(() => data.endedAt));
	let alreadyEnded = $state(false);
	let questionsExported = $state(false);
	const total = initial(() => data.slides.length);
	let slide = $derived(data.slides[current]);
	let pacing = $derived(pacingHint(slide));
	let sentiment = $derived(liveSentimentLabel(sentimentPoints));
	let reopen = $derived(reopenInsight(stats));
	let dashboard = $derived(liveStatsDashboard(stats));
	let checklist = $derived(fieldTestChecklist(stats, viewerUrl));
	let questionCount = $derived(Math.max(stats.questions, questions.length));
	let durationMinutes = $derived(Math.max(0, Math.round(((endedAt ?? Date.now()) - stats.startedAt) / 60_000)));

	async function go(n: number) {
		if (ended) return;
		const res = await fetch(`/present/${data.id}/slide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slide: n }) });
		if (res.ok) { const j = await res.json(); current = j.current; }
	}
	function key(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target?.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
		if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(current + 1); }
		if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
	}
	function push(item: PresenterFeedItem) { feed = [item, ...feed].slice(0, 10); }
	function signal(slideIndex: number, type: 'reaction' | 'question' | 'bookmark') {
		sentimentPoints = applySentimentSignal(sentimentPoints, slideIndex, type);
	}
	function requestEnd() {
		endError = '';
		showSession = false;
		showEndDialog = true;
	}
	function closePresenterStream() {
		presenterEvents?.close();
		presenterEvents = null;
	}
	function downloadQuestions() {
		questionsExported = true;
		window.location.assign(`/present/${data.id}/questions`);
	}
	async function endSession(exportAfterEnd = false) {
		if (ending) return;
		ending = true;
		endError = '';
		try {
			const res = await fetch(`/present/${data.id}/slide`, { method: 'DELETE' });
			const result = await res.json().catch(() => ({})) as { endedAt?: unknown; stats?: unknown; questions?: unknown };
			const serverQuestions = readQuestions(result.questions);
			const serverStats = readStats(result.stats);
			if (serverQuestions) questions = serverQuestions;
			if (serverStats) stats = serverStats;
			if (serverQuestions) stats = { ...stats, questions: serverQuestions.length };
			if (res.ok || res.status === 410) {
				closePresenterStream();
				alreadyEnded = res.status === 410;
				endedAt = typeof result.endedAt === 'number' && Number.isFinite(result.endedAt) ? result.endedAt : (endedAt ?? Date.now());
				ended = true;
				showEndDialog = false;
				if (exportAfterEnd) downloadQuestions();
				return;
			}
			endError = 'Session konnte nicht beendet werden. Bitte erneut versuchen.';
		} catch {
			endError = 'Keine Verbindung. Die Session läuft weiter. Bitte erneut versuchen.';
		} finally {
			ending = false;
		}
	}
	function readQuestions(value: unknown): Array<{ text: string; slide: number; ts: number }> | null {
		if (!Array.isArray(value)) return null;
		return value
			.filter((question): question is { text: string; slide: number; ts: number } => Boolean(question) && typeof question.text === 'string' && Number.isFinite(question.slide) && Number.isFinite(question.ts))
			.map((question) => ({ text: question.text, slide: Math.floor(question.slide), ts: question.ts }));
	}
	function readStats(value: unknown): typeof stats | null {
		if (!value || typeof value !== 'object') return null;
		const candidate = value as typeof stats;
		const fields = [candidate.joins, candidate.currentViewers, candidate.peakConcurrent, candidate.reopens, candidate.reactions, candidate.questions, candidate.bookmarks, candidate.startedAt];
		return fields.every((field) => typeof field === 'number' && Number.isFinite(field)) ? candidate : null;
	}

	onMount(() => {
		viewerUrl = `${location.origin}/v/${data.id}`;
		if (ended) return;
		QRCode.toDataURL(viewerUrl, { margin: 1, width: 320 }).then((d) => (qr = d));
		window.addEventListener('keydown', key);
		presenterEvents = new EventSource(`/present/${data.id}/events`);
		presenterEvents.addEventListener('stats', (e) => { const j = JSON.parse((e as MessageEvent).data); stats = { ...j.stats, questions: Math.max(j.stats.questions, questions.length) }; });
		presenterEvents.addEventListener('reaction', (e) => { const j = JSON.parse((e as MessageEvent).data); signal(j.slide, 'reaction'); push(presenterFeedItem({ type: 'reaction', reaction: j.reaction, slide: j.slide, ts: j.ts })); });
		presenterEvents.addEventListener('question', (e) => { const j = JSON.parse((e as MessageEvent).data); questions = [...questions, { text: j.text, slide: j.slide, ts: j.ts }]; stats = { ...stats, questions: questions.length }; signal(j.slide, 'question'); push(presenterFeedItem({ type: 'question', text: j.text, slide: j.slide, ts: j.ts })); });
		presenterEvents.addEventListener('bookmark', (e) => { const j = JSON.parse((e as MessageEvent).data); signal(j.slide, 'bookmark'); push(presenterFeedItem({ type: 'bookmark', slide: j.slide, ts: j.ts })); });
		presenterEvents.addEventListener('ended', (e) => { const j = JSON.parse((e as MessageEvent).data); endedAt = j.ts; ended = true; showEndDialog = false; showSession = false; closePresenterStream(); });
		return () => { window.removeEventListener('keydown', key); closePresenterStream(); };
	});
</script>

{#if ended}
	<main class="end-state">
		<section class="end-card" aria-label="Session beendet">
			<span class="mono kicker">SESSION BEENDET</span>
			<h1>{alreadyEnded ? 'Diese Session war bereits beendet.' : 'Session beendet.'}</h1>
			<p>Alle Viewer sehen jetzt den End-Screen. Der Replay-Link bleibt bereit.</p>
			<div class="end-stats">
				<article><strong>{durationMinutes}</strong><span>Minuten</span></article>
				<article><strong>{stats.peakConcurrent}</strong><span>Viewer-Peak</span></article>
				<article><strong>{questionCount}</strong><span>Fragen</span></article>
			</div>
			<div class="end-links">
				<a class="primary-link" href={`/replay/${data.id}`}>Replay ansehen →</a>
				{#if questionCount > 0}<a class="secondary export-link" href={`/present/${data.id}/questions`}>Fragen exportieren</a>
					<p class="export-hint">Verfügbar, solange die Aufbewahrung des Rooms läuft.</p>{/if}
				<a class="secondary-link" href="/new">Neue Session</a>
			</div>
		</section>
	</main>
{:else}
<main>
	<header class="topbar">
		<div><span class="mono kicker">REMOTE CONTROL</span><strong>{current + 1} / {total}</strong></div>
		<nav><a href={`/present/${data.id}/stats`}>Stats</a><button onclick={() => (showJoin = !showJoin)}>Join</button><button aria-expanded={showSession} onclick={() => (showSession = !showSession)}>Session</button></nav>
	</header>
	{#if showSession}
		<section class="session-menu" aria-label="Session-Menü"><p>Steuerung für diese Live-Session.</p><button onclick={requestEnd}>Session beenden</button></section>
	{/if}

	{#if showJoin}
		<section class="join-sheet" aria-label="Join Drawer">
			{#if qr}<img src={qr} alt="QR zum Beitreten" width="132" height="132" />{/if}
			<div><span class="mono kicker">AUDIENCE LINK</span><p class="url">{viewerUrl}</p><p>QR kurz zeigen, Link in Chat werfen, dann wieder in die Remote zurück.</p></div>
		</section>
	{/if}

	<section class="remote-stage" aria-label="Aktuelle Folie">
		<div class="slide-meta"><span class="mono kicker">ON AIR</span><span>● {stats.currentViewers} live</span></div>
		<div class="mini-slide"><SlideView {slide} /></div>
		<div class="slide-title"><span>Folie {current + 1} von {total} · {pacing.label}</span><h1>{slide?.headline}</h1></div>
	</section>

	<section class="coach-card">
		<button class="coach-toggle" aria-expanded={showCoach} onclick={() => (showCoach = !showCoach)}><span>{showCoach ? 'Coach schließen' : 'Coach öffnen'}</span><strong>{sentiment}</strong></button>
		{#if showCoach}
			<div class="coach-body">
				<section class="signal-strip" aria-label="Live Signale">
					<article><strong>{stats.currentViewers}</strong><span>dabei</span></article>
					<article><strong>{questionCount}</strong><span>Fragen</span></article>
					<article><strong>{stats.bookmarks}</strong><span>Merker</span></article>
					<article class:hot={reopen.tone === 'hot'}><strong>{dashboard.reopenRate}%</strong><span>Re-Open</span></article>
				</section>
				<p><strong>{dashboard.engagementLabel}:</strong> Live-Signale bleiben im Coach, damit die Remote im Vortrag ruhig bleibt.</p>
				<p><strong>{reopen.label}:</strong> {reopen.detail}</p>
				<div class="spark" aria-label="Sentiment-Kurve">{#each sentimentPoints as point}<span title={`Folie ${point.label}: ${point.score}`} style={`--h:${Math.max(8, Math.min(42, 18 + point.score * 6))}px`}></span>{/each}</div>
				<div class="checklist">{#each checklist as item}<article class={item.status}><strong>{item.label}</strong><p>{item.detail}</p></article>{/each}</div>
			</div>
		{/if}
	</section>

	{#if slide.speakerNotes}<section class="notes"><span class="mono kicker">NOTES</span><p>{slide.speakerNotes}</p></section>{/if}
	{#if feed.length}<section class="feed" aria-label="Live-Feed">{#each feed as item}<p class={item.kind}><strong>{item.label}</strong><span>{item.text}</span></p>{/each}</section>{/if}

	<footer class="remote-controls">
		<button class="secondary" onclick={() => go(current - 1)} disabled={current === 0}>← Zurück</button>
		{#if current === total - 1}<button class="primary" onclick={requestEnd}>Session beenden →</button>{:else}<button class="primary" onclick={() => go(current + 1)}>Weiter</button>{/if}
	</footer>
	{#if showEndDialog}
		<div class="dialog-backdrop" role="presentation">
			<div class="end-dialog" role="dialog" aria-modal="true" aria-labelledby="end-title">
				<span class="mono kicker">SESSION BEENDEN</span>
				<h2 id="end-title">Session für alle beenden?</h2>
				<p>Alle Viewer wechseln sofort zum End-Screen. Danach kannst du Replay und Fragen noch nutzen, solange der Room vorgehalten wird.</p>
				{#if endError}<p class="end-error" role="alert">{endError}</p>{/if}
				<div class="dialog-actions">
					{#if questionCount > 0 && !questionsExported}
						<button class="dialog-primary" disabled={ending} onclick={() => endSession(true)}>{ending ? 'Beende …' : 'Exportieren und beenden'}</button>
						<button disabled={ending} onclick={() => endSession(false)}>Ohne Export beenden</button>
					{:else}
						<button class="dialog-primary" disabled={ending} onclick={() => endSession(false)}>{ending ? 'Beende …' : 'Session beenden'}</button>
					{/if}
					<button disabled={ending} onclick={() => { showEndDialog = false; endError = ''; }}>Abbrechen</button>
				</div>
			</div>
		</div>
	{/if}
</main>
{/if}

<style>
	main { min-height: 100dvh; display: flex; flex-direction: column; gap: 10px; padding: max(12px, env(safe-area-inset-top)) 14px max(112px, calc(env(safe-area-inset-bottom) + 92px)); background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 36%), var(--bg); }
	.topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px; }
	.topbar div { display: grid; gap: 2px; }
	.kicker { color: var(--muted); font-size: 10px; letter-spacing: 2.2px; }
	.topbar strong { font-size: 18px; letter-spacing: -.3px; }
	nav { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
	nav a, nav button, .coach-toggle, .secondary, .primary { border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); text-decoration: none; min-height: 44px; padding: 0 14px; font-weight: 760; }
	nav a, nav button { appearance: none; display: inline-flex; align-items: center; justify-content: center; min-width: 62px; height: 44px; padding: 0 12px; line-height: 1; font-size: 14px; letter-spacing: -.15px; white-space: nowrap; box-shadow: none; }
	.join-sheet, .remote-stage, .coach-card, .notes, .feed, .session-menu { border: 1px solid var(--hair); border-radius: var(--radius-xl); background: var(--surface); box-shadow: var(--shadow-soft); }
	.session-menu { padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.session-menu p { color: var(--muted); font-size: 12px; }
	.session-menu button { min-height: 44px; border: 1px solid var(--hair); border-radius: 999px; background: transparent; color: var(--fg); padding: 0 14px; font-weight: 760; }
	.join-sheet { display: grid; grid-template-columns: 112px 1fr; gap: 14px; align-items: center; padding: 14px; }
	.join-sheet img { width: 112px; height: 112px; border-radius: 18px; background: #fff; padding: 7px; }
	.join-sheet p { color: var(--muted); font-size: 12px; line-height: 1.4; }
	.url { color: var(--fg) !important; font-size: 13px !important; font-weight: 800; word-break: break-all; margin: 4px 0; }
	.remote-stage { padding: 12px; display: grid; gap: 10px; }
	.slide-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 12px; }
	.mini-slide { width: min(58vw, 280px); justify-self: center; aspect-ratio: 9 / 12; max-height: 30dvh; border: 1px solid var(--hair); border-radius: 22px; padding: clamp(14px, 4.5vw, 22px); display: flex; flex-direction: column; justify-content: center; overflow: hidden; background: color-mix(in srgb, var(--bg) 84%, #000); container-type: size; --fluid-eyebrow-min: 8px; --fluid-eyebrow: 2.8cqw; --fluid-gap: 2cqw; --fluid-h1-min: 18px; --fluid-h1: 8cqw; --fluid-h1-max: 32px; --fluid-metric: 17cqw; --fluid-bodygap: 2.5cqw; --fluid-body-min: 11px; --fluid-body: 3.6cqw; --fluid-body-max: 18px; }
	.slide-title span { color: var(--muted); font-size: 12px; }
	.slide-title h1 { font-size: clamp(24px, 8vw, 42px); line-height: .94; letter-spacing: -1.1px; margin-top: 4px; }
	.signal-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
	.signal-strip article { border: 1px solid var(--hair); border-radius: 18px; background: var(--surface-2); padding: 10px; }
	.signal-strip strong { display: block; font-size: 22px; letter-spacing: -.6px; }
	.signal-strip span { color: var(--muted); font-size: 10px; }
	.signal-strip article.hot { border-color: color-mix(in srgb, var(--accent) 70%, var(--hair)); }
	.coach-card { overflow: hidden; }
	.coach-toggle { width: 100%; min-height: 52px; border: 0; border-radius: 0; display: flex; justify-content: space-between; align-items: center; background: transparent; }
	.coach-body { padding: 0 14px 14px; display: grid; gap: 12px; }
	.coach-body p, .notes p, .feed p { color: var(--muted); font-size: 12px; line-height: 1.45; }
	.spark { display: flex; align-items: end; gap: 4px; height: 40px; }
	.spark span { flex: 1; height: var(--h); border-radius: 999px 999px 3px 3px; background: var(--accent); opacity: .54; }
	.checklist { display: grid; grid-template-columns: 1fr; gap: 8px; }
	.checklist article { border: 1px solid var(--hair); border-radius: 14px; padding: 10px; }
	.checklist article.good { border-color: color-mix(in srgb, var(--accent) 58%, var(--hair)); }
	.checklist strong { display: block; font-size: 12px; }
	.checklist p { margin: 3px 0 0; color: var(--muted); font-size: 11px; line-height: 1.35; }
	.notes, .feed { padding: 12px 14px; }
	.feed { max-height: 128px; overflow: auto; display: grid; gap: 6px; }
	.feed p { margin: 0; display: grid; grid-template-columns: 76px 1fr; gap: 8px; }
	.feed strong { color: var(--fg); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
	.remote-controls { position: fixed; left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 5; display: grid; grid-template-columns: .9fr 1.1fr; gap: 10px; }
	.remote-controls button { min-height: 72px; font-size: 18px; box-shadow: var(--shadow-soft); }
	.remote-controls .secondary { background: color-mix(in srgb, var(--bg) 94%, var(--fg) 6%); backdrop-filter: blur(18px); }
	.remote-controls .primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); font-size: 22px; }
	.remote-controls button:disabled { opacity: .42; }
	.dialog-backdrop { position: fixed; inset: 0; z-index: 20; display: grid; align-items: end; background: color-mix(in srgb, #000 64%, transparent); padding: 12px; }
	.end-dialog { width: min(100%, 620px); margin: 0 auto; border: 1px solid var(--hair); border-radius: 28px; background: var(--bg); padding: 20px; box-shadow: var(--shadow-soft); }
	.end-dialog h2 { margin-top: 8px; font-size: clamp(26px, 8vw, 40px); line-height: 1; letter-spacing: -1px; }
	.end-dialog p { margin-top: 12px; color: var(--muted); line-height: 1.5; }
	.end-dialog .end-error { color: var(--fg); border-left: 3px solid var(--accent); padding-left: 10px; }
	.dialog-actions { display: grid; gap: 8px; margin-top: 18px; }
	.dialog-actions button { min-height: 52px; border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); font: inherit; font-weight: 780; }
	.dialog-actions .dialog-primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
	.end-state { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
	.end-card { width: min(100%, 560px); border: 1px solid var(--hair); border-radius: 30px; background: var(--surface); box-shadow: var(--shadow-soft); padding: clamp(22px, 7vw, 38px); }
	.end-card h1 { margin-top: 10px; font-size: clamp(32px, 9vw, 54px); line-height: .96; letter-spacing: -1.6px; }
	.end-card > p { margin-top: 12px; color: var(--muted); line-height: 1.5; }
	.end-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 20px; }
	.end-stats article { border: 1px solid var(--hair); border-radius: 18px; padding: 12px; }
	.end-stats strong, .end-stats span { display: block; }
	.end-stats strong { font-size: 24px; }
	.end-stats span { margin-top: 2px; color: var(--muted); font-size: 10px; }
	.end-links { display: grid; gap: 10px; margin-top: 20px; }
	.primary-link, .secondary-link { display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 999px; text-decoration: none; font-weight: 800; }
	.primary-link { background: var(--accent); color: var(--accent-fg); }
	.secondary-link { color: var(--muted); min-height: 44px; }
	.export-link { display: flex; align-items: center; justify-content: center; min-height: 48px; text-decoration: none; }
	.export-hint { margin: 0 0 4px; font-size: 12px; color: var(--muted); text-align: center; }
	@media (max-height: 700px) { .mini-slide { width: min(50vw, 220px); max-height: 24dvh; } .slide-title h1 { font-size: clamp(22px, 7vw, 34px); } .notes, .feed { display:none; } }
	@media (min-width: 780px) { main { max-width: 780px; margin: 0 auto; } .mini-slide { max-height: 56dvh; } }
</style>
