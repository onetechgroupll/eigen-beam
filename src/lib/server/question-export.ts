import type { PresenterQuestion } from './rooms';

export function questionExportMarkdown(
	questions: PresenterQuestion[],
	labels: { heading: string; slide: string },
	includeHidden = false
): string {
	const exported = questions
		.filter((question) => includeHidden || !question.hidden)
		.sort((a, b) => a.slide - b.slide || Number(b.status === 'starred') - Number(a.status === 'starred') || a.ts - b.ts || a.id.localeCompare(b.id));
	const lines = [`# ${labels.heading}`, ''];
	let currentSlide: number | undefined;
	for (const question of exported) {
		if (question.slide !== currentSlide) {
			if (currentSlide !== undefined) lines.push('');
			currentSlide = question.slide;
			lines.push(`## ${labels.slide} ${question.slide + 1}`, '');
		}
		const marker = question.status === 'starred' ? '⭐ ' : '';
		const text = question.text.replace(/\s+/g, ' ').trim();
		lines.push(`- ${marker}[${new Date(question.ts).toISOString()}] ${text}`);
	}
	lines.push('');
	return lines.join('\n');
}
