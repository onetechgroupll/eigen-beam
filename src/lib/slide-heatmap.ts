import type { PublicSlide } from './decks';
import type { ReplayEvent, ReplaySnapshot } from './server/rooms';

export type SlideHeatmapClassification = 'quiet' | 'warm' | 'hot' | 'confusing';

export type SlideHeatmapPoint = {
	index: number;
	label: string;
	headline: string;
	reactions: number;
	questions: number;
	bookmarks: number;
	score: number;
	intensity: number;
	classification: SlideHeatmapClassification;
	why: string;
};

export type SlideHeatmap = {
	id: string;
	slides: SlideHeatmapPoint[];
	hottest?: SlideHeatmapPoint;
	confusing?: SlideHeatmapPoint;
	markdown: string;
};

export function buildSlideHeatmap(replay: ReplaySnapshot): SlideHeatmap {
	const raw = (replay.slides as PublicSlide[]).map((slide, index) => {
		const reactions = countEvents(replay.events, 'reaction', index);
		const questions = countEvents(replay.events, 'question', index);
		const bookmarks = countEvents(replay.events, 'bookmark', index);
		const score = reactions + questions + bookmarks * 2;
		return {
			index,
			label: `F${index + 1}`,
			headline: slide?.headline ?? `Folie ${index + 1}`,
			reactions,
			questions,
			bookmarks,
			score
		};
	});
	const maxScore = Math.max(1, ...raw.map((slide) => slide.score));
	const slides = raw.map((slide) => {
		const intensity = Math.round((slide.score / maxScore) * 100);
		return {
			...slide,
			intensity,
			classification: classifySlide(slide.score, intensity, slide.questions, slide.bookmarks),
			why: signalReason(slide.reactions, slide.questions, slide.bookmarks)
		};
	});
	const hottest = [...slides].sort((a, b) => b.score - a.score || a.index - b.index)[0];
	const confusing = [...slides].filter((slide) => slide.questions > 0).sort((a, b) => b.questions - a.questions || b.score - a.score || a.index - b.index)[0];
	const base = { id: replay.id, slides, hottest, confusing };
	return { ...base, markdown: slideHeatmapMarkdown(base) };
}

export function slideHeatmapMarkdown(heatmap: Omit<SlideHeatmap, 'markdown'>): string {
	const lines = [
		'# Slide Heatmap',
		'',
		`Room: ${heatmap.id}`,
		'',
		'## Resonanz je Folie'
	];
	for (const slide of heatmap.slides) {
		lines.push(`- ${slide.label} „${slide.headline}“ — ${slide.intensity}% · ${slide.classification} · ${slide.why}`);
	}
	if (heatmap.hottest) lines.push('', `Heißeste Folie: ${heatmap.hottest.label} „${heatmap.hottest.headline}“.`);
	if (heatmap.confusing) lines.push(`Meiste Fragen: ${heatmap.confusing.label} „${heatmap.confusing.headline}“.`);
	return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function countEvents(events: ReplayEvent[], type: ReplayEvent['type'], slide: number): number {
	return events.filter((event) => event.type === type && event.slide === slide).length;
}

function classifySlide(score: number, intensity: number, questions: number, bookmarks: number): SlideHeatmapClassification {
	if (score === 0) return 'quiet';
	if (questions >= 2 && questions >= bookmarks + 1) return 'confusing';
	if (intensity >= 70) return 'hot';
	return 'warm';
}

function signalReason(reactions: number, questions: number, bookmarks: number): string {
	const parts = [
		reactions ? `${reactions}× Reaktion` : '',
		questions ? `${questions}× Frage` : '',
		bookmarks ? `${bookmarks}× Merker` : ''
	].filter(Boolean);
	return parts.length ? parts.join(' · ') : 'keine Signale';
}
