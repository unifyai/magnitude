/**
 * HTTP message serialization and deserialization utilities
 * Based on the HTTP wire format protocol
 */

/**
 * Serializes a Request object to an HTTP wire format byte array
 * @param request The Request object to serialize
 * @returns A Promise resolving to a Uint8Array containing the HTTP wire format
 */
export async function serializeRequest(request: Request): Promise<Uint8Array> {
    // Clone the request to avoid consuming the original
    const clone = request.clone();

    // Extract URL details
    const url = new URL(clone.url);
    const path = url.pathname + url.search;

    // Start building the request line
    const startLine = `${clone.method} ${path} HTTP/1.1`;

    // Build headers
    const headers = new Headers(clone.headers);

    // Set Host header if not already present
    if (!headers.has('Host')) {
        headers.set('Host', url.host);
    }

    return serializeHttpMessage(startLine, headers, clone);
}

/**
 * Serializes a Response object to an HTTP wire format byte array
 * @param response The Response object to serialize
 * @returns A Promise resolving to a Uint8Array containing the HTTP wire format
 */
export async function serializeResponse(response: Response): Promise<Uint8Array> {
    // Clone the response to avoid consuming the original
    const clone = response.clone();

    // Start building the status line
    const startLine = `HTTP/1.1 ${clone.status} ${clone.statusText}`;

    return serializeHttpMessage(startLine, clone.headers, clone);
}

/**
 * Common logic for serializing HTTP messages
 */
async function serializeHttpMessage(
    startLine: string,
    headers: Headers,
    bodyProvider: Request | Response
): Promise<Uint8Array> {
    // Convert headers to text
    let headersText = '';
    headers.forEach((value, name) => {
        headersText += `${name}: ${value}\r\n`;
    });

    // Get body as ArrayBuffer (if it exists)
    let bodyBytes = new Uint8Array(0);

    if (bodyProvider.bodyUsed === false && bodyProvider.body !== null) {
        try {
            const bodyBuffer = await bodyProvider.clone().arrayBuffer();
            if (bodyBuffer && bodyBuffer.byteLength > 0) {
                bodyBytes = new Uint8Array(bodyBuffer);

                // Ensure Content-Length header is present if not already added and not chunked encoding
                if (!headers.has('Content-Length') && !headers.has('Transfer-Encoding')) {
                    headersText += `Content-Length: ${bodyBytes.length}\r\n`;
                }

                // Ensure Content-Type is set if not already present
                if (!headers.has('Content-Type')) {
                    // Default to application/octet-stream for binary data
                    headersText += `Content-Type: application/octet-stream\r\n`;
                }
            }
        } catch (e) {
            // No body or error reading body
        }
    }

    // Combine everything into a single string, then convert to bytes
    const httpMessage = `${startLine}\r\n${headersText}\r\n`;
    const messageBytes = new TextEncoder().encode(httpMessage);

    // Create final result with message + body
    const result = new Uint8Array(messageBytes.length + bodyBytes.length);
    result.set(messageBytes, 0);
    if (bodyBytes.length > 0) {
        result.set(bodyBytes, messageBytes.length);
    }

    return result;
}

/**
 * Parse an HTTP request from wire format
 * @param bytes Raw HTTP request bytes in wire format
 * @returns A Request object
 */
export function deserializeRequest(bytes: Uint8Array): Request {
    const { startLine, headers, body } = parseHttpMessage(bytes);
    const parts = startLine.split(' ');

    if (parts.length < 3) {
        throw new Error('Invalid HTTP request line');
    }

    const method = parts[0];
    const path = parts[1];

    // Reconstruct the full URL from host and path
    let url = '';
    const host = headers['Host'] || headers['host'];

    if (host) {
        // Check if the path is already an absolute URL
        if (path.startsWith('http://') || path.startsWith('https://')) {
            url = path;
        } else {
            // Assume HTTPS if not specified
            url = `https://${host}${path}`;
        }
    } else {
        // Without host, we need to use a relative URL or placeholder
        url = path;
    }

    // Create and return the Request object
    return new Request(url, {
        method,
        headers,
        body
    });
}

/**
 * Parse an HTTP response from wire format
 * @param bytes Raw HTTP response bytes in wire format
 * @returns A Response object
 */
export function deserializeResponse(bytes: Uint8Array): Response {
    const { startLine, headers, body } = parseHttpMessage(bytes);
    const parts = startLine.split(' ');

    if (parts.length < 3) {
        throw new Error('Invalid HTTP status line');
    }

    // Parse status code and text
    const status = parseInt(parts[1], 10);
    const statusText = parts.slice(2).join(' ');

    // Create and return the Response object
    return new Response(body, {
        status,
        statusText,
        headers
    });
}

/**
 * Common logic for parsing HTTP messages
 */
function parseHttpMessage(bytes: Uint8Array): {
    startLine: string;
    headers: Record<string, string>;
    body: BodyInit | undefined;
} {
    const text = new TextDecoder().decode(bytes);

    // Find the end of headers section
    const headersEndIndex = text.indexOf('\r\n\r\n');
    if (headersEndIndex === -1) {
        throw new Error('Invalid HTTP message format');
    }

    // Split headers section into lines
    const headerSection = text.substring(0, headersEndIndex);
    const lines = headerSection.split('\r\n');

    // First line is start line (request line or status line)
    const startLine = lines[0];

    // Parse headers
    const headers: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const colonPos = line.indexOf(':');
        if (colonPos === -1) continue; // Skip invalid header

        const name = line.substring(0, colonPos).trim();
        const value = line.substring(colonPos + 1).trim();
        headers[name] = value;
    }

    // Extract body
    let body: BodyInit | undefined = undefined;
    const bodyStartIndex = headersEndIndex + 4; // Skip \r\n\r\n

    if (bodyStartIndex < bytes.length) {
        // Check if we have a Content-Length header
        const contentLength = headers['Content-Length'] || headers['content-length'];
        if (contentLength) {
            const length = parseInt(contentLength, 10);
            if (bodyStartIndex + length <= bytes.length) {
                // Create a new Uint8Array containing just the body bytes
                const bodyBytes = bytes.slice(bodyStartIndex, bodyStartIndex + length);

                // Determine content type to decide how to handle the body
                const contentType = headers['Content-Type'] || headers['content-type'] || '';

                if (contentType.includes('text/') ||
                    contentType.includes('application/json') ||
                    contentType.includes('application/x-www-form-urlencoded')) {
                    // For text-based content types, convert to string
                    body = new TextDecoder().decode(bodyBytes);
                } else {
                    // For binary content, use the Uint8Array directly
                    body = bodyBytes;
                }
            }
        } else {
            // Without Content-Length, just take the rest as string
            body = text.substring(bodyStartIndex);
        }
    }

    return { startLine, headers, body };
}

/**
 * Converts a Request to a base64 string
 */
export async function requestToBase64(request: Request): Promise<string> {
    const bytes = await serializeRequest(request);
    return bytesToBase64(bytes);
}

/**
 * Creates a Request from a base64 string
 */
export function requestFromBase64(base64: string): Request {
    const bytes = base64ToBytes(base64);
    return deserializeRequest(bytes);
}

/**
 * Converts a Response to a base64 string
 */
export async function responseToBase64(response: Response): Promise<string> {
    const bytes = await serializeResponse(response);
    return bytesToBase64(bytes);
}

/**
 * Creates a Response from a base64 string
 */
export function responseFromBase64(base64: string): Response {
    const bytes = base64ToBytes(base64);
    return deserializeResponse(bytes);
}

// Helper functions for base64 conversion
function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}