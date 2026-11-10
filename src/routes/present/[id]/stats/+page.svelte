<script lang="ts">
	import { onMount } from 'svelte';
	import { fieldTestChecklist, liveStatsDashboard, type AudienceStats } from '$lib/stats-dashboard';
	import { liveSentimentLabel, reopenInsight, replaySentiment, applySentimentSignal, type SentimentPoint } from '$lib/polish';
	import { useI18n } from '$lib/i18n/context';

	let { data } = $props();
	const { locale, t } = useI18n();
	const initial = <T>(read: () => T): T => read();
	let stats = $state<AudienceStats>(initial(() => data.stats));
	let current = $state(initial(() => data.current));
	let sentimentPoints = $state<SentimentPoint[]>(initial(() => replaySentiment([], data.slideCount)));
	let viewerUrl = $state('');
	let dashboard = $derived(liveStatsDashboard(stats, Date.now(), locale));
	let checklist = $derived(fieldTestChecklist(stats, viewerUrl, locale));
	let reopen = $derived(reopenInsight(stats, locale));
	let sentiment = $derived(liveSentimentLabel(sentimentPoints, locale));

	onMount(() => {
		viewerUrl = `${location.origin}/v/${data.id}`;
		const es = new EventSource(`/present/${data.id}/events`);
		es.addEventListener('stats', (event) => {
			const payload = JSON.parse((event as MessageEvent).data);
			stats = payload.stats;
		});
		es.addEventListener('reaction', (event) => {
			const payload = JSON.parse((event as MessageEvent).data);
			sentimentPoints = applySentimentSignal(sentimentPoints, payload.slide, 'reaction');
		});
		es.addEventListener('question', (event) => {
			const payload = JSON.parse((event as MessageEvent).data);
			sentimentPoints = applySentimentSignal(sentimentPoints, payload.slide, 'question');
		});
		es.addEventListener('bookmark', (event) => {
			const payload = JSON.parse((event as MessageEvent).data);
			sentimentPoints = applySentimentSignal(sentimentPoints, payload.slide, 'bookmark');
		});
		es.addEventListener('ended', (event) => {
			const payload = JSON.parse((event as MessageEvent).data);
			current = payload.slide ?? current;
			es.close();
		});
		return () => es.close();
	});
</script>

<main>
	<header>
		<a href={`/present/${data.id}`}>← {t('stats.back_presenter')}</a>
		<span class="mono">{t('stats.live_room', { id: data.id })}</span>
	</header>

	<section class="hero">
		<div>
			<div class="mono tag">{t('stats.dashboard_kicker')}</div>
			<h1>{t('stats.title')}</h1>
			<p>{t('stats.meta', { presence: dashboard.presenceLabel, minutes: dashboard.durationMinutes, sentiment })}</p>
		</div>
		<a class="viewer" href={viewerUrl}>{viewerUrl || t('stats.viewer_loading')}</a>
	</section>

	<section class="kpis" aria-label={t('stats.live_metrics')}>
		<article><strong>{stats.currentViewers}</strong><span>{t('stats.live_now')}</span></article>
		<article><strong>{stats.peakConcurrent}</strong><span>{t('stats.peak')}</span></article>
		<article><strong>{stats.joins}</strong><span>{t('stats.total_joins')}</span></article>
		<article class:returning={reopen.tone !== 'quiet'}><strong>{dashboard.reopenRate}%</strong><span>{t('stats.reopen_rate')}</span></article>
		<article><strong>{dashboard.engagements}</strong><span>{t('stats.signals')}</span></article>
	</section>

	<section class="grid">
		<div class="panel">
			<h2>{t('stats.checklist')}</h2>
			{#each checklist as item}
				<div class={`check ${item.status}`}>
					<span>{item.status === 'good' ? '✓' : item.status === 'risk' ? '!' : '•'}</span>
					<div><strong>{item.label}</strong><p>{item.detail}</p></div>
				</div>
			{/each}
		</div>

		<div class="panel">
			<h2>{t('stats.engagement')}</h2>
			<div class="bars">
				<div><span style={`--w:${Math.min(100, stats.reactions * 12)}%`}></span><strong>👍 {t('replay.reactions')}</strong><em>{stats.reactions}</em></div>
				<div><span style={`--w:${Math.min(100, stats.questions * 20)}%`}></span><strong>{t('common.questions')}</strong><em>{stats.questions}</em></div>
				<div><span style={`--w:${Math.min(100, stats.bookmarks * 20)}%`}></span><strong>{t('present.bookmarks')}</strong><em>{stats.bookmarks}</em></div>
				<div><span style={`--w:${Math.min(100, stats.reopens * 18)}%`}></span><strong>{t('common.reopens')}</strong><em>{stats.reopens}</em></div>
			</div>
			<p class="summary">{reopen.label}: {reopen.detail}</p>
		</div>
	</section>
</main>

<style>
	main { min-height: 100dvh; padding: max(20px, env(safe-area-inset-top)) clamp(18px, 5vw, 48px) max(20px, env(safe-area-inset-bottom)); max-width: 1120px; margin: 0 auto; overflow-x: clip; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 14px; color: var(--muted); font-size: 12px; margin-bottom: 26px; min-width: 0; }
	a { color: var(--fg); text-decoration: none; }
	header a { min-height:44px; display:inline-flex; align-items:center; }
	header span { min-width: 0; text-align: right; overflow-wrap: anywhere; }
	.hero { display: flex; justify-content: space-between; align-items: end; gap: 18px; margin-bottom: 22px; }
	.tag { color: var(--muted); font-size: 11px; letter-spacing: 2px; }
	h1 { max-width: 760px; font-size: clamp(36px, 7vw, 72px); line-height: .95; letter-spacing: -2px; margin: 8px 0 12px; }
	p { color: var(--muted); }
	.viewer { min-width: 0; border: 1px solid var(--hair); border-radius: 999px; padding: 12px 16px; font-weight: 800; white-space: nowrap; }
	.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
	.kpis article, .panel { min-width: 0; border: 1px solid var(--hair); border-radius: 20px; padding: 16px; }
	.kpis article.returning { border-color: var(--accent); }
	.kpis strong { display: block; font-size: clamp(30px, 6vw, 56px); line-height: 1; }
	.kpis span { display: block; color: var(--muted); font-size: 12px; margin-top: 6px; }
	.grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; }
	h2 { margin: 0 0 12px; font-size: 18px; }
	.check { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 10px; border-top: 1px solid var(--hair); padding: 12px 0; }
	.check > span { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 999px; background: var(--hair); font-weight: 900; }
	.check.good > span { background: var(--accent); color: var(--accent-fg); }
	.check.risk > span { background: #ff6b6b; color: #160000; }
	.check p { margin: 4px 0 0; font-size: 13px; line-height: 1.4; }
	.bars { display: grid; gap: 12px; }
	.bars div { position: relative; display: grid; grid-template-columns: 1fr 42px; gap: 12px; align-items: center; border: 1px solid var(--hair); border-radius: 999px; padding: 9px 12px; overflow: hidden; }
	.bars div span { position: absolute; inset: 0 auto 0 0; width: var(--w); background: color-mix(in srgb, var(--accent) 18%, transparent); }
	.bars strong, .bars em { position: relative; z-index: 1; }
	.bars em { text-align: right; color: var(--muted); font-style: normal; }
	.summary { margin: 14px 0 0; font-size: 13px; line-height: 1.45; }
	@media (max-width: 820px) { .hero { align-items: start; flex-direction: column; } .viewer { white-space: normal; word-break: break-all; } .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .grid { grid-template-columns: 1fr; } }
</style>
