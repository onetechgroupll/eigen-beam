import type { Slide } from '$lib/decks';

export type SlideDensity = 'spacious' | 'standard' | 'dense';

export type SlideFitProfile = {
	density: SlideDensity;
	needsScrim: boolean;
	textScore: number;
	cssClass: string;
};

export function slideFitProfile(slide: Slide): SlideFitProfile {
	const textScore = slideTextScore(slide);
	const density: SlideDensity = textScore >= 220 ? 'dense' : textScore >= 120 ? 'standard' : 'spacious';
	const needsScrim = Boolean(slide.image && slide.kind === 'image');
	const cssClass = [
		`fit-${density}`,
		needsScrim ? 'needs-scrim' : ''
	].filter(Boolean).join(' ');
	return { density, needsScrim, textScore, cssClass };
}

export function slideTextScore(slide: Slide): number {
	let score = textLen(slide.eyebrow) * 0.7 + textLen(slide.headline) * 1.5 + textLen(slide.body);
	score += (slide.reveal ?? []).reduce((sum, item) => sum + textLen(item) * 0.9, 0);
	score += (slide.timeline ?? []).reduce((sum, item) => sum + textLen(item.label) + textLen(item.text), 0);
	if (slide.compare) {
		score += textLen(slide.compare.leftTitle) + textLen(slide.compare.leftBody);
		score += textLen(slide.compare.rightTitle) + textLen(slide.compare.rightBody);
	}
	if (slide.kind === 'quote') score += textLen(slide.quote ?? slide.headline) * 1.2;
	if (slide.kind === 'number') score *= 0.6;
	return Math.round(score);
}

function textLen(value: string | undefined): number {
	return value?.trim().length ?? 0;
}
