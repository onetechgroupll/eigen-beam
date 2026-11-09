import type { ReplaySnapshot } from './server/rooms';
import { buildDeckV2Draft } from './deck-v2-draft';
import { buildFollowUpPack } from './follow-up-pack';
import { buildSessionSummary } from './session-summary';
import { buildSlideHeatmap } from './slide-heatmap';

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
	const summary = buildSessionSummary(replay);
	const heatmap = buildSlideHeatmap(replay);
	const deckV2 = buildDeckV2Draft(replay);
	const followUp = buildFollowUpPack(replay);
	const actions: SessionCoachAction[] = [];
	if (heatmap.confusing) {
		actions.push({
			kind: 'clarify',
			priority: 'high',
			label: `${heatmap.confusing.label} früher erklären`,
			detail: `Vor „${heatmap.confusing.headline}“ eine kurze Begriff-/Kontextfolie einsetzen. Der V2-Draft enthält dafür bereits eine Klarstellungsfolie.`
		});
	}
	if (heatmap.hottest && heatmap.hottest.score > 0) {
		actions.push({
			kind: 'reuse',
			priority: actions.length ? 'medium' : 'high',
			label: `${heatmap.hottest.label} als Proof-Moment behalten`,
			detail: `„${heatmap.hottest.headline}“ war die stärkste Folie (${heatmap.hottest.why}). Nicht kürzen — eher als Beweisanker nutzen.`
		});
	}
	actions.push({
		kind: 'followup',
		priority: summary.totals.engagements > 0 ? 'medium' : 'low',
		label: 'Follow-up heute noch senden',
		detail: `Den Follow-up-Pack mit Replay/Summary/Takeaway verschicken. Betreff: „${followUp.subject}“.`,
	});
	actions.push({
		kind: 'rehearse',
		priority: 'low',
		label: 'V2-Draft einmal laut testen',
		detail: `${deckV2.slides.length} Folien im V2-Draft durchgehen; bei jeder Folie nur eine Aussage stehen lassen.`
	});
	const normalized = actions.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
	const coach = { id: replay.id, headline: 'Next Talk Checklist', actions: normalized };
	return { ...coach, markdown: sessionCoachMarkdown(coach) };
}

export function sessionCoachMarkdown(coach: Omit<SessionCoach, 'markdown'>): string {
	const lines = ['# Session Coach', '', `Room: ${coach.id}`, '', `## ${coach.headline}`];
	for (const action of coach.actions) lines.push(`- [${action.priority}] ${action.label}: ${action.detail}`);
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function priorityRank(priority: SessionCoachPriority): number {
	if (priority === 'high') return 0;
	if (priority === 'medium') return 1;
	return 2;
}
