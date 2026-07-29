/**
 * URL policy for browser navigation.
 *
 * MCP callers are not implicitly trusted to access local services. This guard
 * rejects dangerous schemes and obvious private-network targets before a page
 * is allowed to navigate. DNS rebinding still requires an egress proxy in a
 * multi-tenant deployment, so this is a local safety layer rather than a
 * complete network boundary.
 */
export declare function assertNavigationAllowed(rawUrl: string): URL;
/**
 * Checks DNS results before a browser request. The cache bounds resolver
 * overhead for page subresources. This is defense in depth: the browser has
 * its own resolver, so production deployments still need egress controls.
 */
export declare function assertResolvedNavigationAllowed(rawUrl: string): Promise<URL>;
