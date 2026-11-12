<script lang="ts">
	import { onMount, tick } from 'svelte';
	import QRCode from 'qrcode';
	import SlideView from '$lib/components/SlideView.svelte';
	import { applySentimentSignal, liveSentimentLabel, pacingHint, reopenInsight, replaySentiment, type SentimentPoint } from '$lib/polish';
	import { presenterFeedItem, type PresenterFeedItem } from '$lib/presenter-feed';
	import { fieldTestChecklist, liveStatsDashboard } from '$lib/stats-dashboard';
	import { useI18n } from '$lib/i18n/context';

	let { data } = $props();
	const initial = <T>(read: () => T): T => read();
	let current = $state(initial(() => data.current));
	let qr = $state('');
	let viewerUrl = $state('');
	let stats = $state(initial(() => ({ ...data.stats, questions: Math.max(data.stats.questions, data.questions.length) })));
	let feed = $state<PresenterFeedItem[]>([]);
	let questions = $state(initial(() => data.questions));
	let presenterEvents: EventSource | null = null;
	let sentimentPoints = $state<SentimentPoint[]>(initial(() => replaySentiment([], data.slides.length)));
	let showJoin = $state(false);
	let showCoach = $state(false);
	let showSession = $state(false);
	let showEndDialog = $state(false);
	let ending = $state(false);
	let endError = $state('');
	let ended = $state(initial(() => data.ended));
	let endedAt = $state<number | null>(initial(() => data.endedAt));
	let alreadyEnded = $state(false);
	let questionsExported = $state(false);
	type QuestionStatus = 'open' | 'starred' | 'done';
	type PresenterQuestion = { id: string; text: string; slide: number; ts: number; status: QuestionStatus; hidden?: boolean };
	let showQuestions = $state(false);
	let questionFilter = $state<QuestionStatus>('open');
	let unreadQuestions = $state(0);
	let questionAnnouncement = $state('');
	let updatingQuestionIds = $state<string[]>([]);
	let syncingQuestions = false;
	let questionSyncGeneration = 0;
	let questionEventVersion = 0;
	let queuedQuestionEvents: PresenterQuestion[] = [];
	let joinDialog: HTMLDialogElement | undefined = $state();
	let endDialog: HTMLDialogElement | undefined = $state();
	let questionDialog: HTMLDialogElement | undefined = $state();
	let joinTrigger: HTMLButtonElement | undefined = $state();
	let questionTrigger: HTMLButtonElement | undefined = $state();
	let sessionTrigger: HTMLButtonElement | undefined = $state();
	let endTrigger: HTMLElement | undefined = $state();
	const { locale, t } = useI18n();
	const total = initial(() => data.slides.length);
	let slide = $derived(data.slides[current]);
	let pacing = $derived(pacingHint(slide, locale));
	let sentiment = $derived(liveSentimentLabel(sentimentPoints, locale));
	let reopen = $derived(reopenInsight(stats, locale));
	let dashboard = $derived(liveStatsDashboard(stats, Date.now(), locale));
	let checklist = $derived(fieldTestChecklist(stats, viewerUrl, locale));
	let questionCount = $derived(Math.max(stats.questions, questions.length));
	let filteredQuestions = $derived(questions.filter((question) => question.status === questionFilter));
	let durationMinutes = $derived(Math.max(0, Math.round(((endedAt ?? Date.now()) - stats.startedAt) / 60_000)));

	async function go(n: number) {
		if (ended) return;
		const res = await fetch(`/present/${data.id}/slide`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slide: n }) });
		if (res.ok) { const j = await res.json(); current = j.current; }
	}
	function key(e: KeyboardEvent) {
		const target = e.target as HTMLElement | null;
		if (target?.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
		if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(current + 1); }
		if (e.key === 'ArrowLeft') { e.preventDefault(); go(current - 1); }
	}
	function push(item: PresenterFeedItem) { feed = [item, ...feed].slice(0, 10); }
	function signal(slideIndex: number, type: 'reaction' | 'question' | 'bookmark') {
		sentimentPoints = applySentimentSignal(sentimentPoints, slideIndex, type);
	}
	function requestEnd() {
		const active = document.activeElement;
		endTrigger = active instanceof HTMLElement && document.contains(active) ? active : undefined;
		endError = '';
		showSession = false;
		showEndDialog = true;
	}
	function closeEndDialog() {
		if (endDialog?.open) endDialog.close();
		else handleEndDialogClosed();
	}
	async function handleEndDialogClosed() {
		showEndDialog = false;
		endError = '';
		await tick();
		const target = connected(endTrigger)
			? endTrigger
			: connected(sessionTrigger)
				? sessionTrigger
				: document.querySelector<HTMLElement>('.end-links a, .end-links button, .remote-controls button:not([disabled])');
		target?.focus();
	}
	function connected(element: HTMLElement | undefined): element is HTMLElement {
		return Boolean(element && document.contains(element));
	}
	function openJoin(trigger: HTMLButtonElement) {
		joinTrigger = trigger;
		showJoin = true;
		void tick().then(() => joinDialog?.showModal());
	}
	function closeJoin() {
		if (joinDialog?.open) joinDialog.close();
		else handleJoinClosed();
	}
	function handleJoinClosed() {
		showJoin = false;
		joinTrigger?.focus();
	}
	function openQuestions(trigger: HTMLButtonElement) {
		questionTrigger = trigger;
		unreadQuestions = 0;
		showQuestions = true;
		void tick().then(() => questionDialog?.showModal());
	}
	function closeQuestions() {
		if (questionDialog?.open) questionDialog.close();
		else handleQuestionsClosed();
	}
	function handleQuestionsClosed() {
		showQuestions = false;
		questionTrigger?.focus();
	}
	function mergeQuestions(base: PresenterQuestion[], incoming: PresenterQuestion[]): PresenterQuestion[] {
		const byId = new Map(base.map((question) => [question.id, question]));
		for (const question of incoming) byId.set(question.id, question);
		return [...byId.values()].sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
	}
	function applyQuestionEvent(question: PresenterQuestion, fromSse = false) {
		if (fromSse) questionEventVersion += 1;
		if (syncingQuestions) queuedQuestionEvents.push(question);
		else questions = mergeQuestions(questions, [question]);
	}
	async function syncQuestionSnapshot() {
		const generation = ++questionSyncGeneration;
		syncingQuestions = true;
		queuedQuestionEvents = [];
		try {
			const res = await fetch(`/present/${data.id}/questions/snapshot`, { headers: { accept: 'application/json' } });
			const result = await res.json().catch(() => ({})) as { questions?: unknown };
			const snapshot = readQuestions(result.questions);
			if (generation === questionSyncGeneration && res.ok && snapshot) questions = snapshot;
		} finally {
			if (generation === questionSyncGeneration) {
				for (const question of queuedQuestionEvents) questions = mergeQuestions(questions, [question]);
				syncingQuestions = false;
				queuedQuestionEvents = [];
			}
		}
	}
	async function updateQuestion(question: PresenterQuestion, input: { status?: QuestionStatus; hidden?: boolean }) {
		if (updatingQuestionIds.includes(question.id)) return;
		updatingQuestionIds = [...updatingQuestionIds, question.id];
		const eventVersion = questionEventVersion;
		const syncGeneration = questionSyncGeneration;
		try {
			const res = await fetch(`/present/${data.id}/questions/${question.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(input)
			});
			const result = await res.json().catch(() => ({})) as { question?: unknown };
			const updated = readQuestion(result.question);
			if (!res.ok || !updated) throw new Error('question_update_failed');
			if (eventVersion === questionEventVersion && syncGeneration === questionSyncGeneration) applyQuestionEvent(updated);
		} catch {
			questionAnnouncement = t('present.question_update_failed');
		} finally {
			updatingQuestionIds = updatingQuestionIds.filter((id) => id !== question.id);
		}
	}
	$effect(() => {
		if (showEndDialog) void tick().then(() => { if (!endDialog?.open) endDialog?.showModal(); });
	});
	function closePresenterStream() {
		presenterEvents?.close();
		presenterEvents = null;
	}
	function downloadQuestions() {
		questionsExported = true;
		window.location.assign(`/present/${data.id}/questions`);
	}
	async function endSession(exportAfterEnd = false) {
		if (ending) return;
		ending = true;
		endError = '';
		try {
			const res = await fetch(`/present/${data.id}/slide`, { method: 'DELETE' });
			const result = await res.json().catch(() => ({})) as { endedAt?: unknown; stats?: unknown; questions?: unknown };
			const serverQuestions = readQuestions(result.questions);
			const serverStats = readStats(result.stats);
			if (serverQuestions) questions = serverQuestions;
			if (serverStats) stats = serverStats;
			if (serverQuestions) stats = { ...stats, questions: serverQuestions.length };
			if (res.ok || res.status === 410) {
				closePresenterStream();
				alreadyEnded = res.status === 410;
				endedAt = typeof result.endedAt === 'number' && Number.isFinite(result.endedAt) ? result.endedAt : (endedAt ?? Date.now());
				ended = true;
				showEndDialog = false;
					if (exportAfterEnd) downloadQuestions();
					else {
						await tick();
						document.querySelector<HTMLElement>('.end-links a, .end-links button')?.focus();
					}
				return;
			}
			endError = t('present.end_failed');
		} catch {
			endError = t('present.end_offline');
		} finally {
			ending = false;
		}
	}
	function readQuestion(value: unknown): PresenterQuestion | null {
		if (!value || typeof value !== 'object') return null;
		const question = value as Partial<PresenterQuestion>;
		if (typeof question.id !== 'string' || typeof question.text !== 'string' || !Number.isFinite(question.slide) || !Number.isFinite(question.ts)) return null;
		if (question.status !== 'open' && question.status !== 'starred' && question.status !== 'done') return null;
		if (question.hidden !== undefined && typeof question.hidden !== 'boolean') return null;
		return { id: question.id, text: question.text, slide: Math.floor(question.slide!), ts: question.ts!, status: question.status, ...(question.hidden ? { hidden: true } : {}) };
	}
	function readQuestions(value: unknown): PresenterQuestion[] | null {
		if (!Array.isArray(value)) return null;
		const parsed = value.map(readQuestion);
		return parsed.every((question): question is PresenterQuestion => question !== null) ? parsed : null;
	}
	function readStats(value: unknown): typeof stats | null {
		if (!value || typeof value !== 'object') return null;
		const candidate = value as typeof stats;
		const fields = [candidate.joins, candidate.currentViewers, candidate.peakConcurrent, candidate.reopens, candidate.reactions, candidate.questions, candidate.bookmarks, candidate.startedAt];
		return fields.every((field) => typeof field === 'number' && Number.isFinite(field)) ? candidate : null;
	}

	onMount(() => {
		viewerUrl = `${location.origin}/v/${data.id}`;
		if (ended) return;
		QRCode.toDataURL(viewerUrl, { margin: 1, width: 320 }).then((d) => (qr = d));
		window.addEventListener('keydown', key);
		presenterEvents = new EventSource(`/present/${data.id}/events`);
		presenterEvents.addEventListener('open', () => { void syncQuestionSnapshot(); });
		presenterEvents.addEventListener('stats', (e) => { const j = JSON.parse((e as MessageEvent).data); stats = { ...j.stats, questions: Math.max(j.stats.questions, questions.length) }; });
		presenterEvents.addEventListener('reaction', (e) => { const j = JSON.parse((e as MessageEvent).data); signal(j.slide, 'reaction'); push(presenterFeedItem({ type: 'reaction', reaction: j.reaction, slide: j.slide, ts: j.ts }, locale)); });
		presenterEvents.addEventListener('question', (e) => {
			const question = readQuestion(JSON.parse((e as MessageEvent).data));
			if (!question) return;
			const isNew = !questions.some((candidate) => candidate.id === question.id) && !queuedQuestionEvents.some((candidate) => candidate.id === question.id);
			applyQuestionEvent(question, true);
			stats = { ...stats, questions: Math.max(stats.questions, questions.length + queuedQuestionEvents.length) };
			if (isNew) {
				if (!showQuestions) unreadQuestions += 1;
				questionAnnouncement = t('present.question_live');
				signal(question.slide, 'question');
				push(presenterFeedItem({ type: 'question', text: question.text, slide: question.slide, ts: question.ts }, locale));
			}
		});
		presenterEvents.addEventListener('question_moderation', (e) => {
			const payload = JSON.parse((e as MessageEvent).data) as { question?: unknown };
			const question = readQuestion(payload.question);
			if (question) applyQuestionEvent(question, true);
		});
		presenterEvents.addEventListener('bookmark', (e) => { const j = JSON.parse((e as MessageEvent).data); signal(j.slide, 'bookmark'); push(presenterFeedItem({ type: 'bookmark', slide: j.slide, ts: j.ts }, locale)); });
		presenterEvents.addEventListener('ended', (e) => { const j = JSON.parse((e as MessageEvent).data); endedAt = j.ts; ended = true; showEndDialog = false; showSession = false; closePresenterStream(); });
		return () => { window.removeEventListener('keydown', key); closePresenterStream(); };
	});
</script>

{#if ended}
	<main class="end-state">
		<section class="end-card" aria-label={t('present.ended_label')}>
			<span class="mono kicker">{t('present.ended_kicker')}</span>
			<h1>{alreadyEnded ? t('present.ended_again') : t('present.ended_title')}</h1>
			<p aria-live="polite">{t('present.ended_body')}</p>
			<div class="end-stats">
				<article><strong>{durationMinutes}</strong><span>{t('present.minutes')}</span></article>
				<article><strong>{stats.peakConcurrent}</strong><span>{t('present.viewer_peak')}</span></article>
				<article><strong>{questionCount}</strong><span>{t('common.questions')}</span></article>
			</div>
			<div class="end-links">
				<a class="primary-link" href={`/replay/${data.id}`}>{t('viewer.replay')} →</a>
				{#if questionCount > 0}<a class="secondary export-link" href={`/present/${data.id}/questions`}>{t('present.export_questions')}</a>
					<p class="export-hint">{t('present.export_window')}</p>{/if}
				<a class="secondary-link" href="/new">{t('present.new_session')}</a>
			</div>
		</section>
	</main>
{:else}
<main>
	<header class="topbar">
		<div><span class="mono kicker">{t('present.remote_control')}</span><strong>{current + 1} / {total}</strong></div>
			<nav><a href={`/present/${data.id}/stats`}>{t('common.stats')}</a><button bind:this={questionTrigger} class="question-trigger" aria-haspopup="dialog" onclick={(e) => openQuestions(e.currentTarget)}><span>{t('present.questions_entry', { count: questionCount })}</span>{#if unreadQuestions > 0}<strong aria-label={t('present.questions_unread', { count: unreadQuestions })}>{unreadQuestions}</strong>{/if}</button><button aria-haspopup="dialog" onclick={(e) => openJoin(e.currentTarget)}>{t('present.join')}</button><button bind:this={sessionTrigger} aria-expanded={showSession} onclick={() => (showSession = !showSession)}>{t('present.session')}</button></nav>
	</header>
	<p class="question-announcement" aria-live="polite">{questionAnnouncement}</p>
	{#if showSession}
		<section class="session-menu" aria-label={t('present.session_menu_label')}><p>{t('present.session_menu_body')}</p><button onclick={requestEnd}>{t('present.end_session')}</button></section>
	{/if}

	{#if showJoin}
		<dialog bind:this={joinDialog} class="join-sheet" aria-label={t('present.join_label')} onclose={handleJoinClosed}>
			<button class="sheet-close" onclick={closeJoin}>{t('present.join_close')}</button>
			{#if qr}<img src={qr} alt={t('present.qr_alt')} width="132" height="132" />{/if}
			<div><span class="mono kicker">{t('present.audience_link')}</span><p class="url">{viewerUrl}</p><p>{t('present.join_help')}</p></div>
		</dialog>
	{/if}

	{#if showQuestions}
		<dialog bind:this={questionDialog} class="question-sheet" aria-labelledby="questions-title" onclose={handleQuestionsClosed}>
			<header class="question-sheet-head">
				<div><span class="mono kicker">{t('present.questions_kicker')}</span><h2 id="questions-title">{t('present.questions_title', { count: questionCount })}</h2></div>
				<button class="sheet-close" onclick={closeQuestions}>{t('common.close')}</button>
			</header>
			<div class="question-filters" aria-label={t('present.questions_filters')}>
				<button aria-pressed={questionFilter === 'open'} onclick={() => (questionFilter = 'open')}>{t('present.questions_open')}</button>
				<button aria-pressed={questionFilter === 'starred'} onclick={() => (questionFilter = 'starred')}>{t('present.questions_starred')}</button>
				<button aria-pressed={questionFilter === 'done'} onclick={() => (questionFilter = 'done')}>{t('present.questions_done')}</button>
			</div>
			<div class="question-list">
				{#if filteredQuestions.length === 0}
					<p class="questions-empty">{t('present.questions_empty')}</p>
				{:else}
					{#each filteredQuestions as question (question.id)}
						<article class:hidden={question.hidden}>
							<div class="question-meta"><span>{t('common.slide')} {question.slide + 1}</span><time datetime={new Date(question.ts).toISOString()}>{new Date(question.ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</time>{#if question.hidden}<strong>{t('present.question_hidden')}</strong>{/if}</div>
							<p>{question.text}</p>
							<div class="question-actions">
								{#if question.status !== 'starred'}<button disabled={updatingQuestionIds.includes(question.id)} onclick={() => updateQuestion(question, { status: 'starred' })}>{t('present.question_star')}</button>{/if}
								{#if question.status !== 'done'}<button disabled={updatingQuestionIds.includes(question.id)} onclick={() => updateQuestion(question, { status: 'done' })}>{t('present.question_done')}</button>{/if}
								{#if question.status !== 'open'}<button disabled={updatingQuestionIds.includes(question.id)} onclick={() => updateQuestion(question, { status: 'open' })}>{t('present.question_reopen')}</button>{/if}
								<button disabled={updatingQuestionIds.includes(question.id)} onclick={() => updateQuestion(question, { hidden: !question.hidden })}>{question.hidden ? t('present.question_unhide') : t('present.question_hide')}</button>
							</div>
						</article>
					{/each}
				{/if}
			</div>
			<footer class="question-sheet-foot">
				<p>{t('present.questions_memory_hint')}</p>
				<div><a href={`/present/${data.id}/questions`}>{t('present.export_questions')}</a><a href={`/present/${data.id}/questions?include=hidden`}>{t('present.export_questions_hidden')}</a></div>
			</footer>
		</dialog>
	{/if}

	<section class="remote-stage" aria-label={t('present.current_slide')}>
		<div class="slide-meta"><span class="mono kicker">{t('present.on_air')}</span><span>● {stats.currentViewers} {t('common.live')}</span></div>
		<div class="mini-slide"><SlideView {slide} /></div>
		<div class="slide-title"><span>{t('present.slide_of', { current: current + 1, total, pace: pacing.label })}</span><h1>{slide?.headline}</h1></div>
	</section>

	<section class="coach-card">
		<button class="coach-toggle" aria-expanded={showCoach} onclick={() => (showCoach = !showCoach)}><span>{showCoach ? t('present.coach_close') : t('present.coach_open')}</span><strong>{sentiment}</strong></button>
		{#if showCoach}
			<div class="coach-body">
				<section class="signal-strip" aria-label={t('present.live_signals')}>
					<article><strong>{stats.currentViewers}</strong><span>{t('present.attending')}</span></article>
					<article><strong>{questionCount}</strong><span>{t('common.questions')}</span></article>
					<article><strong>{stats.bookmarks}</strong><span>{t('present.bookmarks')}</span></article>
					<article class:hot={reopen.tone === 'hot'}><strong>{dashboard.reopenRate}%</strong><span>Re-Open</span></article>
				</section>
				<p><strong>{dashboard.engagementLabel}:</strong> {t('present.signals_help')}</p>
				<p><strong>{reopen.label}:</strong> {reopen.detail}</p>
				<div class="spark" aria-label={t('common.sentiment_chart')}>{#each sentimentPoints as point}<span title={`${t('common.slide')} ${point.label}: ${point.score}`} style={`--h:${Math.max(8, Math.min(42, 18 + point.score * 6))}px`}></span>{/each}</div>
				<div class="checklist">{#each checklist as item}<article class={item.status}><strong>{item.label}</strong><p>{item.detail}</p></article>{/each}</div>
			</div>
		{/if}
	</section>

	{#if slide.speakerNotes}<section class="notes"><span class="mono kicker">{t('present.notes')}</span><p>{slide.speakerNotes}</p></section>{/if}
	{#if feed.length}<section class="feed" aria-label={t('present.live_feed')}>{#each feed as item}<p class={item.kind}><strong>{item.label}</strong><span>{item.text}</span></p>{/each}</section>{/if}

	<footer class="remote-controls">
		<button class="secondary" onclick={() => go(current - 1)} disabled={current === 0}>← {t('common.back')}</button>
		{#if current === total - 1}<button class="primary" onclick={requestEnd}>{t('present.end_session')} →</button>{:else}<button class="primary" onclick={() => go(current + 1)}>{t('present.next')}</button>{/if}
	</footer>
	{#if showEndDialog}
		<dialog bind:this={endDialog} class="dialog-backdrop" aria-labelledby="end-title" onclose={handleEndDialogClosed} oncancel={(e) => { if (ending) e.preventDefault(); }}>
			<div class="end-dialog">
				<span class="mono kicker">{t('present.end_session')}</span>
				<h2 id="end-title">{t('present.end_confirm_title')}</h2>
				<p>{t('present.end_confirm_body')}</p>
				{#if endError}<p class="end-error" role="alert">{endError}</p>{/if}
				<div class="dialog-actions">
					{#if questionCount > 0 && !questionsExported}
						<button class="dialog-primary" disabled={ending} onclick={() => endSession(true)}>{ending ? t('present.ending') : t('present.export_and_end')}</button>
						<button disabled={ending} onclick={() => endSession(false)}>{t('present.end_without_export')}</button>
					{:else}
						<button class="dialog-primary" disabled={ending} onclick={() => endSession(false)}>{ending ? t('present.ending') : t('present.end_session')}</button>
					{/if}
					<button disabled={ending} onclick={closeEndDialog}>{t('common.cancel')}</button>
				</div>
			</div>
		</dialog>
	{/if}
</main>
{/if}

<style>
	main { min-height: 100dvh; display: flex; flex-direction: column; gap: 10px; padding: max(12px, env(safe-area-inset-top)) 14px max(112px, calc(env(safe-area-inset-bottom) + 92px)); background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 36%), var(--bg); }
	.topbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 12px; }
	.topbar div { display: grid; gap: 2px; }
	.kicker { color: var(--muted); font-size: 10px; letter-spacing: 2.2px; }
	.topbar strong { font-size: 18px; letter-spacing: -.3px; }
	nav { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
	nav a, nav button, .coach-toggle, .secondary, .primary { border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); text-decoration: none; min-height: 44px; padding: 0 14px; font-weight: 760; }
	nav a, nav button { appearance: none; display: inline-flex; align-items: center; justify-content: center; min-width: 62px; height: 44px; padding: 0 12px; line-height: 1; font-size: 14px; letter-spacing: -.15px; white-space: nowrap; box-shadow: none; }
	nav .question-trigger { gap: 6px; }
	nav .question-trigger strong { min-width: 22px; height: 22px; display: inline-grid; place-items: center; border-radius: 999px; background: var(--accent); color: var(--accent-fg); font-size: 11px; }
	.question-announcement { position: fixed; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	.join-sheet, .remote-stage, .coach-card, .notes, .feed, .session-menu { border: 1px solid var(--hair); border-radius: var(--radius-xl); background: var(--surface); box-shadow: var(--shadow-soft); }
	.session-menu { padding: 12px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.session-menu p { color: var(--muted); font-size: 12px; }
	.session-menu button { min-height: 44px; border: 1px solid var(--hair); border-radius: 999px; background: transparent; color: var(--fg); padding: 0 14px; font-weight: 760; }
	.join-sheet { position:fixed; width:min(calc(100% - 24px),620px); inset:auto 12px 112px; margin:auto; grid-template-columns:112px 1fr; gap:14px; align-items:center; padding:14px; color:var(--fg); }
	.join-sheet[open] { display:grid; }
	.join-sheet::backdrop { background:color-mix(in srgb,#000 48%,transparent); }
	.sheet-close { grid-column:1 / -1; justify-self:end; min-height:44px; border:1px solid var(--hair); border-radius:999px; padding:0 14px; background:var(--surface-2); color:var(--fg); font-weight:760; }
	.join-sheet img { width: 112px; height: 112px; border-radius: 18px; background: #fff; padding: 7px; }
	.join-sheet p { color: var(--muted); font-size: 12px; line-height: 1.4; }
	.question-sheet { position: fixed; width: min(calc(100% - 24px), 680px); max-height: calc(100dvh - 24px); inset: auto 12px 12px; margin: auto; border: 1px solid var(--hair); border-radius: 28px; background: var(--bg); color: var(--fg); box-shadow: var(--shadow-soft); padding: 14px; grid-template-rows: auto auto minmax(0, 1fr) auto; gap: 12px; }
	.question-sheet[open] { display: grid; }
	.question-sheet::backdrop { background: color-mix(in srgb, #000 60%, transparent); }
	.question-sheet-head { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
	.question-sheet-head h2 { margin-top: 4px; font-size: clamp(24px, 7vw, 36px); line-height: 1; letter-spacing: -.8px; }
	.question-sheet .sheet-close { grid-column: auto; flex: 0 0 auto; }
	.question-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
	.question-filters button, .question-actions button, .question-sheet-foot a { min-height: 44px; border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); padding: 0 10px; font: inherit; font-size: 12px; font-weight: 760; }
	.question-filters button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
	.question-list { min-height: 88px; overflow-y: auto; display: grid; align-content: start; gap: 8px; }
	.question-list article { border: 1px solid var(--hair); border-radius: 18px; background: var(--surface); padding: 12px; }
	.question-list article.hidden { opacity: .62; border-style: dashed; }
	.question-list article > p { margin: 8px 0 12px; line-height: 1.45; overflow-wrap: anywhere; }
	.question-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 5px 10px; color: var(--muted); font-size: 11px; }
	.question-meta strong { color: var(--fg); }
	.question-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
	.question-actions button:disabled { opacity: .48; }
	.questions-empty { align-self: center; margin: 18px; color: var(--muted); text-align: center; line-height: 1.45; }
	.question-sheet-foot { display: grid; gap: 8px; border-top: 1px solid var(--hair); padding-top: 10px; }
	.question-sheet-foot p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.4; }
	.question-sheet-foot div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
	.question-sheet-foot a { display: flex; align-items: center; justify-content: center; text-align: center; text-decoration: none; }
	.url { color: var(--fg) !important; font-size: 13px !important; font-weight: 800; word-break: break-all; margin: 4px 0; }
	.remote-stage { padding: 12px; display: grid; gap: 10px; }
	.slide-meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: var(--muted); font-size: 12px; }
	.mini-slide { width: min(58vw, 280px); justify-self: center; aspect-ratio: 9 / 12; max-height: 30dvh; border: 1px solid var(--hair); border-radius: 22px; padding: clamp(14px, 4.5vw, 22px); display: flex; flex-direction: column; justify-content: center; overflow: hidden; background: color-mix(in srgb, var(--bg) 84%, #000); container-type: size; --fluid-eyebrow-min: 8px; --fluid-eyebrow: 2.8cqw; --fluid-gap: 2cqw; --fluid-h1-min: 18px; --fluid-h1: 8cqw; --fluid-h1-max: 32px; --fluid-metric: 17cqw; --fluid-bodygap: 2.5cqw; --fluid-body-min: 11px; --fluid-body: 3.6cqw; --fluid-body-max: 18px; }
	.slide-title span { color: var(--muted); font-size: 12px; }
	.slide-title h1 { font-size: clamp(24px, 8vw, 42px); line-height: .94; letter-spacing: -1.1px; margin-top: 4px; }
	.signal-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
	.signal-strip article { border: 1px solid var(--hair); border-radius: 18px; background: var(--surface-2); padding: 10px; }
	.signal-strip strong { display: block; font-size: 22px; letter-spacing: -.6px; }
	.signal-strip span { color: var(--muted); font-size: 10px; }
	.signal-strip article.hot { border-color: color-mix(in srgb, var(--accent) 70%, var(--hair)); }
	.coach-card { overflow: hidden; }
	.coach-toggle { width: 100%; min-height: 52px; border: 0; border-radius: 0; display: flex; justify-content: space-between; align-items: center; background: transparent; }
	.coach-body { padding: 0 14px 14px; display: grid; gap: 12px; }
	.coach-body p, .notes p, .feed p { color: var(--muted); font-size: 12px; line-height: 1.45; }
	.spark { display: flex; align-items: end; gap: 4px; height: 40px; }
	.spark span { flex: 1; height: var(--h); border-radius: 999px 999px 3px 3px; background: var(--accent); opacity: .54; }
	.checklist { display: grid; grid-template-columns: 1fr; gap: 8px; }
	.checklist article { border: 1px solid var(--hair); border-radius: 14px; padding: 10px; }
	.checklist article.good { border-color: color-mix(in srgb, var(--accent) 58%, var(--hair)); }
	.checklist strong { display: block; font-size: 12px; }
	.checklist p { margin: 3px 0 0; color: var(--muted); font-size: 11px; line-height: 1.35; }
	.notes, .feed { padding: 12px 14px; }
	.feed { max-height: 128px; overflow: auto; display: grid; gap: 6px; }
	.feed p { margin: 0; display: grid; grid-template-columns: 76px 1fr; gap: 8px; }
	.feed strong { color: var(--fg); font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
	.remote-controls { position: fixed; left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); z-index: 5; display: grid; grid-template-columns: .9fr 1.1fr; gap: 10px; }
	.remote-controls button { min-height: 72px; font-size: 18px; box-shadow: var(--shadow-soft); }
	.remote-controls .secondary { background: color-mix(in srgb, var(--bg) 94%, var(--fg) 6%); backdrop-filter: blur(18px); }
	.remote-controls .primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); font-size: 22px; }
	.remote-controls button:disabled { opacity: .42; }
	.dialog-backdrop { position: fixed; inset: 0; width:100%; height:100%; max-width:none; max-height:none; z-index: 100; border:0; background:transparent; padding:12px; color:var(--fg); }
	.dialog-backdrop[open] { display:grid; align-items:end; }
	.dialog-backdrop::backdrop { background: color-mix(in srgb, #000 64%, transparent); }
	.end-dialog { width: min(100%, 620px); margin: 0 auto; border: 1px solid var(--hair); border-radius: 28px; background: var(--bg); padding: 20px; box-shadow: var(--shadow-soft); }
	.end-dialog h2 { margin-top: 8px; font-size: clamp(26px, 8vw, 40px); line-height: 1; letter-spacing: -1px; }
	.end-dialog p { margin-top: 12px; color: var(--muted); line-height: 1.5; }
	.end-dialog .end-error { color: var(--fg); border-left: 3px solid var(--accent); padding-left: 10px; }
	.dialog-actions { display: grid; gap: 8px; margin-top: 18px; }
	.dialog-actions button { min-height: 52px; border: 1px solid var(--hair); border-radius: 999px; background: var(--surface); color: var(--fg); font: inherit; font-weight: 780; }
	.dialog-actions .dialog-primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
	.end-state { min-height: 100dvh; display: grid; place-items: center; padding: 24px; }
	.end-card { width: min(100%, 560px); border: 1px solid var(--hair); border-radius: 30px; background: var(--surface); box-shadow: var(--shadow-soft); padding: clamp(22px, 7vw, 38px); }
	.end-card h1 { margin-top: 10px; font-size: clamp(32px, 9vw, 54px); line-height: .96; letter-spacing: -1.6px; }
	.end-card > p { margin-top: 12px; color: var(--muted); line-height: 1.5; }
	.end-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 20px; }
	.end-stats article { border: 1px solid var(--hair); border-radius: 18px; padding: 12px; }
	.end-stats strong, .end-stats span { display: block; }
	.end-stats strong { font-size: 24px; }
	.end-stats span { margin-top: 2px; color: var(--muted); font-size: 10px; }
	.end-links { display: grid; gap: 10px; margin-top: 20px; }
	.primary-link, .secondary-link { display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 999px; text-decoration: none; font-weight: 800; }
	.primary-link { background: var(--accent); color: var(--accent-fg); }
	.secondary-link { color: var(--muted); min-height: 44px; }
	.export-link { display: flex; align-items: center; justify-content: center; min-height: 48px; text-decoration: none; }
	.export-hint { margin: 0 0 4px; font-size: 12px; color: var(--muted); text-align: center; }
	@media (max-width: 560px) { .topbar { grid-template-columns: 1fr; } nav { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); } nav a, nav button { min-width: 0; width: 100%; } }
	@media (max-width: 340px) { .question-sheet { width: calc(100% - 12px); inset-inline: 6px; padding: 10px; } .question-sheet-foot div { grid-template-columns: 1fr; } }
	@media (max-height: 700px) { .mini-slide { width: min(50vw, 220px); max-height: 24dvh; } .slide-title h1 { font-size: clamp(22px, 7vw, 34px); } .notes, .feed { display:none; } }
	@media (min-width: 780px) { main { max-width: 780px; margin: 0 auto; } .mini-slide { max-height: 56dvh; } }
</style>
