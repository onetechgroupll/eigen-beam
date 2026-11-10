import type { ReplaySnapshot } from './server/rooms';
import { buildDeckV2Draft } from './deck-v2-draft';
import { buildFollowUpPack } from './follow-up-pack';
import { buildSessionSummary } from './session-summary';
import { buildSlideHeatmap } from './slide-heatmap';
import { detectContentLocale, type Locale } from './i18n';

export type SessionCoachActionKind = 'clarify' | 'reuse' | 'followup' | 'rehearse';
export type SessionCoachPriority = 'high' | 'medium' | 'low';

export type SessionCoachAction = {
	kind: SessionCoachActionKind;
	priority: SessionCoachPriority;
	label: string;
	detail: string;
};

export type SessionCoach = {
	id: string;
	headline: string;
	actions: SessionCoachAction[];
	markdown: string;
};

export function buildSessionCoach(replay: ReplaySnapshot): SessionCoach {
	const locale = detectContentLocale(replay.slides);
	const de = locale === 'de';
	const summary = buildSessionSummary(replay);
	const heatmap = buildSlideHeatmap(replay);
	const deckV2 = buildDeckV2Draft(replay);
	const followUp = buildFollowUpPack(replay);
	const actions: SessionCoachAction[] = [];
	if (heatmap.confusing) {
		actions.push({
			kind: 'clarify',
			priority: 'high',
			label: de ? `${heatmap.confusing.label} früher erklären` : `Explain ${heatmap.confusing.label} earlier`,
			detail: de ? `Vor „${heatmap.confusing.headline}“ eine kurze Begriff-/Kontextfolie einsetzen. Der V2-Draft enthält dafür bereits eine Klarstellungsfolie.` : `Add a short term/context slide before “${heatmap.confusing.headline}”. The V2 draft already includes one.`
		});
	}
	if (heatmap.hottest && heatmap.hottest.score > 0) {
		actions.push({
			kind: 'reuse',
			priority: actions.length ? 'medium' : 'high',
			label: de ? `${heatmap.hottest.label} als Proof-Moment behalten` : `Keep ${heatmap.hottest.label} as a proof moment`,
			detail: de ? `„${heatmap.hottest.headline}“ war die stärkste Folie (${heatmap.hottest.why}). Nicht kürzen — eher als Beweisanker nutzen.` : `“${heatmap.hottest.headline}” was the strongest slide (${heatmap.hottest.why}). Keep it as an evidence anchor.`
		});
	}
	actions.push({
		kind: 'followup',
		priority: summary.totals.engagements > 0 ? 'medium' : 'low',
		label: de ? 'Follow-up heute noch senden' : 'Send the follow-up today',
		detail: de ? `Den Follow-up-Pack mit Replay/Summary/Takeaway verschicken. Betreff: „${followUp.subject}“.` : `Send the follow-up pack with replay, summary, and takeaway. Subject: “${followUp.subject}”.`,
	});
	actions.push({
		kind: 'rehearse',
		priority: 'low',
		label: de ? 'V2-Draft einmal laut testen' : 'Rehearse the V2 draft aloud',
		detail: de ? `${deckV2.slides.length} Folien im V2-Draft durchgehen; bei jeder Folie nur eine Aussage stehen lassen.` : `Review all ${deckV2.slides.length} slides in the V2 draft and keep one statement per slide.`
	});
	const normalized = actions.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
	const coach = { id: replay.id, headline: de ? 'Checkliste für den nächsten Talk' : 'Next Talk Checklist', actions: normalized };
	return { ...coach, markdown: sessionCoachMarkdown(coach, locale) };
}

export function sessionCoachMarkdown(coach: Omit<SessionCoach, 'markdown'>, locale: Locale = 'en'): string {
	const de = locale === 'de';
	const lines = [de ? '# Session-Coach' : '# Session Coach', '', `${de ? 'Raum' : 'Room'}: ${coach.id}`, '', `## ${coach.headline}`];
	for (const action of coach.actions) lines.push(`- [${action.priority}] ${action.label}: ${action.detail}`);
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function priorityRank(priority: SessionCoachPriority): number {
	if (priority === 'high') return 0;
	if (priority === 'medium') return 1;
	return 2;
}
