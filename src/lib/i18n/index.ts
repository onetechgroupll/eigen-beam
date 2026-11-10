import { catalogs, type TranslationKey } from './catalogs';

export type Locale = keyof typeof catalogs;
export type TranslationParams = Record<string, string | number>;

export const SUPPORTED_LOCALES = Object.keys(catalogs) as Locale[];

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && SUPPORTED_LOCALES.includes(value as Locale);
}

export function t(locale: Locale, key: TranslationKey, params: TranslationParams = {}): string {
	return catalogs[locale][key].replace(/\{(\w+)\}/g, (token, name: string) =>
		Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token
	);
}

export function createTranslator(locale: Locale) {
	return (key: TranslationKey, params?: TranslationParams) => t(locale, key, params);
}

export function resolveLocale(options: { cookie?: string | null; acceptLanguage?: string | null; defaultLocale?: string | null }): Locale {
	if (isLocale(options.cookie)) return options.cookie;
	if (options.acceptLanguage?.trim()) {
		const requested = options.acceptLanguage
			.split(',')
			.map((part, index) => {
				const [tag = '', ...parameters] = part.trim().split(';');
				const qParameter = parameters.map((parameter) => parameter.trim()).find((parameter) => /^q=/i.test(parameter));
				const q = Number(qParameter?.slice(2) ?? 1);
				return { tag: tag.toLowerCase(), q: Number.isFinite(q) ? q : 0, index };
			})
			.sort((a, b) => b.q - a.q || a.index - b.index);
		for (const { tag, q } of requested) {
			if (q <= 0) continue;
			const base = tag.split('-')[0];
			if (isLocale(base)) return base;
		}
	}
	return isLocale(options.defaultLocale) ? options.defaultLocale : 'en';
}

export function detectContentLocale(content: unknown, defaultLocale?: string | null): Locale {
	const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
	const germanStrong = (text.match(/[äöüß]/gi) ?? []).length;
	const germanWords = (text.match(/\b(?:aber|alle|als|auch|auf|aus|bei|das|der|die|durch|eine|einen|ergebnis|ergebnisse|für|gemeinsam|heute|ist|jetzt|kosten|kunde|kunden|mehr|mit|morgen|nachher|nächste|nicht|ohne|schritt|sinken|sinkt|steigen|steigt|umsatz|umsätze|und|vorher|was|weniger|wir|wachstum|ziel|ziele)\b/gi) ?? []).length;
	const englishWords = (text.match(/\b(?:a|an|and|are|as|at|before|by|cost|costs|customer|customers|for|from|growth|is|more|next|not|now|of|on|revenue|step|the|this|today|together|tomorrow|up|we|what|with|without|your)\b/gi) ?? []).length;
	const german = germanStrong * 3 + germanWords;
	const english = englishWords;
	const fallback = configuredDefaultLocale(defaultLocale);
	if (Math.max(german, english) < 2 || german === english) return fallback;
	return german > english ? 'de' : 'en';
}

function configuredDefaultLocale(value?: string | null): Locale {
	if (isLocale(value)) return value;
	const environmentLocale = typeof process === 'undefined' ? undefined : process.env.EB_DEFAULT_LOCALE;
	return isLocale(environmentLocale) ? environmentLocale : 'en';
}

export { catalogs, type TranslationKey } from './catalogs';
