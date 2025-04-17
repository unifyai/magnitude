import { TestCaseDefinition } from "magnitude-core";

const IPV4_IN_IPV6_PREFIX = '::f{4}:';

const LOOPBACK_IP_RANGES = [
    // 127.0.0.0 - 127.255.255.255 (IPv4 loopback)
    new RegExp(`^(${IPV4_IN_IPV6_PREFIX})?127\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}`),
    // ::1 (IPv6 loopback)
    /^::1$/
];

const PRIVATE_IP_RANGES = [
    // 10.0.0.0 - 10.255.255.255
    new RegExp(`^(${IPV4_IN_IPV6_PREFIX})?10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}`),
    // 169.254.1.0 - 169.254.254.255
    new RegExp(`^(${IPV4_IN_IPV6_PREFIX})?169\\.254\\.([1-9]|1?\\d\\d|2[0-4]\\d|25[0-4])\\.\\d{1,3}`),
    // 172.16.0.0 - 172.31.255.255
    new RegExp(`^(${IPV4_IN_IPV6_PREFIX})?(172\\.1[6-9]|172\\.2\\d|172\\.3[0-1])\\.\\d{1,3}\\.\\d{1,3}`),
    // 192.168.0.0 - 192.168.255.255
    new RegExp(`^(${IPV4_IN_IPV6_PREFIX})?192\\.168\\.\\d{1,3}\\.\\d{1,3}`),
    // fc00::/7 - Unique local addresses
    /^f[c-d][0-9a-f]{2}(::1$|:[0-9a-f]{1,4}){1,7}/,
    // fe80::/10 - Link-local addresses
    /^fe[89ab][0-9a-f](::1$|:[0-9a-f]{1,4}){1,7}/,
    // Include loopback ranges in private ranges
    ...LOOPBACK_IP_RANGES
];

const SPECIAL_LOCAL_IPS = ['::1', '::', '0.0.0.0'];

const LOCALHOST_DOMAINS = ['localhost'];

export function isLoopbackIp(address: string): boolean {
    return (
        SPECIAL_LOCAL_IPS.includes(address) ||
        LOOPBACK_IP_RANGES.some(pattern => pattern.test(address))
    );
}

export function isPrivateIp(address: string): boolean {
    return (
        SPECIAL_LOCAL_IPS.includes(address) ||
        PRIVATE_IP_RANGES.some(pattern => pattern.test(address))
    );
}

export function extractHostname(urlOrHostname: string): string {
    try {
        if (!urlOrHostname.includes('://')) {
            urlOrHostname = 'http://' + urlOrHostname;
        }
        const parsedUrl = new URL(urlOrHostname);
        return parsedUrl.hostname.toLowerCase();
    } catch (error) {
        return urlOrHostname.toLowerCase();
    }
}

export function cleanHostname(hostname: string): string {
    return hostname.replace(/^\[|\]$/g, '');
}

export function isLocalhostDomain(hostname: string): boolean {
    const lowerHostname = hostname.toLowerCase();
    return (
        LOCALHOST_DOMAINS.includes(lowerHostname) ||
        lowerHostname.endsWith('.localhost')
    );
}

export function isLoopbackHost(urlOrHostname: string): boolean {
    try {
        const hostname = extractHostname(urlOrHostname);

        if (isLocalhostDomain(hostname)) {
            return true;
        }

        return isLoopbackIp(cleanHostname(hostname));
    } catch (error) {
        console.error('Invalid URL or hostname:', error);
        return false;
    }
}

export function isPrivateHost(urlOrHostname: string): boolean {
    try {
        const hostname = extractHostname(urlOrHostname);

        if (isLocalhostDomain(hostname)) {
            return true;
        }

        return isPrivateIp(cleanHostname(hostname));
    } catch (error) {
        console.error('Invalid URL or hostname:', error);
        return false;
    }
}

export function isPrivateUrl(url: string): boolean {
    return isPrivateHost(url);
}

export function isLoopbackUrl(url: string): boolean {
    return isLoopbackHost(url);
}

export function sanitizeTestCase(testCase: TestCaseDefinition) {
    // Sanitize test case definition inplace

    // Add protocol if missing to URL
    if (!testCase.url.includes('://')) {
        if (isLoopbackUrl(testCase.url)) {
            // If local, assume HTTP
            testCase.url = `http://${testCase.url}`;
        } else {
            // Otherwise assume HTTPS
            testCase.url = `https://${testCase.url}`;
        }
    }
}

export async function isServerUp(url: string): Promise<boolean> {
    try {
        const response = await fetch(url, {
            method: 'HEAD', // HEAD request is lightweight - just gets headers, not body
            cache: 'no-cache' // Avoid cached responses
        });

        // If we get any response, even an error response, the server is running
        return true;
    } catch (error) {
        // Network error usually means no server is responding
        return false;
    }
}
