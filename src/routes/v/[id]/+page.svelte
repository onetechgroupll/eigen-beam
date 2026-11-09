<script lang="ts">
	import { onMount } from 'svelte';
	import SlideView from '$lib/components/SlideView.svelte';
	import { conversionCta } from '$lib/polish';

	let { data } = $props();
	const initial = <T>(read: () => T): T => read();
	const endCta = conversionCta('viewer-ended');
	let pin = $state('');
	let pinError = $state('');
	let unlocked = $state(initial(() => !data.needsPin));
	let slides = $state(initial(() => data.slides));
	let total = $derived(slides.length);
	let live = $state(initial(() => data.current));
	let viewing = $state(initial(() => data.current));
	let reveal = $state(999);
	let ended = $state(false);
	let showOptions = $state(false);
	let showQuestion = $state(false);
	let question = $state('');
	let behind = $derived(viewing < live);
	let slide = $derived(slides[viewing]);
	let es: EventSource | null = null;
	let lastConnect = 0;

	function applyLive(n: number) { const wasFollowing = viewing >= live; live = n; if (wasFollowing) viewing = n; reveal = 0; }
	function connect() {
		if (!unlocked) return;
		lastConnect = Date.now(); es?.close(); es = new EventSource(`/v/${data.id}/stream`);
		es.addEventListener('sync', (e) => applyLive(+(e as MessageEvent).data));
		es.addEventListener('slide', (e) => applyLive(+(e as MessageEvent).data));
		es.addEventListener('ended', () => { ended = true; es?.close(); });
	}
	function back() { if (viewing > 0) { viewing -= 1; reveal = 999; } }
	function fwd() { if (slide?.reveal && reveal < slide.reveal.length) { reveal += 1; return; } if (viewing < live) { viewing += 1; reveal = 0; } }
	function toLive() { viewing = live; reveal = 0; }
	function key(e: KeyboardEvent) {
		if (!unlocked || ended) return;
		const target = e.target as HTMLElement;
		if (target.closest('button,input,textarea,a')) return;
		if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
		if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); fwd(); }
	}
	async function event(type: string, extra: Record<string, unknown> = {}) { if (!unlocked) return; await fetch(`/v/${data.id}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, slide: viewing, ...extra }) }); }
	async function sendQuestion() { const text = question.trim(); if (!text) return; question = ''; await event('question', { text }); showQuestion = false; showOptions = false; }
	function markViewerOpen() {
		try {
			const key = `eb_seen_${data.id}`;
			if (sessionStorage.getItem(key)) event('reopen');
			else sessionStorage.setItem(key, String(Date.now()));
		} catch {
			// Storage kann in privaten Browser-Modi deaktiviert sein; Live-Sync bleibt trotzdem nutzbar.
		}
	}
	async function unlock() {
		pinError = '';
		const res = await fetch(`/api/rooms/${data.id}/pin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin }) });
		if (!res.ok) { pinError = 'Falsche PIN.'; return; }
		location.reload();
	}
	onMount(() => {
		connect(); markViewerOpen();
		const onVis = () => { if (document.visibilityState !== 'visible') return; if (Date.now() - lastConnect < 1500) return; connect(); event('reopen'); };
		document.addEventListener('visibilitychange', onVis);
		return () => { document.removeEventListener('visibilitychange', onVis); es?.close(); };
	});
</script>

<svelte:window onkeydown={key} />

{#if !unlocked}
	<main class="ended">
		<div class="mono tag">EIGEN.BEAM</div><h1>PIN erforderlich.</h1>
		<label class="sr-only" for="room-pin">PIN</label>
		<input id="room-pin" class="pin" bind:value={pin} type="password" inputmode="numeric" autocomplete="one-time-code" placeholder="PIN" onkeydown={(e) => e.key === 'Enter' && unlock()} />
		<button class="cta" onclick={unlock}>Beitreten</button>{#if pinError}<p>{pinError}</p>{/if}
	</main>
{:else if ended}
	<main class="ended">
		<div class="mono tag">{endCta.kicker}</div>
		<h1>{endCta.title}</h1>
		<p>{endCta.body}</p>
		<div class="end-actions">
			<a class="cta" href={`/replay/${data.id}`}>{endCta.primary}</a>
			<a class="cta secondary" href="/new">{endCta.secondary} →</a>
		</div>
		<p class="end-note">Content-first, live synchron, ohne Beamer.</p>
	</main>
{:else}
	<main>
		<button class="tap-zone left" aria-label="Zurück zur vorherigen Folie" onclick={back}></button>
		<button class="tap-zone right" aria-label={behind ? 'Zur Live-Folie zurück' : 'Reveal anzeigen'} onclick={fwd}></button>
		<div class="progress" aria-hidden="true">{#each slides as _, i}<span class:on={i <= live}></span>{/each}</div>
		<div class="live" class:behind>{#if behind}<button onclick={(e) => { e.stopPropagation(); toLive(); }}><span class="dot"></span> LIVE — zur aktuellen Folie</button>{:else}<span class="dot"></span> LIVE{/if}</div>
		<div class="instruction">{behind ? 'Links nachlesen · rechts zurück zur Live-Folie' : 'Links nachlesen · LIVE hält dich synchron'}</div>
		{#if slide}<section class="stage-shell"><SlideView {slide} revealCount={reveal} /></section>{/if}
		{#if !showOptions}<button class="options-trigger" aria-expanded={showOptions} onclick={(e) => { e.stopPropagation(); showOptions = true; }}>Optionen</button>{/if}
		{#if showOptions}
			<div class="viewer-actions" role="dialog" aria-label="Optionen">
				<div class="sheet-head"><span class="mono tag">SIGNAL</span><button onclick={(e) => { e.stopPropagation(); showOptions = false; showQuestion = false; }}>Schließen</button></div>
				<div class="quick-actions">
					<button onclick={(e) => { e.stopPropagation(); event('reaction', { reaction: '👍' }); }}>👍 Resoniert</button>
					<button onclick={(e) => { e.stopPropagation(); event('bookmark'); }}>Merken</button>
				</div>
				{#if showQuestion}
					<form onsubmit={(e) => { e.preventDefault(); sendQuestion(); }}><label class="sr-only" for="viewer-question">Frage an Presenter</label><input id="viewer-question" bind:value={question} onclick={(e) => e.stopPropagation()} placeholder="Frage an Presenter" maxlength="280" /><button type="submit">Senden</button></form>
				{:else}
					<button class="ask-button" onclick={(e) => { e.stopPropagation(); showQuestion = true; }}>Frage stellen</button>
				{/if}
			</div>
		{/if}
		<footer><span class="back-hint">Nachlesen bleibt privat auf deinem Phone.</span><span class="pos">{viewing + 1} / {total}</span></footer>
	</main>
{/if}

<style>
	main { position: relative; min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; padding: max(50px, env(safe-area-inset-top)) clamp(16px, 5vw, 48px) max(58px, env(safe-area-inset-bottom)); overflow: hidden; user-select: none; background: radial-gradient(circle at 50% -10%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 34%), var(--bg); }
	.progress { position: absolute; top: max(12px, env(safe-area-inset-top)); left: 16px; right: 16px; display: flex; gap: 4px; }
	.progress span { flex: 1; height: 2px; border-radius: 2px; background: var(--hair); }
	.progress span.on { background: var(--accent); }
	.live { position: absolute; top: max(26px, calc(env(safe-area-inset-top) + 14px)); right: 16px; z-index: 4; display: flex; align-items: center; gap: 5px; font-size: 9px; letter-spacing: 1.5px; font-weight: 800; color: var(--muted); }
	.live .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--live-dot); box-shadow: 0 0 18px color-mix(in srgb, var(--live-dot) 70%, transparent); }
	.live button, .cta { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--hair); background: var(--surface); color: var(--fg); font: inherit; font-size: 11px; font-weight: 800; text-decoration: none; }
	.instruction { position: absolute; top: max(54px, calc(env(safe-area-inset-top) + 42px)); left: 16px; color: color-mix(in srgb, var(--muted) 72%, transparent); font-size: 10px; letter-spacing: .2px; }
	.stage-shell { width: 100%; min-height: 64dvh; display: flex; flex-direction: column; justify-content: center; border-radius: 32px; }
	.tap-zone { position: absolute; top: 72px; bottom: 112px; width: 34%; border: 0; padding: 0; background: transparent; opacity: 0; z-index: 2; }
	.tap-zone.left { left: 0; }
	.tap-zone.right { right: 0; }
	.options-trigger { position: absolute; right: 16px; bottom: max(44px, calc(env(safe-area-inset-bottom) + 30px)); z-index: 5; min-height: 44px; padding: 0 12px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--hair) 70%, transparent); background: color-mix(in srgb, var(--bg) 52%, transparent); color: var(--muted); font-size: 12px; font-weight: 760; box-shadow: none; backdrop-filter: blur(18px); }
	.viewer-actions { position: absolute; left: 12px; right: 12px; bottom: max(104px, calc(env(safe-area-inset-bottom) + 88px)); z-index: 6; border: 1px solid var(--hair); border-radius: 28px; background: color-mix(in srgb, var(--bg) 88%, transparent); box-shadow: var(--shadow-soft); padding: 14px; display: grid; gap: 12px; backdrop-filter: blur(24px); }
	.sheet-head, .quick-actions, .viewer-actions form { display: flex; gap: 8px; align-items: center; }
	.sheet-head { justify-content: space-between; }
	.sheet-head button, .quick-actions button, .viewer-actions form button, .viewer-actions input, .ask-button { min-height: 44px; border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); padding: 0 12px; font: inherit; font-size: 12px; font-weight: 760; }
	.ask-button { width: 100%; text-align: center; }
	.quick-actions { display: grid; grid-template-columns: 1fr 1fr; }
	.viewer-actions form { display: grid; grid-template-columns: 1fr auto; }
	.viewer-actions input { width: 100%; min-width: 0; }
	footer { position: absolute; bottom: max(16px, env(safe-area-inset-bottom)); left: clamp(18px, 6vw, 56px); right: clamp(18px, 6vw, 56px); display: flex; justify-content: space-between; gap: 12px; font-size: 10px; color: color-mix(in srgb, var(--muted) 70%, transparent); }
	.pos { font-variant-numeric: tabular-nums; font-weight: 760; color: var(--fg); }

	.ended { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; gap: 12px; }
	.ended .tag, .tag { font-size: 11px; letter-spacing: 3px; color: var(--muted); }
	.ended h1 { font-size: clamp(28px, 7vw, 44px); letter-spacing: -1px; font-weight: 820; }
	.ended p { max-width: 420px; color: var(--muted); line-height: 1.5; }
	.end-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
	.cta.secondary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
	.end-note { font-size: 12px; }
	.pin { border: 1px solid var(--hair); background: var(--surface); color: var(--fg); min-height: 44px; border-radius: 999px; text-align: center; font: inherit; }
	.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
