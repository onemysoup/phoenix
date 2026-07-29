/**
 * URL policy for browser navigation.
 *
 * MCP callers are not implicitly trusted to access local services. This guard
 * rejects dangerous schemes and obvious private-network targets before a page
 * is allowed to navigate. DNS rebinding still requires an egress proxy in a
 * multi-tenant deployment, so this is a local safety layer rather than a
 * complete network boundary.
 */
import { lookup } from "node:dns/promises";
const BLOCKED_HOSTS = new Set([
    "metadata.google.internal",
    "metadata.azure.internal",
    "instance-data",
]);
const DNS_CACHE_TTL_MS = 60_000;
const resolvedHostCache = new Map();
function isPrivateIpv4(host) {
    const parts = host.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return false;
    const [a, b] = parts;
    return a === 0 || a === 10 || a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127);
}
function isPrivateIpv6(host) {
    const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
    return normalized === "::1" || normalized === "::" ||
        normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
        normalized.startsWith("fea") || normalized.startsWith("feb") ||
        normalized.startsWith("fc") || normalized.startsWith("fd");
}
function isPrivateAddress(address) {
    return isPrivateIpv4(address) || isPrivateIpv6(address);
}
export function assertNavigationAllowed(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    }
    catch {
        throw new Error("Navigation URL must be an absolute HTTP(S) URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(`Navigation protocol is not allowed: ${url.protocol}`);
    }
    if (url.username || url.password) {
        throw new Error("Navigation URLs with embedded credentials are not allowed.");
    }
    const host = url.hostname.toLowerCase();
    const allowLocal = process.env.PHOENIX_ALLOW_PRIVATE_NETWORK === "true";
    if (!allowLocal && (BLOCKED_HOSTS.has(host) || host.endsWith(".local") || isPrivateIpv4(host) || isPrivateIpv6(host))) {
        throw new Error(`Navigation target is blocked by the private-network policy: ${host}`);
    }
    return url;
}
/**
 * Checks DNS results before a browser request. The cache bounds resolver
 * overhead for page subresources. This is defense in depth: the browser has
 * its own resolver, so production deployments still need egress controls.
 */
export async function assertResolvedNavigationAllowed(rawUrl) {
    const url = assertNavigationAllowed(rawUrl);
    if (process.env.PHOENIX_ALLOW_PRIVATE_NETWORK === "true")
        return url;
    const host = url.hostname;
    if (isPrivateAddress(host))
        return url;
    const cached = resolvedHostCache.get(host);
    let addresses = cached && cached.expiresAt > Date.now() ? cached.addresses : undefined;
    if (!addresses) {
        try {
            addresses = (await lookup(host, { all: true, verbatim: true })).map(({ address }) => address);
        }
        catch {
            // Preserve the browser's normal DNS error for unavailable public hosts.
            return url;
        }
        resolvedHostCache.set(host, { addresses, expiresAt: Date.now() + DNS_CACHE_TTL_MS });
    }
    if (addresses.some(isPrivateAddress)) {
        throw new Error(`Navigation target resolves to a private-network address: ${host}`);
    }
    return url;
}
//# sourceMappingURL=url-policy.js.map