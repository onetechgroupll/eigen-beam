<script lang="ts">
	import { goto } from '$app/navigation';
	type DeckVisibility = 'private' | 'link' | 'team';

	let { data } = $props();
	type DeckItem = typeof data.decks[number];
	const initial = <T>(read: () => T): T => read();
	let decks = $state<DeckItem[]>(initial(() => data.decks));
	let teamDecks = $state<DeckItem[]>(initial(() => data.teamDecks));
	let email = $state('');
	let sending = $state(false);
	let deleting = $state('');
	let sharing = $state('');
	let cloning = $state('');
	let starting = $state('');
	let expandedDeck = $state('');
	let librarySection = $state<HTMLElement | null>(null);
	let libraryHighlighted = $state(false);
	let msg = $state('');
	let err = $state(false);
	let libraryHighlightTimer: ReturnType<typeof setTimeout> | undefined;

	function formatDate(ts: number): string {
		return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
	}

	function visibilityLabel(visibility: DeckVisibility): string {
		if (visibility === 'link') return 'Link sichtbar';
		if (visibility === 'team') return 'Team sichtbar';
		return 'Privat';
	}

	function openLibrary() {
		librarySection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		librarySection?.focus({ preventScroll: true });
		libraryHighlighted = true;
		if (libraryHighlightTimer) clearTimeout(libraryHighlightTimer);
		libraryHighlightTimer = setTimeout(() => { libraryHighlighted = false; }, 1400);
		if (location.hash !== '#library-remote') history.replaceState(null, '', '#library-remote');
	}

	async function login() {
		err = false; msg = ''; sending = true;
		try {
			const res = await fetch('/api/auth/magic-link', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Login-Link konnte nicht gesendet werden.'; return; }
			msg = j.magicLink ? `Login-Link: ${j.magicLink}` : 'Login-Link gesendet. Öffne ihn auf diesem Gerät, um deine Decks zu übernehmen.';
		} finally { sending = false; }
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await goto('/account');
	}

	async function deleteDeck(id: string, title: string) {
		if (deleting || !confirm(`„${title || 'Unbenanntes Deck'}" wirklich löschen?`)) return;
		deleting = id; err = false; msg = '';
		try {
			const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				err = true; msg = j.message ?? 'Deck konnte nicht gelöscht werden.'; return;
			}
			decks = decks.filter((deck) => deck.id !== id);
			msg = 'Deck gelöscht.';
		} finally { deleting = ''; }
	}

	function handleVisibilityChange(id: string, event: Event) {
		const visibility = (event.currentTarget as HTMLSelectElement).value as DeckVisibility;
		updateSharing(id, visibility);
	}

	async function updateSharing(id: string, visibility: DeckVisibility) {
		sharing = id; err = false; msg = '';
		try {
			const res = await fetch(`/api/decks/${id}/sharing`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ visibility })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Sharing konnte nicht geändert werden.'; return; }
			decks = decks.map((deck) => deck.id === id ? j.deck : deck);
			msg = `Sichtbarkeit: ${visibilityLabel(j.deck.visibility)}.`;
		} finally { sharing = ''; }
	}

	async function cloneDeck(id: string) {
		cloning = id; err = false; msg = '';
		try {
			const res = await fetch(`/api/decks/${id}/clone`, { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Deck konnte nicht geklont werden.'; return; }
			await goto(`/edit/${j.id}`);
		} finally { cloning = ''; }
	}

	async function startDeck(id: string) {
		starting = id; err = false; msg = '';
		try {
			const res = await fetch('/api/rooms', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ deckId: id })
			});
			const out = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = out.message ?? 'Live-Session konnte nicht gestartet werden.'; return; }
			const claim = await fetch(`/present/${out.id}/claim`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ claimToken: out.claimToken })
			});
			if (!claim.ok) { err = true; msg = 'Presenter-Zugriff konnte nicht gesetzt werden.'; return; }
			await goto(`/present/${out.id}`);
		} finally { starting = ''; }
	}
</script>

<svelte:head><title>Meine Decks — eigen.beam</title></svelte:head>

<main>
	<header>
		<a class="mono tag" href="/">← EIGEN.BEAM</a>
		<a class="new" href="/new">Neues Deck</a>
	</header>

	<section class="hero">
		<div>
			<div class="mono eyebrow">ACCOUNT</div>
			<h1>Deine Präsentationen.</h1>
			<p>{data.session ? `Angemeldet als ${data.session.email}.` : 'Diese Decks gehören schon dir. Magic-Link sichert deine Library dauerhaft, ohne den schnellen Live-Start zu blockieren.'}</p>
			<div class="hero-actions"><a class="primary-link" href="/new">Import Deck</a><button class="ghost-link" type="button" onclick={openLibrary}>Library öffnen</button></div>
		</div>
	</section>

	{#if data.auth === 'ok'}
		<p class="notice">Angemeldet. {data.claimed > 0 ? `${data.claimed} Deck${data.claimed === 1 ? '' : 's'} übernommen.` : 'Keine neuen lokalen Decks zu übernehmen.'}</p>
	{:else if data.auth === 'invalid'}
		<p class="notice err">Login-Link ungültig oder abgelaufen.</p>
	{/if}

	<section id="library-remote" class="library" class:highlight={libraryHighlighted} bind:this={librarySection} tabindex="-1">
		<div class="library-head">
			<div><span class="mono eyebrow">LIBRARY REMOTE</span><h2>Eigene Decks</h2></div>
			<span>{decks.length} Deck{decks.length === 1 ? '' : 's'}</span>
		</div>
		{#if decks.length === 0}
			<div class="empty">
				<h3>Noch kein gespeichertes Deck.</h3>
				<p>Importiere PDF/PPTX/Voice oder starte mit einem Template. Das erste Deck wird automatisch diesem Gerät zugeordnet.</p>
				<a href="/new">Import Deck →</a>
			</div>
		{:else}
			<div class="cards">
				{#each decks as deck}
					<article class="deck-card">
						<div>
							<span class="mono">{deck.slideCount} Slides · {visibilityLabel(deck.visibility)}</span>
							<h3>{deck.title}</h3>
							<p>Aktualisiert {formatDate(deck.updatedAt)}</p>
						</div>
						<div class="quickstart">
							<button class="live" disabled={starting === deck.id} onclick={() => startDeck(deck.id)}>{starting === deck.id ? 'Starte …' : 'Live starten →'}</button>
							{#if deck.editUrl}<a href={deck.editUrl}>Bearbeiten</a>{/if}
						</div>
						<div class="sharing">
							<label>Sichtbarkeit
								<select value={deck.visibility} disabled={sharing === deck.id} onchange={(e) => handleVisibilityChange(deck.id, e)}>
									<option value="private">Privat</option>
									<option value="link">Link sichtbar</option>
									{#if data.profile}<option value="team">Team sichtbar</option>{/if}
								</select>
							</label>
							<button class="more" aria-expanded={expandedDeck === deck.id} onclick={() => (expandedDeck = expandedDeck === deck.id ? '' : deck.id)}>{expandedDeck === deck.id ? 'Weniger' : 'Mehr'}</button>
						</div>
						{#if expandedDeck === deck.id}
							<div class="actions deck-details" aria-label={`Mehr Aktionen für ${deck.title}`}>
								<a class="secondary" href={deck.shareUrl}>Share</a>
								<a class="secondary" href={deck.recapUrl}>Recap</a>
								<a class="secondary" href={`/api/decks/${deck.id}/export/md`}>Export .md</a>
								<a class="secondary" href={`/api/decks/${deck.id}/export/json`}>Export .json</a>
								<button class="danger" disabled={deleting === deck.id} onclick={() => deleteDeck(deck.id, deck.title)}>{deleting === deck.id ? 'Lösche …' : 'Löschen'}</button>
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="auth-card account-claim">
		{#if data.session && data.profile}
			<span class="mono">ANGEMELDET</span>
			<strong>{data.profile.email}</strong>
			<p>Team-light: <b>{data.profile.teamLabel}</b>. Decks mit „Team sichtbar" erscheinen für Accounts derselben Email-Domain.</p>
			<button class="ghost" onclick={logout}>Abmelden</button>
		{:else}
			<span class="mono">LIBRARY SICHERN</span>
			<strong>Behalte deine Decks, auch wenn du das Gerät wechselst.</strong>
			<p>Du hast schon Wert aufgebaut. Sende dir einen Magic-Link, um diese Library dauerhaft zu sichern.</p>
			<form onsubmit={(e) => { e.preventDefault(); login(); }}>
				<input bind:value={email} type="email" placeholder="du@example.com" required />
				<button disabled={sending}>{sending ? 'Sende …' : 'Library sichern'}</button>
			</form>
		{/if}
		{#if msg}<p class="msg" class:err>{msg}</p>{/if}
	</section>

	{#if data.profile}
		<section class="library">
			<div class="library-head">
				<h2>Team {data.profile.teamLabel}</h2>
				<span>{teamDecks.length} freigegeben</span>
			</div>
			{#if teamDecks.length === 0}
				<div class="empty compact"><h3>Noch keine Team-Decks.</h3><p>Wenn jemand mit derselben Email-Domain ein Deck auf „Team sichtbar" stellt, landet es hier.</p></div>
			{:else}
				<div class="cards">
					{#each teamDecks as deck}
						<article>
							<div><span class="mono">{deck.slideCount} Slides · Team sichtbar</span><h3>{deck.title}</h3><p>Aktualisiert {formatDate(deck.updatedAt)}</p></div>
							<div class="actions"><a href={deck.shareUrl}>Ansehen</a><a class="secondary" href={`/api/decks/${deck.id}/export/md`}>Export .md</a><a class="secondary" href={`/api/decks/${deck.id}/export/json`}>Export .json</a><button class="ghost" disabled={cloning === deck.id} onclick={() => cloneDeck(deck.id)}>{cloning === deck.id ? 'Kopiere …' : 'Kopie erstellen'}</button></div>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</main>

<style>
	main { min-height:100dvh; padding:24px; max-width:1040px; margin:0 auto; }
	header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:28px; }
	.tag, .eyebrow, .auth-card span, article span { color:var(--muted); letter-spacing:2px; font-size:11px; }
	a { color:inherit; text-decoration:none; }
	header a { min-height:44px; display:inline-flex; align-items:center; }
	.new, button, .actions a, .empty a, .primary-link, .ghost-link, .quickstart a { border:1px solid var(--hair); border-radius:999px; padding:10px 16px; font-weight:800; }
	.new, .primary-link, .ghost-link { min-height:44px; display:inline-flex; align-items:center; justify-content:center; }
	.hero { max-width:820px; margin-bottom:22px; }
	h1 { font-size:clamp(40px,8vw,76px); line-height:.94; letter-spacing:-1.8px; margin:8px 0 12px; }
	.hero p, .library-head span, article p, .empty p, .msg, .auth-card p, .sharing label { color:var(--muted); line-height:1.45; }
	.hero-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
	.primary-link { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
	.ghost-link { color:var(--fg); background:var(--surface); cursor:pointer; }
	.auth-card { border:1px solid var(--hair); border-radius:24px; padding:18px; display:flex; flex-direction:column; gap:14px; background:color-mix(in srgb, var(--accent) 8%, transparent); }
	.account-claim { margin-top:18px; }
	.auth-card strong { font-size:22px; line-height:1.1; }
	form { display:grid; gap:8px; }
	input, select { min-height:44px; border:1px solid var(--hair); border-radius:999px; background:var(--bg); color:var(--fg); padding:0 14px; font:inherit; }
	form button { min-height:44px; }
	button { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
	button.ghost, .actions .ghost { background:transparent; color:var(--fg); border-color:var(--hair); }
	button:disabled, select:disabled { opacity:.55; }
	.msg { font-size:12px; overflow-wrap:anywhere; }
	.err { color:#e0483d; }
	.notice { border:1px solid var(--hair); border-radius:16px; padding:12px 14px; margin:0 0 18px; }
	.library { display:grid; gap:14px; margin-top:22px; scroll-margin-top:18px; }
	.library:focus { outline:none; }
	.library.highlight { border-radius:28px; animation:library-pulse 1.4s ease-out; }
	.library-head { display:flex; justify-content:space-between; align-items:end; gap:12px; }
	h2 { margin:0; font-size:24px; letter-spacing:-.5px; }
	.cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; }
	article, .empty { border:1px solid var(--hair); border-radius:22px; padding:18px; min-height:190px; display:flex; flex-direction:column; justify-content:space-between; gap:18px; background:var(--surface); box-shadow:var(--shadow-soft); }
	.empty.compact { min-height:120px; }
	article h3, .empty h3 { margin:8px 0; font-size:26px; line-height:1; letter-spacing:-.7px; }
	.quickstart { display:grid; grid-template-columns:1.25fr .75fr; gap:8px; align-items:center; }
	.quickstart .live { min-height:54px; font-size:17px; }
	.quickstart a { min-height:54px; display:inline-flex; align-items:center; justify-content:center; color:var(--fg); background:var(--surface-2); }
	.actions, .sharing { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
	.sharing { justify-content:space-between; }
	.sharing label { display:flex; align-items:center; gap:8px; font-size:12px; }
	.actions a:first-child, .empty a { background:var(--accent); color:var(--accent-fg); border-color:var(--accent); }
	.more { background:transparent; color:var(--fg); border-color:var(--hair); }
	.deck-details { border-top:1px solid var(--hair); padding-top:12px; }
	.deck-details a:first-child { background:transparent; color:var(--muted); border-color:var(--hair); }
	.actions .secondary { color:var(--muted); background:transparent; }
	.actions .danger { background:transparent; color:#e0483d; border-color:color-mix(in srgb, #e0483d 55%, var(--hair)); }
	@keyframes library-pulse {
		0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); }
		45% { box-shadow:0 0 0 10px color-mix(in srgb, var(--accent) 18%, transparent); }
		100% { box-shadow:0 0 0 0 transparent; }
	}
	@media(max-width:760px){
		main{ padding:18px; }
		h1{ font-size:clamp(42px,13vw,64px); }
		.auth-card,.deck-card,.empty{ border-radius:28px; }
		.cards{ grid-template-columns:1fr; }
		article h3,.empty h3{ font-size:clamp(28px,8vw,38px); }
		.quickstart{ grid-template-columns:1fr; }
		.quickstart .live,.quickstart a{ min-height:58px; }
		.sharing{ align-items:stretch; }
		.sharing label{ width:100%; justify-content:space-between; }
		.sharing select{ flex:1; max-width:190px; }
		.actions a,.actions button,.more{ min-height:44px; display:inline-flex; align-items:center; }
	}
</style>