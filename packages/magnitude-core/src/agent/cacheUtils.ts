import { Image } from '@/memory/image';
import phash from 'sharp-phash';

/**
 * Computes the Perceptual Hash (pHash) for a given image.
 * @param screenshot The Image object to hash.
 * @returns A 64-character binary pHash string.
 */
export async function computePHash(screenshot: Image): Promise<string> {
    // sharp-phash requires a Buffer. We can get this from our Image class.
    const buffer = Buffer.from(await screenshot.toBase64(), 'base64');
    
    // The library returns a Promise<string> with a 64-character binary string
    const bitString = await phash(buffer);
    
    // The hash is already a 64-character binary string (0s and 1s)
    // If you need it as hex, convert the binary string to hex
    const hexHash = BigInt("0b" + bitString).toString(16).padStart(16, "0");
    
    return hexHash; // or return hashString if you want the binary format
}