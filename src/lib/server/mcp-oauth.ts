export const MCP_SUPPORTED_SCOPES = ['deck:read', 'deck:write', 'room:create', 'asset:upload'] as const;

export type McpProtectedResourceMetadata = {
	resource: string;
	resource_name: string;
	bearer_methods_supported: ['header'];
	scopes_supported: string[];
	authorization_servers?: string[];
};

type EnvLike = Record<string, string | undefined>;

export function mcpProtectedResourceMetadata(baseUrl: string, source: EnvLike = {}): McpProtectedResourceMetadata {
	const origin = baseUrl.replace(/\/$/, '');
	const authServer = source.EB_MCP_AUTHORIZATION_SERVER?.replace(/\/$/, '') || (source.EB_OAUTH_TOKEN_SECRET && source.EB_OAUTH_CLIENTS ? origin : '');
	return {
		resource: `${origin}/mcp`,
		resource_name: 'eigen.beam MCP',
		bearer_methods_supported: ['header'],
		scopes_supported: [...MCP_SUPPORTED_SCOPES],
		...(authServer ? { authorization_servers: [authServer] } : {})
	};
}

export function mcpUnauthorizedHeaders(baseUrl: string): Record<string, string> {
	const origin = baseUrl.replace(/\/$/, '');
	return {
		'www-authenticate': `Bearer realm="eigenbeam", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`
	};
}
