<script lang="ts">
	import { goto } from '$app/navigation';
	import { applyQualityFix, deckReadyCheck, type DeckQualityFix } from '$lib/deck-quality';
	import { parseDeck } from '$lib/deck-parse';
	import { TEMPLATES } from '$lib/decks';
	import SlideView from '$lib/components/SlideView.svelte';
	import { useI18n } from '$lib/i18n/context';
	import { detectContentLocale } from '$lib/i18n';

	type Props = { mode: 'new' | 'edit'; id?: string; initialTitle?: string; initialSource?: string };
	let { mode, id = '', initialTitle = '', initialSource = '' }: Props = $props();
	const initial = <T>(read: () => T): T => read();
	const { locale, t } = useI18n();

	let title = $state(initial(() => initialTitle));
	let source = $state(initial(() => initialSource));
	let pin = $state('');
	let pidx = $state(0);
	let slides = $derived(parseDeck(source));
	let count = $derived(slides.length);
	let safeIdx = $derived(count ? Math.min(Math.max(pidx, 0), count - 1) : 0);
	let preview = $derived(count ? slides[safeIdx] : null);
	let effectiveTitle = $derived(title.trim() || slides[0]?.headline?.trim() || 'Mobile Session');
	let quality = $derived(deckReadyCheck(slides, locale));
	let readyItems = $derived([
		{ label: t('editor.mobile_format'), done: true },
		{ label: count ? t('editor.slides_detected', { count }) : t('editor.add_material'), done: count > 0 },
		{ label: quality.metrics.denseSlides === 0 && quality.metrics.longHeadlines === 0 ? t('editor.readable') : t('editor.improve_readability'), done: count > 0 && quality.metrics.denseSlides === 0 && quality.metrics.longHeadlines === 0 },
		{ label: t('editor.remote_ready'), done: count > 0 },
		{ label: quality.issues.some((issue) => issue.kind === 'missing_cta') ? t('editor.cta_missing') : t('editor.cta_ready'), done: count > 0 && !quality.issues.some((issue) => issue.kind === 'missing_cta') }
	]);
	let readyDone = $derived(readyItems.filter((item) => item.done).length);
	let readyLabel = $derived(t('editor.live_ready', { done: readyDone, total: readyItems.length }));

	let saving = $state(false);
	let starting = $state(false);
	let launchLabel = $derived(starting ? t('account.starting') : count ? t('editor.start_slides', { count, slides: count === 1 ? t('common.slide') : t('common.slides') }) : `${t('editor.add_material')} →`);
	let saveLabel = $derived(saving ? t('editor.saving') : mode === 'new' ? t('editor.save_deck') : t('common.save'));
	let clarifying = $state(false);
	let uploading = $state(false);
	let importing = $state(false);
	let importStatus = $state(t('editor.import_ready'));
	let importName = $state('');
	let showMarkdown = $state(false);
	let msg = $state('');
	let err = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let importInput: HTMLInputElement | undefined = $state();
	let voiceInput: HTMLInputElement | undefined = $state();

	// Why the server used the local layout instead of Claude (see src/lib/server/claude.ts).
	function localNote(reason: unknown): string {
		if (reason === 'provider_error') return t('editor.local_provider');
		if (reason === 'refusal') return t('editor.local_refusal');
		if (reason === 'invalid_output') return t('editor.local_invalid');
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
		if (fix === 'add_cta') return t('editor.add_cta');
		if (fix === 'suggest_reveal') return t('editor.suggest_reveal');
		return t('editor.shorten');
	}

	function applyFix(fix: DeckQualityFix) {
		source = applyQualityFix(source, fix, detectContentLocale(slides));
		pidx = 0;
		err = false;
		msg = t('editor.fix_applied', { fix: fixLabel(fix) });
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
			if (!res.ok) { err = true; msg = j.message ?? t('editor.save_failed'); return null; }
			if (mode === 'new') {
				if (!options.stayOnNew) await goto(`/edit/${j.id}`);
				else msg = t('editor.saved_starting');
				return j.id;
			}
			msg = t('editor.saved');
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
			msg = j.mode === 'ai' ? t('editor.clarified_ai') : j.fallbackReason === 'no_key' ? t('editor.clarified_local_no_key') : `${t('editor.clarified_local')}${localNote(j.fallbackReason)}`;
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
			if (!res.ok) { err = true; msg = j.message ?? t('editor.upload_failed'); return; }
			source = `${source.trim()}\n\n![${j.alt ?? 'Bild'}](${j.url})\n`;
			msg = t('editor.image_inserted');
		} finally { uploading = false; if (fileInput) fileInput.value = ''; }
	}

	async function importDeckFile() {
		const file = importInput?.files?.[0];
		if (!file) return;
		importing = true; err = false; msg = ''; importName = file.name; importStatus = t('editor.import_reading', { file: file.name });
		try {
			const form = new FormData();
			form.set('file', file);
			if (title.trim()) form.set('title', title.trim());
			const endpoint = file.name.toLowerCase().endsWith('.pptx') ? '/api/import/ppt' : '/api/import/pdf';
			const res = await fetch(endpoint, { method: 'POST', body: form });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? t('editor.import_failed'); importStatus = t('editor.import_error', { message: msg }); return; }
			source = j.source;
			title = j.title ?? title;
			pidx = 0;
			msg = j.mode === 'ai' ? t('editor.imported_ai') : `${t('editor.imported_local')}${localNote(j.fallbackReason)}`;
			importStatus = t('editor.import_done', { count: parseDeck(j.source).length });
		} finally { importing = false; if (importInput) importInput.value = ''; }
	}

	async function importVoiceFile() {
		const file = voiceInput?.files?.[0];
		if (!file) return;
		importing = true; err = false; msg = ''; importName = file.name; importStatus = t('editor.import_transcribing', { file: file.name });
		try {
			const form = new FormData();
			form.set('file', file);
			if (title.trim()) form.set('title', title.trim());
			const res = await fetch('/api/import/voice', { method: 'POST', body: form });
			const j = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = j.message ?? t('editor.import_failed'); importStatus = t('editor.import_error', { message: msg }); return; }
			source = j.source;
			title = j.title ?? title;
			pidx = 0;
			msg = j.mode === 'ai' ? t('editor.voice_ai') : `${t('editor.voice_local')}${localNote(j.fallbackReason)}`;
			importStatus = t('editor.import_done', { count: parseDeck(j.source).length });
		} finally { importing = false; if (voiceInput) voiceInput.value = ''; }
	}

	async function start() {
		if (count === 0) { err = true; msg = t('editor.first_slide'); return; }
		const savedId = await save({ stayOnNew: true });
		if (!savedId) return;
		starting = true; err = false; msg = '';
		try {
			const res = await fetch('/api/rooms', {
				method: 'POST', headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ deckId: savedId, pin: pin.trim() || undefined })
			});
			const out = await res.json().catch(() => ({}));
			if (!res.ok) { err = true; msg = out.message ?? t('editor.start_failed'); return; }
			const { id: roomId, claimToken } = out;
			const claim = await fetch(`/present/${roomId}/claim`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ claimToken })
			});
			if (!claim.ok) { err = true; msg = t('editor.presenter_failed'); return; }
			await goto(`/present/${roomId}`);
		} finally { starting = false; }
	}
</script>

<main>
	<header>
		<a class="mono tag" href="/">← EIGEN.BEAM</a>
		<div class="toplinks"><a class="mono small" href="/account">{t('common.my_decks')}</a><span class="mono small">{mode === 'new' ? t('common.new_deck') : t('common.edit')}</span></div>
	</header>

	<div class="grid">
		<div class="edit">
			<section class="fast-path" aria-label={t('editor.fast_path')}>
				<span class="mono tag">{t('editor.fast_path')}</span>
				<div>
					<button class="quick primary" onclick={() => document.getElementById('import-studio')?.scrollIntoView({ behavior: 'smooth' })}>{t('editor.import_material')}</button>
					<button class="quick" onclick={() => document.getElementById('deck-templates')?.scrollIntoView({ behavior: 'smooth' })}>{t('editor.template')}</button>
					<button class="quick" onclick={() => (showMarkdown = !showMarkdown)}>{showMarkdown ? t('editor.guided') : t('editor.advanced')}</button>
				</div>
				<p>{count ? t('editor.fast_status', { ready: readyLabel, title: effectiveTitle }) : t('editor.fast_empty', { ready: readyLabel })}</p>
			</section>
			<section class="flow-spine"><span>{t('editor.step_material')}</span><span>{t('editor.step_ready')}</span><span>{t('editor.step_live')}</span></section>
			<section class="composer-intro">
				<span class="mono tag">{t('editor.guided_composer')}</span>
				<h1>{t('editor.title')}</h1>
				<p>{t('editor.intro')}</p>
			</section>
			<section id="import-studio" class="import-studio" aria-label={t('editor.import_studio')}>
				<div class="studio-head">
					<div><span class="mono tag">{t('editor.import_studio')}</span><h2>{t('editor.import_title')}</h2></div>
					<button class="pill advanced" onclick={() => (showMarkdown = !showMarkdown)}>{showMarkdown ? t('editor.advanced_close') : t('editor.advanced')}</button>
				</div>
				<div class="import-grid">
					<label class="import-card primary">PDF/PPTX<span>{t('editor.upload_hint')}</span><input bind:this={importInput} type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" onchange={importDeckFile} disabled={importing} /></label>
					<label class="import-card">{t('editor.voice')}<span>{t('editor.voice_hint')}</span><input bind:this={voiceInput} type="file" accept="audio/*,.txt,text/plain" onchange={importVoiceFile} disabled={importing} /></label>
					<button class="import-card" onclick={clarify} disabled={clarifying}><strong>{clarifying ? t('editor.clarifying') : t('editor.clarify')}</strong><span>{t('editor.clarify_hint')}</span></button>
				</div>
				<div class="import-status" class:busy={importing} class:bad={err}>
					<span>{importing ? t('editor.import_running') : t('editor.import_preview')}</span>
					<strong>{importStatus}</strong>
					{#if importName}<small>{importName}</small>{/if}
				</div>
			</section>
			<label class="field-label" for="deck-title">{t('editor.title_optional')}</label>
			<input id="deck-title" class="title" bind:value={title} placeholder={t('editor.title_optional')} maxlength="120" />
			<section id="deck-templates" class="template-strip" aria-label={t('editor.templates_label')}>
				<span class="mono tag">{t('editor.starter')}</span>
				<div>{#each Object.entries(TEMPLATES) as [key, template]}<button class="pill" onclick={() => setTemplate(key)}>{key === 'starterDe' ? t('editor.template_de') : template.label}</button>{/each}</div>
			</section>
			{#if showMarkdown}
				<textarea bind:value={source} spellcheck="false" placeholder={t('editor.markdown_placeholder')}></textarea>
				<p class="help">
					<strong>{t('editor.convention')}</strong> <code>type: number|quote|image|compare|timeline</code>, Label = Eyebrow,
					<code>#&nbsp;Headline</code>, <code>++ Reveal</code>, <code>---</code> {t('editor.separates_slides')}
				</p>
			{:else}
				<section class="guided-card">
					<strong>{count ? t('editor.import_done', { count }) : t('editor.no_deck')}</strong>
					<p>{count ? t('editor.guided_ready') : t('editor.guided_empty')}</p>
				</section>
			{/if}
			<section class="ready-check" aria-label={t('editor.ready_check')}>
				<div class="ready-head">
					<span class="mono tag">{t('editor.ready_check')}</span>
					<strong class:good={quality.status === 'live_ready'} class:warn={quality.status === 'almost_ready'}>{readyLabel}</strong>
				</div>
				<p>{quality.summary}</p>
				<ul class="ready-goals" aria-label={t('editor.ready_progress')}>
					{#each readyItems as item}
						<li class:done={item.done}>{item.done ? '✓' : '○'} {item.label}</li>
					{/each}
				</ul>
				<div class="quality-metrics">
					<span>{t('editor.metric_slides', { count: quality.metrics.slideCount })}</span><span>{t('editor.metric_dense', { count: quality.metrics.denseSlides })}</span><span>{t('editor.metric_long', { count: quality.metrics.longHeadlines })}</span><span>{t('editor.metric_reveal', { count: quality.metrics.revealSlides })}</span>
				</div>
				{#if quality.issues.length}
					<ul>
						{#each quality.issues.slice(0, 3) as issue}<li>{issue.message}</li>{/each}
					</ul>
				{:else}
					<p class="ready-ok">{t('editor.mobile_risks_none')}</p>
				{/if}
				<div class="fixes">
					{#each quality.suggestedFixes as fix}<button class="pill" onclick={() => applyFix(fix)}>{fixLabel(fix)}</button>{/each}
					{#if !quality.suggestedFixes.includes('add_cta')}<button class="pill" onclick={() => applyFix('add_cta')}>{t('editor.add_cta')}</button>{/if}
				</div>
			</section>
			<section class="launch-card" aria-label={t('editor.session_start')}>
				<label class="pin">{t('editor.pin_optional')} <input bind:value={pin} maxlength="24" placeholder="e.g. 1234" inputmode="numeric" /></label>
				{#if mode === 'edit'}<label class="upload">{t('editor.insert_image')} <input bind:this={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={uploadAsset} disabled={uploading} /></label>{/if}
			</section>

			<div class="actions">
				<button class="ghost" onclick={() => save()} disabled={saving || starting}>{saveLabel}</button>
				<button class="accent" onclick={start} disabled={saving || starting}>{launchLabel}</button>
			</div>
			{#if msg}<p class="msg" class:err aria-live="polite">{msg}</p>{/if}
			{#if mode === 'new'}<p class="help">{t('editor.new_help')}</p>{/if}
		</div>

		<div class="preview">
			<div class="phone"><div class="frame">{#if preview}<SlideView slide={preview} />{:else}<div class="empty">{t('editor.no_slide')}</div>{/if}</div></div>
			<div class="stepper">
				<button onclick={prev} disabled={count === 0 || safeIdx === 0} aria-label={t('editor.previous_slide')}>‹</button>
				<span class="pos mono">{count ? safeIdx + 1 : 0} / {count}</span>
				<button onclick={next} disabled={count === 0 || safeIdx === count - 1} aria-label={t('editor.next_slide')}>›</button>
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
	.field-label { color:var(--fg); font-size:13px; font-weight:760; }
	textarea { min-height: 46vh; resize: vertical; font-family: ui-monospace, 'SF Mono', 'JetBrains Mono', monospace; font-size: 14px; line-height: 1.55; tab-size: 2; }
	.title:focus, textarea:focus, .pin input:focus { border-color: var(--fg); }
	.actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
	.pill, .ghost, .accent { min-height: 44px; padding: 0 16px; border-radius: 999px; font-weight: 700; border: 1px solid var(--hair); }
	.pill, .ghost { background: var(--surface); color: var(--fg); }
	.pill.advanced { border-color: color-mix(in srgb, var(--accent) 48%, var(--hair)); white-space: nowrap; }
	.accent { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
	button:disabled { opacity: 0.5; }
	.help, .msg, .pin, .upload { font-size: 12px; color: var(--muted); line-height: 1.5; }
	.help code { font-family: ui-monospace, monospace; font-size: 0.9em; padding: 1px 4px; border: 1px solid var(--hair); border-radius: 4px; }
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
