export function securityHeaders(): Record<string, string> {
	return {
		'content-security-policy': [
			"default-src 'self'",
			"script-src 'self' 'unsafe-inline'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data: https:",
			"connect-src 'self' https:",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-ancestors 'none'"
		].join('; '),
		'x-content-type-options': 'nosniff',
		'x-frame-options': 'DENY',
		'referrer-policy': 'strict-origin-when-cross-origin',
		'permissions-policy': 'camera=(), microphone=(), geolocation=()'
	};
}
