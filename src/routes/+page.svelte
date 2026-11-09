<script lang="ts">
	import { goto } from '$app/navigation';
	import { conversionCta } from '$lib/polish';

	let creating = $state(false);
	const cta = conversionCta('home');

	async function start() {
		creating = true;
		const res = await fetch('/api/rooms', { method: 'POST' });
		const { id, claimToken } = await res.json();
		const claim = await fetch(`/present/${id}/claim`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ claimToken })
		});
		if (!claim.ok) throw new Error('Presenter-Claim fehlgeschlagen');
		// Presenter-Token wird erst vom /present/:id/claim Endpoint als httpOnly-Cookie gesetzt.
		goto(`/present/${id}`);
	}
</script>

<main>
	<div class="wrap">
		<div class="mono tag">{cta.kicker}</div>
		<h1>{cta.title}</h1>
		<p>{cta.body}</p>
		<div class="contrast" aria-label="Vorher Nachher">
			<span>PDF danach schicken war gestern.</span>
			<strong>Heute folgen alle Phones live.</strong>
		</div>
		<p class="proof">No login · QR oder Link teilen · alle Phones folgen live.</p>
		<div class="cta">
			<button onclick={start} disabled={creating}>
				{creating ? 'Starte …' : `${cta.primary} →`}
			</button>
			<a class="secondary" href="/new">{cta.secondary}</a>
			<a class="secondary" href="/account">Meine Decks</a>
		</div>
	</div>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 24px;
		background: radial-gradient(circle at 50% 18%, color-mix(in srgb, var(--accent) 11%, transparent), transparent 36%), var(--bg);
	}
	.wrap {
		max-width: 460px;
		transform: translateY(-4dvh);
	}
	.tag {
		font-size: 12px;
		letter-spacing: 3px;
		color: var(--muted);
		margin-bottom: 20px;
	}
	h1 {
		font-size: clamp(34px, 9vw, 60px);
		line-height: 0.98;
		letter-spacing: -1.5px;
		font-weight: 800;
	}
	p {
		color: var(--muted);
		margin: 18px 0 12px;
		font-size: clamp(15px, 4vw, 18px);
		line-height: 1.5;
	}
	.proof {
		margin: 0 0 30px;
		font-size: 12px;
		font-weight: 760;
		letter-spacing: .2px;
		color: color-mix(in srgb, var(--muted) 82%, var(--fg));
	}
	.contrast {
		display: grid;
		gap: 6px;
		margin: 18px 0 18px;
		border: 1px solid var(--hair);
		border-radius: 22px;
		padding: 14px;
		background: color-mix(in srgb, var(--surface) 82%, transparent);
		box-shadow: var(--shadow-soft);
	}
	.contrast span, .contrast strong {
		display: block;
		font-size: 14px;
		line-height: 1.25;
	}
	.contrast span {
		color: var(--muted);
	}
	.contrast strong {
		color: var(--fg);
		font-size: 18px;
		letter-spacing: -.2px;
	}
	button {
		background: var(--accent);
		color: var(--accent-fg);
		border: 1px solid color-mix(in srgb, var(--accent) 88%, var(--fg));
		border-radius: 999px;
		padding: 16px 28px;
		min-height: 56px;
		font-weight: 700;
		font-size: 16px;
		box-shadow: var(--shadow-soft);
	}
	button:disabled {
		opacity: 0.5;
	}
	.cta {
		display: flex;
		align-items: center;
		gap: 18px;
		flex-wrap: wrap;
	}
	.secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		color: var(--fg);
		font-weight: 760;
		font-size: 13px;
		text-decoration: none;
		border: 1px solid var(--hair);
		border-radius: 999px;
		padding: 0 18px;
		background: var(--surface);
	}
</style>
