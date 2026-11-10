import { getContext, setContext } from 'svelte';
import { createTranslator, type Locale } from './index';

const I18N_CONTEXT = Symbol('eigenbeam-i18n');

export type I18nContext = {
	locale: Locale;
	t: ReturnType<typeof createTranslator>;
};

export function setI18nContext(locale: Locale): I18nContext {
	const context = { locale, t: createTranslator(locale) };
	setContext(I18N_CONTEXT, context);
	return context;
}

export function useI18n(): I18nContext {
	return getContext<I18nContext>(I18N_CONTEXT);
}
