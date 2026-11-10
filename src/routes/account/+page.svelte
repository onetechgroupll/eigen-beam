<script lang="ts">
	import { goto } from '$app/navigation';
	import LocaleSwitcher from '$lib/components/LocaleSwitcher.svelte';
	import { useI18n } from '$lib/i18n/context';
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
	const { locale, t } = useI18n();

	function formatDate(ts: number): string {
		return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
	}

	function visibilityLabel(visibility: DeckVisibility): string {
		if (visibility === 'link') return t('common.link_visible');
		if (visibility === 'team') return t('common.team_visible');
		return t('common.private');
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
			if (!res.ok) { err = true; msg = j.message ?? t('api.mail_failed'); return; }
			msg = j.magicLink ? `Login link: ${j.magicLink}` : t('account.link_sent');
		} finally { sending = false; }
	}

	async function logout() {
		await fetch('/api/auth/logout', { method: 'POST' });
		await goto('/account');
	}

	async function deleteDeck(id: string, title: string) {
		if (deleting || !confirm(t('account.delete_confirm', { title: title || t('common.untitled_deck') }))) return;
		deleting = id; err = false; msg = '';
		try {
			const res = await fetch(`/api/decks/${id}`, { method: 'DELETE' });
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				err = true; msg = j.message ?? t('api.deck_forbidden'); return;
			}
			decks = decks.filter((deck) => deck.id !== id);
			msg = t('account.deleted');
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
			if (!res.ok) { err = true; msg = j.message ?? t('account.sharing_failed'); return; }
			decks = decks.map((deck) => deck.id === id ? j.deck : deck);
			msg = t('account.visibility_updated', { visibility: visibilityLabel(j.deck.visibility) });
		} finally { sharing = ''; }
	}

	async function cloneDeck(id: string) {
		cloning = id; err = false; msg = '';
		try {
			const res = await fetch(`/api/decks/${id}/clone`, { method: 'POST' });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? t('api.deck_forbidden'); return; }
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
			if (!res.ok) { err = true; msg = out.message ?? t('editor.start_failed'); return; }
			const claim = await fetch(`/present/${out.id}/claim`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ claimToken: out.claimToken })
			});
			if (!claim.ok) { err = true; msg = t('editor.presenter_failed'); return; }
			await goto(`/present/${out.id}`);
		} finally { starting = ''; }
	}
</script>

<svelte:head><title>{t('common.my_decks')} — eigen.beam</title></svelte:head>

<main>
	<header>
		<a class="mono tag" href="/">← EIGEN.BEAM</a>
		<a class="new" href="/new">{t('common.new_deck')}</a>
	</header>

	<section class="hero">
		<div>
			<div class="mono eyebrow">{t('account.kicker')}</div>
			<h1>{t('account.title')}</h1>
			<p>{data.session ? t('account.signed_in_as', { email: data.session.email }) : t('account.hero_guest')}</p>
			<div class="hero-actions"><a class="primary-link" href="/new">{t('account.import')}</a><button class="ghost-link" type="button" onclick={openLibrary}>{t('account.open_library')}</button></div>
		</div>
	</section>

	{#if data.auth === 'ok'}
		<p class="notice">{t('account.auth_ok')} {data.claimed > 0 ? (data.claimed === 1 ? t('account.claimed_one') : t('account.claimed', { count: data.claimed })) : t('account.claimed_none')}</p>
	{:else if data.auth === 'invalid'}
		<p class="notice err">{t('account.auth_invalid')}</p>
	{/if}

	<section id="library-remote" class="library" class:highlight={libraryHighlighted} bind:this={librarySection} tabindex="-1">
		<div class="library-head">
			<div><span class="mono eyebrow">{t('account.library_remote')}</span><h2>{t('account.own_decks')}</h2></div>
			<span>{decks.length === 1 ? t('account.deck_count_one') : t('account.deck_count', { count: decks.length })}</span>
		</div>
		{#if decks.length === 0}
			<div class="empty">
				<h3>{t('account.no_decks')}</h3>
				<p>{t('account.no_decks_body')}</p>
				<a href="/new">{t('account.import')} →</a>
			</div>
		{:else}
			<div class="cards">
				{#each decks as deck}
					<article class="deck-card">
						<div>
							<span class="mono">{deck.slideCount} Slides · {visibilityLabel(deck.visibility)}</span>
							<h3>{deck.title}</h3>
							<p>{t('account.updated', { date: formatDate(deck.updatedAt) })}</p>
						</div>
						<div class="quickstart">
							<button class="live" disabled={starting === deck.id} onclick={() => startDeck(deck.id)}>{starting === deck.id ? t('account.starting') : t('account.live_start')}</button>
							{#if deck.editUrl}<a href={deck.editUrl}>{t('common.edit')}</a>{/if}
						</div>
						<div class="sharing">
						<label>{t('account.visibility')}
								<select value={deck.visibility} disabled={sharing === deck.id} onchange={(e) => handleVisibilityChange(deck.id, e)}>
								<option value="private">{t('common.private')}</option>
								<option value="link">{t('common.link_visible')}</option>
								{#if data.profile}<option value="team">{t('common.team_visible')}</option>{/if}
								</select>
							</label>
							<button class="more" aria-expanded={expandedDeck === deck.id} onclick={() => (expandedDeck = expandedDeck === deck.id ? '' : deck.id)}>{expandedDeck === deck.id ? t('account.less') : t('account.more')}</button>
						</div>
						{#if expandedDeck === deck.id}
							<div class="actions deck-details" aria-label={t('account.more_actions', { title: deck.title })}>
								<a class="secondary" href={deck.shareUrl}>{t('common.share')}</a>
								<a class="secondary" href={deck.recapUrl}>{t('common.recap')}</a>
								<a class="secondary" href={`/api/decks/${deck.id}/export/md`}>{t('common.export_md')}</a>
								<a class="secondary" href={`/api/decks/${deck.id}/export/json`}>{t('common.export_json')}</a>
								<button class="danger" disabled={deleting === deck.id} onclick={() => deleteDeck(deck.id, deck.title)}>{deleting === deck.id ? t('account.deleting') : t('common.delete')}</button>
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<section class="auth-card account-claim">
		{#if data.session && data.profile}
			<span class="mono">{t('account.signed_in')}</span>
			<strong>{data.profile.email}</strong>
			<p>{t('account.team_body', { team: data.profile.teamLabel })}</p>
			<button class="ghost" onclick={logout}>{t('account.logout')}</button>
		{:else}
			<span class="mono">{t('account.secure_library')}</span>
			<strong>{t('account.secure_title')}</strong>
			<p>{t('account.secure_body')}</p>
			<form onsubmit={(e) => { e.preventDefault(); login(); }}>
				<label for="account-email">{t('account.email_label')}</label>
				<input id="account-email" bind:value={email} type="email" autocomplete="email" placeholder="you@example.com" required />
				<button disabled={sending}>{sending ? t('account.sending') : t('account.secure_action')}</button>
			</form>
		{/if}
		{#if msg}<p class="msg" class:err aria-live="polite">{msg}</p>{/if}
		<div class="account-language"><strong>{t('account.locale_title')}</strong><LocaleSwitcher /></div>
	</section>

	{#if data.profile}
		<section class="library">
			<div class="library-head">
				<h2>Team {data.profile.teamLabel}</h2>
				<span>{t('account.team_shared', { count: teamDecks.length })}</span>
			</div>
			{#if teamDecks.length === 0}
				<div class="empty compact"><h3>{t('account.no_team_decks')}</h3><p>{t('account.no_team_decks_body')}</p></div>
			{:else}
				<div class="cards">
					{#each teamDecks as deck}
						<article>
							<div><span class="mono">{deck.slideCount} Slides · {t('common.team_visible')}</span><h3>{deck.title}</h3><p>{t('account.updated', { date: formatDate(deck.updatedAt) })}</p></div>
							<div class="actions"><a href={deck.shareUrl}>{t('common.view')}</a><a class="secondary" href={`/api/decks/${deck.id}/export/md`}>{t('common.export_md')}</a><a class="secondary" href={`/api/decks/${deck.id}/export/json`}>{t('common.export_json')}</a><button class="ghost" disabled={cloning === deck.id} onclick={() => cloneDeck(deck.id)}>{cloning === deck.id ? t('account.cloning') : t('account.clone')}</button></div>
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
	.auth-card form label { color:var(--fg); font-size:13px; font-weight:760; }
	.account-language { border-top:1px solid var(--hair); padding-top:14px; display:grid; gap:8px; }
	.account-language > strong { font-size:14px; }
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
