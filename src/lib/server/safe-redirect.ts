export function safeLocalRedirectPath(value: string): string {
	return value.startsWith('/')
		&& !value.startsWith('//')
		&& !value.includes('\\')
		&& !/[\u0000-\u001f\u007f]/.test(value)
		? value
		: '/';
}
