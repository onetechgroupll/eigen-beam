<script lang="ts">
	import { goto } from '$app/navigation';
	import SlideView from '$lib/components/SlideView.svelte';
	import { conversionCta, pacingHint } from '$lib/polish';
	let { data } = $props();
	const cta = conversionCta('recap');
	let totalSeconds = $derived(data.deck.slides.reduce((sum, slide) => sum + pacingHint(slide).seconds, 0));
	let email = $state('');
	let followMsg = $state('');
	async function clone() {
		const res = await fetch(`/api/decks/${data.deck.id}/clone`, { method: 'POST' });
		if (res.ok) { const j = await res.json(); goto(`/edit/${j.id}`); }
	}
	async function follow() {
		followMsg = '';
		const res = await fetch('/api/follow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, deckId: data.deck.id }) });
		followMsg = res.ok ? 'Gespeichert — wir pingen dich beim nächsten Deck.' : 'Konnte Follow nicht speichern.';
	}
</script>

<main>
	<header><a href="/">← eigen.beam</a><button onclick={clone}>Deck klonen →</button></header>
	<section class="hero">
		<div>
			<div class="mono tag">RECAP</div>
			<h1>{data.deck.title}</h1>
			<p>{data.deck.slides.length} Slides · ca. {Math.max(1, Math.round(totalSeconds / 60))} Min. Lese-/Talk-Zeit · vertikal fürs Phone.</p>
		</div>
		<div class="hero-card">
			<span class="mono">{cta.kicker}</span>
			<strong>{cta.title}</strong>
			<p>{cta.body}</p>
			<button onclick={clone}>{cta.primary}</button>
		</div>
	</section>
	<form class="follow" onsubmit={(e) => { e.preventDefault(); follow(); }}>
		<label>Ping mich beim nächsten Mal <input bind:value={email} type="email" placeholder="du@example.com" /></label>
		<button>Folgen</button>
		{#if followMsg}<span>{followMsg}</span>{/if}
	</form>
	<div class="slides">
		{#each data.deck.slides as slide, i}
			<section><span class="mono">{i + 1} / {data.deck.slides.length} · ~{pacingHint(slide).seconds}s</span><SlideView {slide} /></section>
		{/each}
	</div>
</main>

<style>
	main { padding: 24px; max-width: 1080px; margin: 0 auto; }
	header { display: flex; justify-content: space-between; align-items: center; gap:12px; margin-bottom: 24px; }
	a { color: var(--muted); text-decoration: none; }
	header a { min-height:44px; display:inline-flex; align-items:center; }
	button { border: 0; border-radius: 999px; min-height:44px; padding: 0 18px; background: var(--accent); color: var(--accent-fg); font-weight: 800; }
	.hero { display:grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 320px); gap:18px; align-items:stretch; margin-bottom:22px; }
	.hero p { color:var(--muted); line-height:1.45; margin-top:12px; }
	.hero-card { border:1px solid var(--hair); border-radius:24px; padding:18px; display:flex; flex-direction:column; justify-content:space-between; gap:14px; background: color-mix(in srgb, var(--accent) 8%, transparent); }
	.hero-card span, .tag { color:var(--muted); font-size:11px; letter-spacing:2px; }
	.hero-card strong { font-size:20px; line-height:1.1; }
	.hero-card p { color:var(--muted); font-size:13px; line-height:1.35; margin:0; }
	.follow { display:grid; grid-template-columns:1fr auto; align-items:end; gap:10px; border:1px solid var(--hair); border-radius:18px; padding:14px; margin-bottom:22px; }
	.follow label { display:grid; gap:8px; color:var(--muted); font-size:13px; }
	.follow input { width:100%; min-height:44px; border:1px solid var(--hair); border-radius:999px; background:transparent; color:var(--fg); padding:0 14px; font:inherit; }
	.follow span { color:var(--muted); font-size:12px; }
	h1 { font-size: clamp(34px, 8vw, 72px); letter-spacing: -1.5px; line-height:.95; margin: 0; }
	.slides { display: grid; gap: 18px; }
	.slides section { min-height: 70vh; border: 1px solid var(--hair); border-radius: 24px; padding: clamp(24px, 6vw, 56px); display: flex; flex-direction: column; justify-content: center; position: relative; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,.06); }
	section > span { position: absolute; top: 18px; right: 18px; color: var(--muted); font-size: 11px; letter-spacing: 1px; }
	@media(max-width:760px){ main{ padding:18px; } .hero{ grid-template-columns:1fr; } .hero-card{ border-radius:28px; } .follow{ grid-template-columns:1fr; border-radius:24px; } .follow button{ width:100%; } .slides section{ min-height:78vh; border-radius:28px; } }
</style>
