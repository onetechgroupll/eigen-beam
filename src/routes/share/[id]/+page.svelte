<script lang="ts">
	import { goto } from '$app/navigation';
	import SlideView from '$lib/components/SlideView.svelte';
	import { conversionCta } from '$lib/polish';
	let { data } = $props();
	const cta = conversionCta('share');
	let cloning = $state(false);
	let msg = $state('');
	async function cloneDeck() {
		cloning = true; msg = '';
		try {
			const res = await fetch(`/api/decks/${data.deck.id}/clone`, { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { msg = j.message ?? 'Deck konnte nicht geklont werden.'; return; }
			await goto(`/edit/${j.id}`);
		} finally { cloning = false; }
	}
</script>

<svelte:head><title>{data.deck.title} teilen — eigen.beam</title></svelte:head>

<main>
	<header><a href="/">← eigen.beam</a><a href="/account">Meine Decks</a></header>
	<section class="hero">
		<div>
			<div class="mono tag">SHARE</div>
			<h1>{data.deck.title}</h1>
			<p>{data.deck.slides.length} Slides · {data.deck.visibility === 'team' ? 'Team sichtbar' : 'Link sichtbar'} · public-safe ohne Speaker Notes.</p>
		</div>
		<div class="hero-card">
			<span class="mono">{cta.kicker}</span>
			<strong>{cta.title}</strong>
			<p>{cta.body}</p>
			<button onclick={cloneDeck} disabled={cloning}>{cloning ? 'Kopiere …' : cta.primary}</button>
			<div class="export-links">
				<a href={`/api/decks/${data.deck.id}/export/md`}>Markdown exportieren</a>
				<a href={`/api/decks/${data.deck.id}/export/json`}>JSON exportieren</a>
			</div>
			{#if msg}<p>{msg}</p>{/if}
		</div>
	</section>
	<div class="slides">
		{#each data.deck.slides as slide, i}
			<section><span class="mono">{i + 1} / {data.deck.slides.length}</span><SlideView {slide} /></section>
		{/each}
	</div>
</main>

<style>
	main { padding:24px; max-width:1080px; margin:0 auto; }
	header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:24px; }
	a { color:var(--muted); text-decoration:none; }
	header a { min-height:44px; display:inline-flex; align-items:center; }
	.hero { display:grid; grid-template-columns:minmax(0,1fr) minmax(220px,320px); gap:18px; align-items:stretch; margin-bottom:22px; }
	.tag, .hero-card span, section > span { color:var(--muted); font-size:11px; letter-spacing:2px; }
	h1 { font-size:clamp(34px,8vw,72px); letter-spacing:-1.5px; line-height:.95; margin:0; }
	.hero p, .hero-card p { color:var(--muted); line-height:1.45; margin-top:12px; }
	.hero-card { border:1px solid var(--hair); border-radius:24px; padding:18px; display:flex; flex-direction:column; justify-content:space-between; gap:14px; background:color-mix(in srgb, var(--accent) 8%, transparent); }
	.hero-card strong { font-size:20px; line-height:1.1; }
	button { border:0; border-radius:999px; min-height:44px; padding:0 18px; background:var(--accent); color:var(--accent-fg); font-weight:800; }
	button:disabled { opacity:.55; }
	.export-links { display:flex; flex-wrap:wrap; gap:8px; }
	.export-links a { border:1px solid var(--hair); border-radius:999px; min-height:44px; padding:0 14px; display:inline-flex; align-items:center; font-size:12px; font-weight:800; color:var(--fg); }
	.slides { display:grid; gap:18px; }
	.slides section { min-height:70vh; border:1px solid var(--hair); border-radius:24px; padding:clamp(24px,6vw,56px); display:flex; flex-direction:column; justify-content:center; position:relative; overflow:hidden; box-shadow:0 24px 80px rgba(0,0,0,.06); }
	section > span { position:absolute; top:18px; right:18px; }
	@media(max-width:760px){ main{ padding:18px; } .hero{ grid-template-columns:1fr; } .hero-card{ border-radius:28px; } .slides section{ min-height:78vh; border-radius:28px; } }
</style>
