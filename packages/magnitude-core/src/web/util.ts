export type KeypressIndicator = '<enter>' | '<tab>';

export function parseTypeContent(content: string): (string | KeypressIndicator)[] {
    // Parse content sequence potentially with special indicators <enter> or <tab> into components
    const regex = /<enter>|<tab>/g;
    const result: string[] = [];
    let lastIndex = 0;

    content.replace(regex, (match, offset) => {
        // Grab the text before the match and trim surrounding whitespace
        const text = content.slice(lastIndex, offset).trim();
        if (text) result.push(text);

        // Add the matched special indicator
        result.push(match);
        lastIndex = offset + match.length;
        return match;
    });

    // Add any remaining text after the last match
    const remaining = content.slice(lastIndex).trim();
    if (remaining) result.push(remaining);

    return result;
}
