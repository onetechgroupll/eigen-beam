<script lang="ts">
	import SlideView from '$lib/components/SlideView.svelte';
	import type { ReplayEvent } from '$lib/server/rooms';
	import { buildFollowUpPack } from '$lib/follow-up-pack';
	import { buildDeckV2Draft } from '$lib/deck-v2-draft';
	import { buildSessionCoach } from '$lib/session-coach';
	import { conversionCta, liveSentimentLabel, pacingHint, reopenInsight, replaySentiment } from '$lib/polish';
	import { buildSessionSummary } from '$lib/session-summary';
	import { buildSlideHeatmap } from '$lib/slide-heatmap';
	let { data } = $props();
	const cta = conversionCta('replay');
	const initial = <T>(read: () => T): T => read();
	let current = $state(0);
	let playing = $state(false);
	let timer: ReturnType<typeof setInterval> | undefined;
	const total = initial(() => data.replay.slides.length);
	let slide = $derived(data.replay.slides[current]);
	let events: ReplayEvent[] = $derived(data.replay.events.filter((e: ReplayEvent) => e.slide === current));
	let sentiment = $derived(replaySentiment(data.replay.events, total));
	let sentimentLabel = $derived(liveSentimentLabel(sentiment));
	let pace = $derived(pacingHint(slide));
	let reopen = $derived(reopenInsight(data.replay.stats));
	let summary = $derived(buildSessionSummary(data.replay));
	let followUpPack = $derived(buildFollowUpPack(data.replay, { baseUrl: data.origin }));
	let heatmap = $derived(buildSlideHeatmap(data.replay));
	let deckV2 = $derived(buildDeckV2Draft(data.replay));
	let coach = $derived(buildSessionCoach(data.replay));
	let followEmail = $state('');
	let followState: 'idle' | 'sending' | 'done' | 'error' = $state('idle');
	let followMsg = $state('');
	let showDetails = $state(false);
	let nextAction = $derived(coach.actions[0]);

	function stop() { if (timer) clearInterval(timer); timer = undefined; playing = false; }
	function play() {
		stop(); playing = true;
		timer = setInterval(() => {
			if (current >= total - 1) return stop();
			current += 1;
		}, 1800);
	}

	async function follow(e: SubmitEvent) {
		e.preventDefault();
		if (followState === 'sending') return;
		followState = 'sending';
		followMsg = '';
		try {
			const res = await fetch('/api/follow', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: followEmail, roomId: data.replay.id })
			});
			const out = await res.json().catch(() => ({}));
			if (res.ok) {
				followState = 'done';
				followMsg = out.isNew === false ? 'Du folgst schon — alles gut.' : 'Eingetragen. Wir pingen dich.';
			} else {
				followState = 'error';
				followMsg = out.message ?? 'Hat nicht geklappt.';
			}
		} catch {
			followState = 'error';
			followMsg = 'Netzwerkfehler.';
		}
	}
</script>

<main>
	<header><a href="/">← eigen.beam</a><span class="mono">Replay {data.replay.ended ? 'abgeschlossen' : 'live snapshot'}</span></header>
	<section class="command" aria-label="Replay Command Center">
		<div><span class="mono tag">NEXT BEST ACTION</span><h1>Follow-up mailen.</h1><p>{nextAction?.label ?? 'Nächsten Talk verbessern'}: {nextAction?.detail ?? 'Summary, Heatmap und Coach bleiben in den Details.'}</p></div>
		<div class="command-actions">
			<a class="primary" href={`mailto:?subject=${encodeURIComponent(followUpPack.subject)}&body=${encodeURIComponent(followUpPack.emailBody)}`}>Follow-up mailen</a>
			<button onclick={() => document.getElementById('session-replay')?.scrollIntoView({ behavior: 'smooth' })}>Session ansehen</button>
			<button aria-expanded={showDetails} onclick={() => (showDetails = !showDetails)}>{showDetails ? 'Details schließen' : 'Details öffnen'}</button>
		</div>
	</section>
	<section class="hero">
		<div><div class="mono tag">REPLAY</div><h1>Session nochmal erleben.</h1><p>{total} Slides · Resonanz: {sentimentLabel} · aktuelle Folie ~{pace.seconds}s.</p><p><strong>{cta.title}</strong> {cta.body}</p></div>
		<a class="make" href="/new">{cta.primary} →</a>
	</section>
	<section id="summary" class="summary" aria-label="Session Summary">
		<div class="summary-head"><div><span class="mono tag">SESSION SUMMARY</span><h2>Was eigen.beam schon für dich gebaut hat.</h2></div><div class="summary-actions"><a href={`/api/replay/${data.replay.id}/summary?format=md`}>Summary exportieren</a></div></div>
		<p class="details-teaser">Details öffnen zeigt Slide Heatmap, Deck V2 Draft, Session Coach und Follow-up Pack.</p>
		<div class="summary-grid">
			<article><strong>{summary.totals.engagements}</strong><span>Signale</span></article>
			<article><strong>{summary.totals.peakConcurrent}</strong><span>Peak</span></article>
			<article><strong>{summary.totals.reopenRate}%</strong><span>Re-Open</span></article>
		</div>
		<div class="summary-copy">
			<div><h3>Was gelandet ist</h3><ul>{#each summary.whatLanded as item}<li>{item}</li>{/each}</ul></div>
			<div><h3>Nächstes Mal klären</h3><ul>{#each summary.clarifyNext as item}<li>{item}</li>{/each}</ul></div>
		</div>
		{#if summary.topSlides.length}<div class="top-slides"><h3>Top-Folien</h3>{#each summary.topSlides as item}<button onclick={() => current = item.index}>{item.label} · {item.headline}<span>{item.score}</span></button>{/each}</div>{/if}
	</section>
	{#if showDetails}
	<section class="followup" aria-label="One-Tap Follow-up Pack">
		<div><span class="mono tag">FOLLOW-UP PACK</span><h2>Ein Text für Mail oder Gruppenchat.</h2><p>Aus Summary + Replay gebaut, ohne Fragetexte oder Speaker Notes zu leaken.</p></div>
		<div class="followup-actions"><a href={`/api/replay/${data.replay.id}/followup?format=md`}>Markdown laden</a><a href={`mailto:?subject=${encodeURIComponent(followUpPack.subject)}&body=${encodeURIComponent(followUpPack.emailBody)}`}>Mail öffnen</a><a href={`/api/replay/${data.replay.id}/followup`}>JSON</a></div>
		<pre>{followUpPack.chatText}</pre>
	</section>
	<section class="heatmap" aria-label="Slide Heatmap">
		<div class="summary-head"><div><span class="mono tag">SLIDE HEATMAP</span><h2>Welche Folie wirklich gearbeitet hat.</h2></div><div class="summary-actions"><a href={`/api/replay/${data.replay.id}/heatmap?format=md`}>Markdown laden</a><a href={`/api/replay/${data.replay.id}/heatmap`}>JSON ansehen</a></div></div>
		<div class="heatmap-bars">{#each heatmap.slides as item}<button class={item.classification} onclick={() => current = item.index} title={`${item.label}: ${item.why}`}><span style={`height:${Math.max(8, item.intensity)}%`}></span><strong>{item.label}</strong><small>{item.intensity}%</small></button>{/each}</div>
		<div class="heatmap-notes"><p>{heatmap.hottest ? `Heißeste Folie: ${heatmap.hottest.label} „${heatmap.hottest.headline}“ — ${heatmap.hottest.why}.` : 'Noch keine heiße Folie.'}</p><p>{heatmap.confusing ? `Meiste Fragen: ${heatmap.confusing.label} „${heatmap.confusing.headline}“ — beim nächsten Mal früher kontextualisieren.` : 'Keine Frage-Häufung sichtbar.'}</p></div>
	</section>
	<section class="deckv2" aria-label="Deck V2 Draft">
		<div><span class="mono tag">DECK V2 DRAFT</span><h2>Aus der Session ein besseres Folge-Deck.</h2><p>Guardrailed: nutzt nur öffentliche Slides und aggregierte Signale — keine Fragetexte, keine Speaker Notes.</p></div>
		<div class="deckv2-actions"><a href={`/api/replay/${data.replay.id}/deck-v2?format=md`}>V2 Markdown laden</a><a href={`/api/replay/${data.replay.id}/deck-v2`}>JSON ansehen</a></div>
		<ul>{#each deckV2.changes as change}<li><strong>{change.label}</strong><span>{change.kind}</span>{change.detail}</li>{/each}</ul>
	</section>
	<section id="coach" class="coach" aria-label="Session Coach">
		<div class="summary-head"><div><span class="mono tag">SESSION COACH</span><h2>Was du vor dem nächsten Talk tun solltest.</h2></div><div class="summary-actions"><a href={`/api/replay/${data.replay.id}/coach?format=md`}>Markdown laden</a><a href={`/api/replay/${data.replay.id}/coach`}>JSON ansehen</a></div></div>
		<ol>{#each coach.actions as action}<li class={action.priority}><span>{action.priority}</span><strong>{action.label}</strong><p>{action.detail}</p></li>{/each}</ol>
	</section>
	{/if}
	<section id="session-replay" class="stage">
		<div class="phone-wrap">
			<div class="rail">{#each data.replay.slides as _, i}<button class:on={i === current} onclick={() => current = i} aria-label={`Folie ${i + 1}`}></button>{/each}</div>
			<div class="phone"><SlideView {slide} /></div>
		</div>
		<aside>
			<div class="now"><span class="mono">FOLIE {current + 1} / {total}</span><strong>{slide?.headline}</strong><small>{pace.label} · ~{pace.seconds}s</small></div>
			<div class="actions"><button onclick={() => current = Math.max(0, current - 1)}>‹</button><button onclick={playing ? stop : play}>{playing ? 'Pause' : 'Play'}</button><button onclick={() => current = Math.min(total - 1, current + 1)}>›</button></div>
			<div class="takeaway"><strong>Takeaway</strong><p>Gemerkte Folien als Clip exportieren.</p><a href={`/api/replay/${data.replay.id}/takeaway?format=md`}>Markdown laden</a><a href={`/api/replay/${data.replay.id}/takeaway`}>JSON ansehen</a></div>
			<h2>Sentiment</h2>
			<div class="spark" aria-label="Sentiment-Kurve">{#each sentiment as point, i}<button class:on={i === current} onclick={() => current = i} title={`Folie ${point.label}: ${point.score}`} style={`--h:${Math.max(8, Math.min(50, 18 + point.score * 6))}px`}><span></span></button>{/each}</div>
			<h2>Timeline</h2>
			<ul>{#each events as e}<li><code>{e.type}</code>{#if e.type === 'question'}: Frage gestellt{:else if e.type === 'reaction'}: {e.reaction}{/if}</li>{/each}</ul>
			<h2>Stats</h2>
			<div class="cards"><span>{data.replay.stats.joins}<small>Joins</small></span><span>{data.replay.stats.reopens}<small>Re-Opens · {reopen.rate}%</small></span><span>{data.replay.stats.reactions}<small>Reaktionen</small></span><span>{data.replay.stats.questions}<small>Fragen</small></span><span>{data.replay.stats.bookmarks}<small>Merker</small></span></div>
			<p class="reopen-summary">{reopen.label}: {reopen.detail}</p>
			<h2 id="follow-save">Replay & Summary sichern</h2>
			<p class="save-copy">Replay, Summary und Follow-up sind jetzt fertig. E-Mail eintragen, damit du sie wiederfindest.</p>
			{#if followState === 'done'}
				<p class="follow-ok">{followMsg}</p>
			{:else}
				<form class="follow" onsubmit={follow}>
					<input type="email" bind:value={followEmail} placeholder="deine@email.de" required aria-label="Email für Follow" />
					<button type="submit" disabled={followState === 'sending'}>{followState === 'sending' ? '…' : 'Replay sichern'}</button>
				</form>
				{#if followState === 'error'}<p class="follow-err">{followMsg}</p>{/if}
			{/if}
		</aside>
	</section>
</main>

<style>
	main { min-height: 100dvh; padding: 24px; max-width: 1120px; margin: 0 auto; }
	header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:24px; }
	a { color: var(--muted); text-decoration: none; }
	header a { min-height:44px; display:inline-flex; align-items:center; }
	.command { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:16px; align-items:end; border:1px solid var(--hair); border-radius:32px; padding:20px; margin-bottom:18px; background: radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent) 14%, transparent), transparent 42%), var(--surface); box-shadow: var(--shadow-soft); }
	.command h1 { margin:5px 0 8px; font-size:clamp(34px,8vw,64px); line-height:.92; letter-spacing:-1.6px; max-width:760px; }
	.command p { color:var(--muted); line-height:1.45; max-width:620px; }
	.command-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:flex-start; }
	.command-actions button, .command-actions a { min-height:44px; border:1px solid var(--hair); border-radius:999px; padding:0 14px; background:var(--bg); color:var(--fg); font-weight:800; }
	.command-actions .primary { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
	.hero { display:flex; justify-content:space-between; gap:18px; align-items:end; margin-bottom:22px; }
	.hero h1 { font-size:clamp(34px,7vw,68px); line-height:.95; letter-spacing:-1.5px; margin:4px 0 10px; }
	.hero p, .tag { color:var(--muted); }
	.make { border:1px solid var(--hair); border-radius:999px; padding:12px 18px; color:var(--fg); font-weight:800; white-space:nowrap; }
	.stage { display:grid; gap:24px; grid-template-columns: minmax(240px, 420px) 1fr; align-items:start; }
	@media(max-width:800px){ .stage{ grid-template-columns:1fr; } .command{ grid-template-columns:1fr; align-items:start; } .command-actions{ justify-content:flex-start; } .hero{ align-items:start; flex-direction:column; } .summary-head{ flex-direction:column; } .summary-actions{ justify-content:flex-start; } .summary-copy{ grid-template-columns:1fr; } .followup{ grid-template-columns:1fr; } .followup-actions{ justify-content:flex-start; } .heatmap-bars{ overflow-x:auto; padding-bottom:4px; } .heatmap-bars button{ min-width:58px; } .heatmap-notes{ grid-template-columns:1fr; } .deckv2{ grid-template-columns:1fr; } .deckv2-actions{ justify-content:flex-start; } .deckv2 ul{ grid-template-columns:1fr; } .coach ol{ grid-template-columns:1fr; } }
	.phone-wrap { display:grid; grid-template-columns:24px 1fr; gap:12px; align-items:stretch; }
	.rail { display:flex; flex-direction:column; gap:5px; justify-content:center; }
	.rail button { flex:1; min-height:14px; padding:0; border-radius:999px; background:var(--hair); }
	.rail button.on { background:var(--accent); }
	.phone { aspect-ratio: 9/16; border:1px solid var(--hair); border-radius:28px; padding:28px; display:flex; flex-direction:column; justify-content:center; overflow:hidden; }
	aside { border:1px solid var(--hair); border-radius:24px; padding:24px; }
	.now { display:flex; flex-direction:column; gap:5px; margin-bottom:14px; }
	.now span, .now small { color:var(--muted); }
	.now strong { font-size:24px; line-height:1.05; }
	.actions { display:flex; gap:8px; margin:16px 0; }
	button { border:1px solid var(--hair); background:transparent; color:var(--fg); border-radius:999px; padding:10px 16px; font-weight:800; }
	.summary { border:1px solid var(--hair); border-radius:24px; padding:18px; margin-bottom:22px; }
	.summary-head { display:flex; justify-content:space-between; gap:16px; align-items:start; margin-bottom:14px; }
	.summary h2 { margin:4px 0 0; font-size:clamp(24px,4vw,38px); line-height:1; letter-spacing:-.8px; }
	.summary-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:flex-start; }
	.summary-actions a, .top-slides button { border:1px solid var(--hair); border-radius:999px; padding:8px 12px; color:var(--fg); font-weight:800; font-size:12px; background:transparent; }
	.summary-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin-bottom:14px; }
	.summary-grid article { border:1px solid var(--hair); border-radius:16px; padding:12px; }
	.summary-grid strong { display:block; font-size:30px; line-height:1; }
	.summary-grid span { display:block; color:var(--muted); font-size:11px; margin-top:4px; }
	.summary-copy { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
	.details-teaser { margin:0 0 14px; color:var(--muted); font-size:13px; line-height:1.4; }
	.summary-copy h3, .top-slides h3 { margin:0 0 8px; font-size:13px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); }
	.summary-copy ul { margin:0; padding-left:18px; color:var(--fg); }
	.summary-copy li { margin-bottom:6px; line-height:1.35; }
	.top-slides { margin-top:14px; display:flex; gap:8px; flex-wrap:wrap; }
	.top-slides h3 { width:100%; }
	.top-slides button span { margin-left:8px; color:var(--accent); }
	.followup { border:1px solid var(--hair); border-radius:24px; padding:18px; margin-bottom:22px; display:grid; grid-template-columns: minmax(0,1fr) minmax(220px,.65fr); gap:14px; align-items:start; }
	.followup h2 { margin:4px 0 8px; font-size:clamp(22px,3.6vw,34px); line-height:1; letter-spacing:-.7px; }
	.followup p { margin:0; color:var(--muted); }
	.followup-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:flex-start; }
	.followup-actions a { border:1px solid var(--hair); border-radius:999px; padding:8px 12px; color:var(--fg); font-weight:800; font-size:12px; }
	.followup pre { grid-column: 1 / -1; margin:0; border:1px solid var(--hair); border-radius:16px; padding:12px; white-space:pre-wrap; overflow-wrap:anywhere; max-width:100%; overflow:auto; color:var(--muted); font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
	.heatmap { border:1px solid var(--hair); border-radius:24px; padding:18px; margin-bottom:22px; }
	.heatmap-bars { display:flex; align-items:end; gap:8px; min-height:132px; margin:12px 0; }
	.heatmap-bars button { flex:1; min-width:32px; height:132px; padding:8px 4px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:5px; border-radius:16px; }
	.heatmap-bars span { width:100%; max-width:28px; min-height:8px; border-radius:999px 999px 5px 5px; background:var(--hair); }
	.heatmap-bars .warm span { background:#d7ff73; opacity:.65; }
	.heatmap-bars .hot span { background:var(--accent); }
	.heatmap-bars .confusing span { background:#ffcf66; }
	.heatmap-bars strong { font-size:12px; }
	.heatmap-bars small { color:var(--muted); font-size:10px; }
	.heatmap-notes { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
	.heatmap-notes p { margin:0; border:1px solid var(--hair); border-radius:16px; padding:12px; color:var(--muted); }
	.deckv2 { border:1px solid var(--hair); border-radius:24px; padding:18px; margin-bottom:22px; display:grid; grid-template-columns:minmax(0,1fr) auto; gap:14px; }
	.deckv2 h2 { margin:4px 0 8px; font-size:clamp(22px,3.6vw,34px); line-height:1; letter-spacing:-.7px; }
	.deckv2 p { margin:0; color:var(--muted); }
	.deckv2-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; align-items:flex-start; }
	.deckv2-actions a { border:1px solid var(--hair); border-radius:999px; padding:8px 12px; color:var(--fg); font-weight:800; font-size:12px; }
	.deckv2 ul { grid-column:1 / -1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:0; padding:0; list-style:none; }
	.deckv2 li { border:1px solid var(--hair); border-radius:16px; padding:12px; color:var(--muted); line-height:1.35; }
	.deckv2 li strong { display:block; color:var(--fg); }
	.deckv2 li span { display:inline-block; margin:4px 0 6px; color:var(--accent); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
	.coach { border:1px solid var(--hair); border-radius:24px; padding:18px; margin-bottom:22px; }
	.coach ol { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; list-style:none; margin:0; padding:0; }
	.coach li { border:1px solid var(--hair); border-radius:16px; padding:12px; }
	.coach li.high { border-color: color-mix(in srgb, var(--accent), var(--hair) 45%); }
	.coach li span { color:var(--accent); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
	.coach li strong { display:block; margin:5px 0; }
	.coach li p { margin:0; color:var(--muted); font-size:13px; line-height:1.35; }
	.takeaway { border:1px solid var(--hair); border-radius:16px; padding:12px; margin:12px 0 18px; }
	.takeaway strong { display:block; margin-bottom:4px; }
	.takeaway p { margin:0 0 10px; color:var(--muted); font-size:13px; }
	.takeaway a { display:inline-flex; margin-right:8px; border:1px solid var(--hair); border-radius:999px; padding:8px 12px; color:var(--fg); font-weight:800; font-size:12px; }
	.spark { display:flex; align-items:end; gap:5px; height:58px; margin:8px 0 16px; }
	.spark button { flex:1; height:100%; display:flex; align-items:end; padding:0; border:0; border-radius:8px; background:transparent; }
	.spark span { display:block; width:100%; height:var(--h); border-radius:999px 999px 3px 3px; background:var(--accent); opacity:.42; }
	.spark button.on span { opacity:1; }
	.cards { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; }
	.cards span { border:1px solid var(--hair); border-radius:14px; padding:10px; font-size:22px; font-weight:800; }
	.cards small { display:block; margin-top:3px; color:var(--muted); font-size:10px; font-weight:600; }
	.reopen-summary { color: var(--muted); font-size: 13px; margin: 8px 0 14px; }
	.save-copy { color: var(--muted); font-size: 13px; line-height: 1.4; margin: -4px 0 8px; }
	ul { padding-left: 18px; color: var(--muted); }
	.follow { display:flex; gap:8px; margin-top:8px; }
	.follow input { flex:1; min-width:0; border:1px solid var(--hair); background:transparent; color:var(--fg); border-radius:999px; padding:10px 16px; }
	.follow-ok { color: var(--accent, #b6ff3a); }
	.follow-err { color: #ff6b6b; }
	@media(max-width:800px){
		main{ padding:18px; }
		.command,.summary,.followup,.heatmap,.deckv2,.coach,aside{ border-radius:28px; padding:20px; }
		.command,.followup,.deckv2{ grid-template-columns:1fr; }
		.command-actions,.summary-actions,.followup-actions,.deckv2-actions{ justify-content:flex-start; }
		.command-actions button,.command-actions a,.summary-actions a,.followup-actions a,.deckv2-actions a{ min-height:44px; display:inline-flex; align-items:center; }
		.summary-head{ flex-direction:column; }
		.summary-copy,.heatmap-notes{ grid-template-columns:1fr; }
		.deckv2 ul{ grid-template-columns:repeat(2,minmax(0,1fr)); }
		.coach ol{ grid-template-columns:repeat(2,minmax(0,1fr)); }
		.deckv2 li,.coach li{ overflow-wrap:anywhere; }
		.stage{ grid-template-columns:1fr; }
		.phone-wrap{ max-width:480px; margin:0 auto; }
		.cards{ grid-template-columns:repeat(3,minmax(0,1fr)); }
		.follow{ flex-direction:column; }
		.follow input,.follow button{ width:100%; min-height:44px; }
	}
	@media(max-width:430px){
		main{ padding:14px; }
		.command h1,.hero h1{ font-size:clamp(32px,11vw,46px); }
		.summary-grid,.cards{ grid-template-columns:repeat(3,minmax(0,1fr)); }
		.deckv2 ul,.coach ol{ grid-template-columns:1fr 1fr; }
		.heatmap-bars button{ min-width:56px; }
	}
</style>
