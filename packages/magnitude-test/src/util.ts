import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PlannerClient, TestCaseDefinition } from "magnitude-core";
import { init } from '@paralleldrive/cuid2';

const createId = init({ length: 12 });

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

export function tryDeriveEnvironmentPlannerClient(): PlannerClient | null {
    // Order by approximate model suitability as planner

    // Best: Gemini 2.5 pro
    if (process.env.GOOGLE_API_KEY) {
        // Google AI Studio
        return {
            'provider': 'google-ai',
            'options': {
                model: 'gemini-2.5-pro-preview-03-25',
                apiKey: process.env.GOOGLE_API_KEY
            }
        }
    }
    // Patching out until vertex AI authorization issues are resolved
    // if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    //     // Google Vertex AI
    //     return {
    //         'provider': 'vertex-ai',
    //         'options': {
    //             location: 'us-central1',
    //             model: 'gemini-2.5-pro-preview-03-25'
    //         }
    //     }
    // }
    if (process.env.OPENROUTER_API_KEY) {
        return {
            'provider': 'openai-generic',
            'options': {
                baseUrl: "https://openrouter.ai/api/v1",
                model: 'google/gemini-2.5-pro-preview-03-25',
                apiKey: process.env.OPENROUTER_API_KEY
            }
        }
    }
    // Good
    if (process.env.ANTHROPIC_API_KEY) {
        return {
            'provider': 'anthropic',
            'options': {
                model: 'claude-3-7-sonnet-latest',
                apiKey: process.env.ANTHROPIC_API_KEY
            }
        }
    }
    // Ok
    if (process.env.OPENAI_API_KEY) {
        return {
            'provider': 'openai',
            'options': {
                model: 'gpt-4.1-2025-04-14',
                apiKey: process.env.OPENAI_API_KEY
            }
        }
    }

    return null;
}

export function getMachineId(): string {
    // Define storage location
    const dir = path.join(os.homedir(), '.magnitude');
    const filePath = path.join(dir, 'user.json');

    try {
        // Read existing ID if available
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (data.id) return data.id;
        }

        // Generate new ID if needed
        //console.log(`generating new ID in ${filePath}`)
        fs.mkdirSync(dir, { recursive: true });
        const id = createId();
        fs.writeFileSync(filePath, JSON.stringify({ id }));
        return id;
    } catch {
        // Fallback to temporary ID if storage fails
        return createId();
    }
}

export function describeModel(client: PlannerClient) {
    if ('model' in client.options) {
        return `${client.provider}:${client.options.model}`;
    } else {
        return `${client.provider}`;
    }
}

export interface TelemetryPayload {
	version: string, // telemetry payload version will prob be nice in the future
	userId: string, // anon cuid2 stored on local machines
	startedAt: number, // timestamp
	doneAt: number, // timestamp
	cached: boolean, // whether used a cached recipe
	testCase: {
		numSteps: number, // total num steps
		numChecks: number // total num checks
	},
	actionCount: number, // number of web actions taken
	macroUsage: {
		provider: string,
		model: string,
		inputTokens: number,
		outputTokens: number,
		numCalls: number
	}
	microUsage: {
		provider: string,
		numCalls: number
	},
	result: string//'passed' | 'bug' | 'misalignment'
};
