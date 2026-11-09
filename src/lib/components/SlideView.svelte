<script lang="ts">
	import type { Slide } from '$lib/decks';
	import { slideFitProfile } from '$lib/slide-quality';
	let { slide, revealCount = 999 }: { slide: Slide; revealCount?: number } = $props();
	let visibleReveal = $derived((slide.reveal ?? []).slice(0, revealCount));
	let fit = $derived(slideFitProfile(slide));
</script>

<div class={`slide ${fit.cssClass}`} class:fullbleed={slide.kind === 'image'} class:quote={slide.kind === 'quote'}>
	{#if slide.kind === 'image' && slide.image}
		<img class="hero" src={slide.image} alt={slide.headline} decoding="async" referrerpolicy="no-referrer" />
		<div class="scrim"></div>
	{/if}

	<div class="content">
		{#if slide.eyebrow}<div class="eyebrow">{slide.eyebrow}</div>{/if}

		{#if slide.kind === 'number'}
			<div class="metric">{slide.metric ?? slide.headline}</div>
			<h1>{slide.metric ? slide.headline : ''}</h1>
		{:else if slide.kind === 'quote'}
			<blockquote>“{slide.quote ?? slide.headline}”</blockquote>
			{#if slide.attribution}<p class="attrib">— {slide.attribution}</p>{/if}
		{:else if slide.kind === 'compare' && slide.compare}
			<h1>{slide.headline}</h1>
			<div class="compare">
				<section>
					<strong>{slide.compare.leftTitle}</strong>
					{#if slide.compare.leftBody}<span>{slide.compare.leftBody}</span>{/if}
				</section>
				<section>
					<strong>{slide.compare.rightTitle}</strong>
					{#if slide.compare.rightBody}<span>{slide.compare.rightBody}</span>{/if}
				</section>
			</div>
		{:else if slide.kind === 'timeline' && slide.timeline}
			<h1>{slide.headline}</h1>
			<ol class="timeline">
				{#each slide.timeline as item}
					<li><strong>{item.label}</strong><span>{item.text}</span></li>
				{/each}
			</ol>
		{:else}
			<h1>{slide.headline}</h1>
			{#if slide.body}<p>{slide.body}</p>{/if}
		{/if}

		{#if slide.kind !== 'image' && slide.image}<img class="inline-img" src={slide.image} alt={slide.eyebrow ?? slide.headline} loading="lazy" decoding="async" referrerpolicy="no-referrer" />{/if}
		{#if visibleReveal.length}
			<ul class="reveal">
				{#each visibleReveal as item}
					<li>{item}</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.slide {
		position: relative;
		max-width: 640px;
	}
	.slide.fullbleed {
		max-width: none;
		min-height: min(72vh, 100%);
		display: grid;
		align-items: end;
	}
	.slide.fit-standard {
		--fluid-h1: 8vw;
		--fluid-body: 3.65vw;
		--fluid-gap: 2.5vw;
		--fluid-bodygap: 3vw;
	}
	.slide.fit-dense {
		--fluid-h1: 6.8vw;
		--fluid-body: 3.1vw;
		--fluid-gap: 2vw;
		--fluid-bodygap: 2.4vw;
	}
	.content {
		position: relative;
		z-index: 1;
	}
	.eyebrow {
		font-size: clamp(var(--fluid-eyebrow-min, 10px), var(--fluid-eyebrow, 2.6vw), 13px);
		letter-spacing: 2.5px;
		color: var(--muted);
		font-weight: 600;
		margin-bottom: clamp(12px, var(--fluid-gap, 3vw), 20px);
		text-transform: uppercase;
	}
	h1 {
		font-size: clamp(var(--fluid-h1-min, 32px), var(--fluid-h1, 9vw), var(--fluid-h1-max, 64px));
		line-height: 1;
		letter-spacing: -1.2px;
		font-weight: 800;
	}
	.metric {
		font-size: clamp(56px, var(--fluid-metric, 18vw), 128px);
		line-height: 0.85;
		letter-spacing: -4px;
		font-weight: 900;
	}
	p,
	.attrib {
		margin-top: clamp(14px, var(--fluid-bodygap, 3.5vw), 22px);
		font-size: clamp(var(--fluid-body-min, 15px), var(--fluid-body, 4vw), var(--fluid-body-max, 20px));
		line-height: 1.45;
		color: var(--muted);
	}
	blockquote {
		font-size: clamp(34px, var(--fluid-h1, 9vw), 66px);
		line-height: 1.02;
		letter-spacing: -1.4px;
		font-weight: 820;
	}
	.hero {
		position: absolute;
		inset: -28px;
		width: calc(100% + 56px);
		height: calc(100% + 56px);
		object-fit: cover;
		border-radius: 22px;
	}
	.scrim {
		position: absolute;
		inset: -28px;
		background:
			linear-gradient(to top, color-mix(in srgb, var(--bg) 94%, transparent), transparent 70%),
			linear-gradient(to right, color-mix(in srgb, var(--bg) 60%, transparent), transparent 62%);
		backdrop-filter: blur(1px);
		z-index: 0;
		border-radius: 22px;
	}
	.inline-img {
		margin-top: clamp(16px, var(--fluid-bodygap, 3.5vw), 24px);
		display: block;
		max-width: 100%;
		max-height: var(--slide-img-maxh, 40vh);
		height: auto;
		border-radius: 12px;
		object-fit: contain;
	}
	.compare {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: clamp(10px, 3vw, 18px);
		margin-top: clamp(18px, 5vw, 32px);
	}
	.compare section {
		border: 1px solid var(--hair);
		border-radius: 14px;
		padding: clamp(12px, 3vw, 18px);
	}
	.compare strong,
	.timeline strong {
		display: block;
		font-size: clamp(16px, var(--fluid-body, 4vw), 22px);
		line-height: 1.15;
	}
	.compare span,
	.timeline span {
		display: block;
		margin-top: 8px;
		color: var(--muted);
		font-size: clamp(13px, 3.5vw, 17px);
		line-height: 1.35;
	}
	.timeline,
	.reveal {
		list-style: none;
		padding: 0;
		margin: clamp(18px, 5vw, 32px) 0 0;
		display: grid;
		gap: 12px;
	}
	.timeline li,
	.reveal li {
		border-left: 2px solid var(--accent);
		padding-left: 12px;
	}
	.reveal li {
		font-size: clamp(var(--fluid-body-min, 15px), var(--fluid-body, 4vw), var(--fluid-body-max, 20px));
		line-height: 1.35;
	}
</style>
