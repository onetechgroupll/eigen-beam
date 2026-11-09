<script lang="ts">
	import { goto } from '$app/navigation';
	import { applyQualityFix, deckReadyCheck, type DeckQualityFix } from '$lib/deck-quality';
	import { parseDeck } from '$lib/deck-parse';
	import { TEMPLATES } from '$lib/decks';
	import SlideView from '$lib/components/SlideView.svelte';

	type Props = { mode: 'new' | 'edit'; id?: string; initialTitle?: string; initialSource?: string };
	let { mode, id = '', initialTitle = '', initialSource = '' }: Props = $props();
	const initial = <T>(read: () => T): T => read();

	let title = $state(initial(() => initialTitle));
	let source = $state(initial(() => initialSource));
	let pin = $state('');
	let pidx = $state(0);
	let slides = $derived(parseDeck(source));
	let count = $derived(slides.length);
	let safeIdx = $derived(count ? Math.min(Math.max(pidx, 0), count - 1) : 0);
	let preview = $derived(count ? slides[safeIdx] : null);
	let effectiveTitle = $derived(title.trim() || slides[0]?.headline?.trim() || 'Mobile Session');
	let quality = $derived(deckReadyCheck(slides));
	let readyItems = $derived([
		{ label: 'Mobile Format vorbereitet', done: true },
		{ label: count ? `${count} Slides erkannt` : 'Material reinwerfen', done: count > 0 },
		{ label: quality.metrics.denseSlides === 0 && quality.metrics.longHeadlines === 0 ? 'Lesbarkeit okay' : 'Lesbarkeit schärfen', done: count > 0 && quality.metrics.denseSlides === 0 && quality.metrics.longHeadlines === 0 },
		{ label: 'Presenter Remote bereit', done: count > 0 },
		{ label: quality.issues.some((issue) => issue.kind === 'missing_cta') ? 'Klarer nächster Schritt fehlt' : 'Nächster Schritt klar', done: count > 0 && !quality.issues.some((issue) => issue.kind === 'missing_cta') }
	]);
	let readyDone = $derived(readyItems.filter((item) => item.done).length);
	let readyLabel = $derived(`Live-ready: ${readyDone} / ${readyItems.length}`);

	let saving = $state(false);
	let starting = $state(false);
	let launchLabel = $derived(starting ? 'Starte …' : count ? `${count} ${count === 1 ? 'Folie' : 'Folien'} live starten →` : 'Material reinwerfen →');
	let saveLabel = $derived(saving ? 'Sichere …' : mode === 'new' ? 'Deck sichern' : 'Sichern');
	let clarifying = $state(false);
	let uploading = $state(false);
	let importing = $state(false);
	let importStatus = $state('Import bereit. Wähle PDF/PPTX oder Voice.');
	let importName = $state('');
	let showMarkdown = $state(false);
	let msg = $state('');
	let err = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let importInput: HTMLInputElement | undefined = $state();
	let voiceInput: HTMLInputElement | undefined = $state();

	// Why the server used the local layout instead of Claude (see src/lib/server/claude.ts).
	function localNote(reason: unknown): string {
		if (reason === 'provider_error') return ' Claude war nicht erreichbar, daher lokal.';
		if (reason === 'refusal') return ' Claude hat abgelehnt, daher lokal.';
		if (reason === 'invalid_output') return ' Claude lieferte kein gültiges Ergebnis, daher lokal.';
		return '';
	}
	function prev() { pidx = Math.max(0, safeIdx - 1); }
	function next() { pidx = Math.min(count - 1, safeIdx + 1); }
	function setTemplate(key: string) {
		const template = TEMPLATES[key];
		if (!template) return;
		title = template.label;
		source = template.source;
		pidx = 0;
	}

	function fixLabel(fix: DeckQualityFix): string {
		if (fix === 'add_cta') return 'CTA ergänzen';
		if (fix === 'suggest_reveal') return 'Reveal vorschlagen';
		return 'Kürzen';
	}

	function applyFix(fix: DeckQualityFix) {
		source = applyQualityFix(source, fix);
		pidx = 0;
		err = false;
		msg = `${fixLabel(fix)} angewendet.`;
	}

	async function save(options: { stayOnNew?: boolean } = {}): Promise<string | null> {
		err = false; msg = ''; saving = true;
		try {
			const res = await fetch(mode === 'new' ? '/api/decks' : `/api/decks/${id}`, {
				method: mode === 'new' ? 'POST' : 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: effectiveTitle, source })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Speichern fehlgeschlagen.'; return null; }
			if (mode === 'new') {
				if (!options.stayOnNew) await goto(`/edit/${j.id}`);
				else msg = 'Deck gespeichert. Live-Session startet …';
				return j.id;
			}
			msg = 'Gespeichert.';
			return id;
		} finally { saving = false; }
	}

	async function clarify() {
		err = false; msg = ''; clarifying = true;
		try {
			const res = await fetch('/api/decks/clarify', {
				method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, source })
			});
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Klarheit fehlgeschlagen.'; return; }
			source = j.source;
			title = j.title ?? title;
			msg = j.mode === 'ai' ? 'Mit Claude verdichtet.' : j.fallbackReason === 'no_key' ? 'Lokal verdichtet (kein AI-Key im Server).' : `Lokal verdichtet.${localNote(j.fallbackReason)}`;
		} finally { clarifying = false; }
	}

	async function uploadAsset() {
		if (mode !== 'edit' || !fileInput?.files?.[0]) return;
		uploading = true; err = false; msg = '';
		try {
			const form = new FormData();
			form.set('file', fileInput.files[0]);
			const res = await fetch(`/api/decks/${id}/assets`, { method: 'POST', body: form });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Upload fehlgeschlagen.'; return; }
			source = `${source.trim()}\n\n![${j.alt ?? 'Bild'}](${j.url})\n`;
			msg = 'Bild eingefügt.';
		} finally { uploading = false; if (fileInput) fileInput.value = ''; }
	}

	async function importDeckFile() {
		const file = importInput?.files?.[0];
		if (!file) return;
		importing = true; err = false; msg = ''; importName = file.name; importStatus = `Import läuft: ${file.name} wird gelesen …`;
		try {
			const form = new FormData();
			form.set('file', file);
			if (title.trim()) form.set('title', title.trim());
			const endpoint = file.name.toLowerCase().endsWith('.pptx') ? '/api/import/ppt' : '/api/import/pdf';
			const res = await fetch(endpoint, { method: 'POST', body: form });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Import fehlgeschlagen.'; importStatus = `Import Fehler: ${msg}`; return; }
			source = j.source;
			title = j.title ?? title;
			pidx = 0;
			msg = j.mode === 'ai' ? 'Importiert und mit Claude vertikal neu gelayoutet.' : `Importiert und lokal vertikal gelayoutet.${localNote(j.fallbackReason)}`;
			importStatus = `Import fertig: ${parseDeck(j.source).length} mobile Folien erkannt.`;
		} finally { importing = false; if (importInput) importInput.value = ''; }
	}

	async function importVoiceFile() {
		const file = voiceInput?.files?.[0];
		if (!file) return;
		importing = true; err = false; msg = ''; importName = file.name; importStatus = `Import läuft: ${file.name} wird transkribiert …`;
		try {
			const form = new FormData();
			form.set('file', file);
			if (title.trim()) form.set('title', title.trim());
			const res = await fetch('/api/import/voice', { method: 'POST', body: form });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? 'Voice-Import fehlgeschlagen.'; importStatus = `Import Fehler: ${msg}`; return; }
			source = j.source;
			title = j.title ?? title;
			pidx = 0;
			msg = j.mode === 'ai' ? 'Audio transkribiert und mit Claude gelayoutet.' : `Transkript in Slides umgebaut.${localNote(j.fallbackReason)}`;
			importStatus = `Import fertig: ${parseDeck(j.source).length} mobile Folien erkannt.`;
		} finally { importing = false; if (voiceInput) voiceInput.value = ''; }
	}

	async function start() {
		if (count === 0) { err = true; msg = 'Erst eine Folie schreiben.'; return; }
		const savedId = await save({ stayOnNew: true });
		if (!savedId) return;
		starting = true; err = false; msg = '';
		try {
			const res = await fetch('/api/rooms', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ deckId: savedId, pin: pin.trim() || undefined })
			});
			const out = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = out.message ?? 'Konnte Präsentation nicht starten.'; return; }
			const { id: roomId, claimToken } = out;
			const claim = await fetch(`/present/${roomId}/claim`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ claimToken })
			});
			if (!claim.ok) { err = true; msg = 'Presenter-Zugriff konnte nicht gesetzt werden.'; return; }
			await goto(`/present/${roomId}`);
		} finally { starting = false; }
	}
</script>

<main>
	<header>
		<a class="mono tag" href="/">← EIGEN.BEAM</a>
		<div class="toplinks"><a class="mono small" href="/account">Meine Decks</a><span class="mono small">{mode === 'new' ? 'Neues Deck' : 'Bearbeiten'}</span></div>
	</header>

	<div class="grid">
		<div class="edit">
			<section class="fast-path" aria-label="Fast Path">
				<span class="mono tag">FAST PATH</span>
				<div>
					<button class="quick primary" onclick={() => document.getElementById('import-studio')?.scrollIntoView({ behavior: 'smooth' })}>Material importieren</button>
					<button class="quick" onclick={() => document.getElementById('deck-templates')?.scrollIntoView({ behavior: 'smooth' })}>Template</button>
					<button class="quick" onclick={() => (showMarkdown = !showMarkdown)}>{showMarkdown ? 'Guided' : 'Advanced'}</button>
				</div>
				<p>{count ? `${readyLabel} · Titel: ${effectiveTitle}` : `${readyLabel} · Material reinwerfen, Ready Check prüfen, live starten.`}</p>
			</section>
			<section class="flow-spine" aria-label="Session Schritte"><span>1 Material</span><span>2 Ready Check</span><span>3 Live</span></section>
			<section class="composer-intro">
				<span class="mono tag">GUIDED COMPOSER</span>
				<h1>Baue eine mobile Session.</h1>
				<p>Import rein, Story schärfen, live starten. Advanced bleibt für Feinschliff da — nicht als Einstiegshürde.</p>
			</section>
			<section id="import-studio" class="import-studio" aria-label="Import Studio">
				<div class="studio-head">
					<div><span class="mono tag">IMPORT STUDIO</span><h2>Aus vorhandenem Material ein Phone-Deck machen.</h2></div>
					<button class="pill advanced" onclick={() => (showMarkdown = !showMarkdown)}>{showMarkdown ? 'Advanced schließen' : 'Advanced'}</button>
				</div>
				<div class="import-grid">
					<label class="import-card primary">PDF/PPTX<span>Slides, One-Pager oder Pitch hochladen</span><input bind:this={importInput} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onchange={importDeckFile} disabled={importing} /></label>
					<label class="import-card">Voice<span>Audio oder Transkript zu Slides</span><input bind:this={voiceInput} type="file" accept="audio/*,.txt,text/plain" onchange={importVoiceFile} disabled={importing} /></label>
					<button class="import-card" onclick={clarify} disabled={clarifying}><strong>{clarifying ? 'Verdichte …' : 'Klarer machen'}</strong><span>Auf eine Idee pro Folie trimmen</span></button>
				</div>
				<div class="import-status" class:busy={importing} class:bad={err && importStatus.startsWith('Import Fehler')}>
					<span>{importing ? 'Import läuft' : 'Import Preview'}</span>
					<strong>{importStatus}</strong>
					{#if importName}<small>{importName}</small>{/if}
				</div>
			</section>
			<input class="title" bind:value={title} placeholder="Titel optional" maxlength="120" />
			<section id="deck-templates" class="template-strip" aria-label="Deck Templates">
				<span class="mono tag">STARTER</span>
				<div>{#each Object.entries(TEMPLATES) as [key, template]}<button class="pill" onclick={() => setTemplate(key)}>{template.label}</button>{/each}</div>
			</section>
			{#if showMarkdown}
				<textarea bind:value={source} spellcheck="false" placeholder="Markdown … `---` trennt Folien"></textarea>
				<p class="help">
					<strong>Konvention:</strong> <code>type: number|quote|image|compare|timeline</code>, Label-Zeile = Eyebrow,
					<code>#&nbsp;Headline</code>, <code>++ Reveal</code>, <code>---</code> trennt Folien.
				</p>
			{:else}
				<section class="guided-card">
					<strong>{count ? `${count} mobile Folien erkannt` : 'Noch kein Deck'}</strong>
					<p>{count ? 'Nutze die Live-Preview und öffne Advanced nur für Feinschliff.' : 'Importiere Material oder wähle ein Template. Danach zeigt dir der Ready Check, ob es live-tauglich ist.'}</p>
				</section>
			{/if}
			<section class="ready-check" aria-label="Ready Check">
				<div class="ready-head">
					<span class="mono tag">READY CHECK</span>
					<strong class:good={quality.status === 'live_ready'} class:warn={quality.status === 'almost_ready'}>{readyLabel}</strong>
				</div>
				<p>{quality.summary}</p>
				<ul class="ready-goals" aria-label="Live-ready Fortschritt">
					{#each readyItems as item}
						<li class:done={item.done}>{item.done ? '✓' : '○'} {item.label}</li>
					{/each}
				</ul>
				<div class="quality-metrics">
					<span>{quality.metrics.slideCount} Folien</span><span>{quality.metrics.denseSlides} dicht</span><span>{quality.metrics.longHeadlines} lang</span><span>{quality.metrics.revealSlides} Reveal</span>
				</div>
				{#if quality.issues.length}
					<ul>
						{#each quality.issues.slice(0, 3) as issue}<li>{issue.message}</li>{/each}
					</ul>
				{:else}
					<p class="ready-ok">Keine harten mobilen Risiken erkannt.</p>
				{/if}
				<div class="fixes">
					{#each quality.suggestedFixes as fix}<button class="pill" onclick={() => applyFix(fix)}>{fixLabel(fix)}</button>{/each}
					{#if !quality.suggestedFixes.includes('add_cta')}<button class="pill" onclick={() => applyFix('add_cta')}>CTA ergänzen</button>{/if}
				</div>
			</section>
			<section class="launch-card" aria-label="Session Start">
				<label class="pin">PIN optional <input bind:value={pin} maxlength="24" placeholder="z.B. 1234" inputmode="numeric" /></label>
				{#if mode === 'edit'}<label class="upload">Bild einfügen <input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={uploadAsset} disabled={uploading} /></label>{/if}
			</section>

			<div class="actions">
				<button class="ghost" onclick={() => save()} disabled={saving || starting}>{saveLabel}</button>
				<button class="accent" onclick={start} disabled={saving || starting}>{launchLabel}</button>
			</div>
			{#if msg}<p class="msg" class:err>{msg}</p>{/if}
			{#if mode === 'new'}<p class="help">Du hast schon ein Phone-Deck. Live starten sichert es automatisch und öffnet sofort die Presenter-Remote.</p>{/if}
		</div>

		<div class="preview">
			<div class="phone"><div class="frame">{#if preview}<SlideView slide={preview} />{:else}<div class="empty">Noch keine Folie. Schreib <code>#&nbsp;Headline</code>.</div>{/if}</div></div>
			<div class="stepper">
				<button onclick={prev} disabled={count === 0 || safeIdx === 0} aria-label="Vorherige Folie">‹</button>
				<span class="pos mono">{count ? safeIdx + 1 : 0} / {count}</span>
				<button onclick={next} disabled={count === 0 || safeIdx === count - 1} aria-label="Nächste Folie">›</button>
			</div>
		</div>
	</div>
</main>

<style>
	main { min-height: 100dvh; padding: max(14px, env(safe-area-inset-top)) clamp(14px, 4vw, 32px) max(18px, env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; }
	header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
	.toplinks { display: flex; align-items: center; gap: 12px; }
	header a { min-height:44px; display:inline-flex; align-items:center; }
	.tag { font-size: 12px; letter-spacing: 3px; color: var(--muted); text-decoration: none; }
	.small { font-size: 11px; letter-spacing: 1.5px; color: var(--muted); text-decoration: none; }
	.grid { flex: 1; display: grid; grid-template-columns: 1fr; gap: 18px; }
	@media (min-width: 820px) { .grid { grid-template-columns: 1fr minmax(300px, 380px); align-items: start; } }
	.edit { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
	.fast-path, .composer-intro, .guided-card, .import-studio, .template-strip, .launch-card, .ready-check { border: 1px solid var(--hair); border-radius: 26px; background: var(--surface); box-shadow: var(--shadow-soft); padding: 16px; }
	.flow-spine { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
	.flow-spine span { border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--hair)); border-radius: 999px; padding: 10px 8px; color: var(--fg); background: color-mix(in srgb, var(--accent) 7%, transparent); font-size: 12px; font-weight: 800; text-align: center; }
	.fast-path { display: grid; gap: 10px; background: radial-gradient(circle at 0 0, color-mix(in srgb, var(--accent) 14%, transparent), transparent 52%), var(--surface); }
	.fast-path div { display: grid; grid-template-columns: 1.25fr .85fr .85fr; gap: 8px; }
	.fast-path p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.35; }
	.quick { min-height: 48px; border: 1px solid var(--hair); border-radius: 999px; background: var(--surface-2); color: var(--fg); font-weight: 820; }
	.quick.primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
	.composer-intro h1 { margin: 6px 0 8px; font-size: clamp(36px, 10vw, 58px); line-height: .9; letter-spacing: -1.6px; }
	.composer-intro p, .guided-card p { color: var(--muted); line-height: 1.45; font-size: 14px; }
	.guided-card strong { display: block; font-size: 20px; letter-spacing: -.3px; margin-bottom: 6px; }
	.studio-head { display: flex; justify-content: space-between; gap: 12px; align-items: start; margin-bottom: 12px; }
	.studio-head h2 { margin: 4px 0 0; font-size: clamp(22px, 5.4vw, 34px); line-height: .96; letter-spacing: -.7px; }
	.import-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px; }
	.import-card { position: relative; min-height: 94px; border: 1px solid var(--hair); border-radius: 22px; padding: 14px; background: var(--surface-2); color: var(--fg); font-weight: 850; text-align: left; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; gap: 10px; }
	.import-card.primary { background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, var(--surface-2)), var(--surface-2)); border-color: color-mix(in srgb, var(--accent) 55%, var(--hair)); }
	.import-card span { display: block; color: var(--muted); font-size: 12px; line-height: 1.25; font-weight: 650; }
	.import-card input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.import-status { margin-top: 12px; border: 1px solid var(--hair); border-radius: 18px; padding: 12px; background: var(--bg); display: grid; gap: 4px; }
	.import-status span { color: var(--muted); font-size: 11px; letter-spacing: 1.8px; text-transform: uppercase; }
	.import-status strong { font-size: 14px; line-height: 1.25; }
	.import-status small { color: var(--muted); overflow-wrap: anywhere; }
	.import-status.busy { border-color: color-mix(in srgb, var(--accent) 55%, var(--hair)); background: color-mix(in srgb, var(--accent) 11%, var(--bg)); }
	.import-status.bad { border-color: color-mix(in srgb, #e0483d 60%, var(--hair)); }
	.template-strip { display: grid; gap: 10px; }
	.template-strip div { display: flex; flex-wrap: wrap; gap: 10px; }
	.ready-check { display: grid; gap: 10px; }
	.ready-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.ready-head strong { border: 1px solid color-mix(in srgb, #e0483d 52%, var(--hair)); border-radius: 999px; padding: 8px 12px; color: #ff8a7f; white-space: nowrap; }
	.ready-head strong.warn { border-color: color-mix(in srgb, var(--accent) 35%, var(--hair)); color: var(--fg); }
	.ready-head strong.good { border-color: var(--accent); color: var(--accent); }
	.ready-check p { color: var(--muted); line-height: 1.4; margin: 0; }
	.ready-goals { display: grid; gap: 6px; list-style: none; padding: 0; margin: 0; }
	.ready-goals li { border: 1px solid var(--hair); border-radius: 14px; padding: 8px 10px; color: var(--muted); font-size: 13px; line-height: 1.25; }
	.ready-goals li.done { color: var(--fg); border-color: color-mix(in srgb, var(--accent) 36%, var(--hair)); background: color-mix(in srgb, var(--accent) 8%, transparent); }
	.quality-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
	.quality-metrics span { border: 1px solid var(--hair); border-radius: 14px; padding: 8px; font-size: 12px; color: var(--muted); text-align: center; }
	.ready-check ul:not(.ready-goals) { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.35; font-size: 13px; }
	.ready-ok { color: var(--fg) !important; }
	.fixes { display: flex; flex-wrap: wrap; gap: 8px; }
	.launch-card { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
	.title, textarea, .pin input { background: transparent; border: 1px solid var(--hair); border-radius: 10px; padding: 12px 14px; color: var(--fg); font: inherit; }
	.title { font-weight: 700; font-size: 16px; }
	textarea { min-height: 46vh; resize: vertical; font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.55; tab-size: 2; }
	.title:focus, textarea:focus, .pin input:focus { outline: none; border-color: var(--fg); }
	.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
	.pill, .ghost, .accent { min-height: 44px; padding: 0 16px; border-radius: 999px; font-weight: 700; border: 1px solid var(--hair); }
	.pill, .ghost { background: var(--surface); color: var(--fg); }
	.pill.advanced { border-color: color-mix(in srgb, var(--accent) 48%, var(--hair)); white-space: nowrap; }
	.accent { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
	button:disabled { opacity: 0.5; }
	.help, .msg, .pin, .upload { font-size: 12px; color: var(--muted); line-height: 1.5; }
	.help code, .empty code { font-family: ui-monospace, monospace; font-size: 0.9em; padding: 1px 4px; border: 1px solid var(--hair); border-radius: 4px; }
	.msg.err { color: #e0483d; }
	.pin { display: flex; gap: 8px; align-items: center; }
	.pin input { width: 120px; min-height: 36px; padding: 8px 10px; }
	.upload { position: relative; display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); font-weight: 760; overflow: hidden; }
	.upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
	.preview { display: flex; flex-direction: column; gap: 12px; align-items: center; position: sticky; top: 16px; }
	.phone { width: 100%; max-width: 340px; }
	.frame { aspect-ratio: 9 / 16; container-type: size; --fluid-eyebrow: 2.6cqw; --fluid-gap: 3cqw; --fluid-h1: 9cqw; --fluid-metric: 18cqw; --fluid-bodygap: 3.5cqw; --fluid-body: 4cqw; --slide-img-maxh: 40cqh; border: 1px solid var(--hair); border-radius: 22px; background: var(--bg); display: flex; flex-direction: column; justify-content: center; padding: clamp(18px, 6cqw, 28px); overflow: hidden; }
	.empty { color: var(--muted); font-size: 13px; line-height: 1.5; }
	.stepper { display: flex; align-items: center; gap: 14px; }
	.stepper button { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--hair); background: transparent; color: var(--fg); font-size: 22px; line-height: 1; }
	.stepper button:disabled { opacity: 0.35; }
	.pos { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; min-width: 56px; text-align: center; }
	@media (max-width: 520px) {
		header { align-items: flex-start; }
		.toplinks { gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
			.fast-path, .composer-intro, .guided-card, .import-studio, .template-strip, .launch-card, .ready-check { border-radius: 24px; padding: 14px; }
		.fast-path div { grid-template-columns: 1fr; }
		.composer-intro h1 { font-size: clamp(34px, 12vw, 48px); }
		.import-grid { grid-template-columns: 1fr 1fr; }
		.import-card { min-height: 104px; border-radius: 20px; padding: 12px; }
		.import-card:first-child { grid-column: 1 / -1; min-height: 86px; }
		.quality-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.actions { display: grid; grid-template-columns: .8fr 1.2fr; padding: 8px; margin: 2px -4px 0; border: 1px solid var(--hair); border-radius: 999px; background: color-mix(in srgb, var(--bg) 86%, transparent); box-shadow: var(--shadow-soft); }
		.actions button { width: 100%; min-height: 54px; }
		.phone { max-width: min(100%, 360px); }
	}
</style>
