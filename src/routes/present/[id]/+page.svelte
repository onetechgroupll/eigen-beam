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
	let stats = $state(initial(() => data.stats));
	let feed = $state<PresenterFeedItem[]>([]);
	let sentimentPoints = $state<SentimentPoint[]>(initial(() => replaySentiment([], data.slides.length)));
	let showJoin = $state(false);
	let showCoach = $state(false);
	const total = initial(() => data.slides.length);
	let slide = $derived(data.slides[current]);
	let pacing = $derived(pacingHint(slide));
	let sentiment = $derived(liveSentimentLabel(sentimentPoints));
	let reopen = $derived(reopenInsight(stats));
	let dashboard = $derived(liveStatsDashboard(stats));
	let checklist = $derived(fieldTestChecklist(stats, viewerUrl));

	async function go(n: number) {
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

	onMount(() => {
		viewerUrl = `${location.origin}/v/${data.id}`;
		QRCode.toDataURL(viewerUrl, { margin: 1, width: 320 }).then((d) => (qr = d));
		window.addEventListener('keydown', key);
		const es = new EventSource(`/present/${data.id}/events`);
		es.addEventListener('stats', (e) => { const j = JSON.parse((e as MessageEvent).data); stats = j.stats; });
		es.addEventListener('reaction', (e) => { const j = JSON.parse((e as MessageEvent).data); signal(j.slide, 'reaction'); push(presenterFeedItem({ type: 'reaction', reaction: j.reaction, slide: j.slide, ts: j.ts })); });
		es.addEventListener('question', (e) => { const j = JSON.parse((e as MessageEvent).data); signal(j.slide, 'question'); push(presenterFeedItem({ type: 'question', text: j.text, slide: j.slide, ts: j.ts })); });
		es.addEventListener('bookmark', (e) => { const j = JSON.parse((e as MessageEvent).data); signal(j.slide, 'bookmark'); push(presenterFeedItem({ type: 'bookmark', slide: j.slide, ts: j.ts })); });
		return () => { window.removeEventListener('keydown', key); es.close(); };
	});
</script>

<main>
	<header class="topbar">
		<div><span class="mono kicker">REMOTE CONTROL</span><strong>{current + 1} / {total}</strong></div>
		<nav><a href={`/present/${data.id}/stats`}>Stats</a><button onclick={() => (showJoin = !showJoin)}>Join</button></nav>
	</header>

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
					<article><strong>{stats.questions}</strong><span>Fragen</span></article>
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
		<button class="primary" onclick={() => go(current + 1)} disabled={current === total - 1}>Weiter</button>
	</footer>
</main>

<style>
	main { min-height: 100dvh; display: flex; flex-direction: column; gap: 10px; padding: max(12px, env(safe-area-inset-top)) 14px max(112px, calc(env(safe-area-inset-bottom) + 92px)); background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 36%), var(--bg); }
	.topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px; }
	.topbar div { display: grid; gap: 2px; }
	.kicker { color: var(--muted); font-size: 10px; letter-spacing: 2.2px; }
	.topbar strong { font-size: 18px; letter-spacing: -.3px; }
	nav { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
	nav a, nav button, .coach-toggle, .secondary, .primary { border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); text-decoration: none; min-height: 44px; padding: 0 14px; font-weight: 760; }
	nav a, nav button { appearance: none; display: inline-flex; align-items: center; justify-content: center; min-width: 62px; height: 44px; padding: 0 12px; line-height: 1; font-size: 14px; letter-spacing: -.15px; white-space: nowrap; box-shadow: none; }
	.join-sheet, .remote-stage, .coach-card, .notes, .feed { border: 1px solid var(--hair); border-radius: var(--radius-xl); background: var(--surface); box-shadow: var(--shadow-soft); }
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
	@media (max-height: 700px) { .mini-slide { width: min(50vw, 220px); max-height: 24dvh; } .slide-title h1 { font-size: clamp(22px, 7vw, 34px); } .notes, .feed { display:none; } }
	@media (min-width: 780px) { main { max-width: 780px; margin: 0 auto; } .mini-slide { max-height: 56dvh; } }
</style>
