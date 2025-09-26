// IMPORT MODULES
import { Transform, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { Inflate } from 'zlib';

// IMPORT CUSTOM MODULES
import { CONSTANTS } from '../constants.js';

/**
 * Manages PNG file reading and pixel data extraction
 * Supports colorTypes 0, 2 and 6
 */
export class PNGManager {
    /**
     * Creates a new PNG manager instance
     * @param {string} filePath - Path to the PNG file to process
     */
    constructor(filePath) {
        this.filePath = filePath;
    }

    /**
     * Reads and processes PNG file to extract pixel data
     * @returns {Promise<Object>} Object containing width, height, pixels, and colorType
     */
    async readPixels() {
        const startTotal = process.hrtime.bigint();
        
        // Read PNG header information
        const startIHDR = process.hrtime.bigint();
        const { width, height, colorType } = await this._readIHDR();
        const durIHDR = Number(process.hrtime.bigint() - startIHDR) / 1e6;
        console.log(`_readIHDR took ${durIHDR.toFixed(3)} ms`);

        // Determine bytes per pixel for each color type
        const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
        const bpp = bppMap[colorType];
        if (!bpp) throw new Error(`Unsupported colorType: ${colorType}`);

        // Extract and decompress image data
        const startIDAT = process.hrtime.bigint();
        const rawData = await this._extractAndInflateIDAT();
        const durIDAT = Number(process.hrtime.bigint() - startIDAT) / 1e6;
        console.log(`_extractAndInflateIDAT took ${durIDAT.toFixed(3)} ms`);

        // Remove PNG filters from pixel data
        const startFilter = process.hrtime.bigint();
        const pixelBuf = this._reverseFilter(rawData, width, height, bpp);
        const durFilter = Number(process.hrtime.bigint() - startFilter) / 1e6;
        console.log(`_reverseFilter took ${durFilter.toFixed(3)} ms`);

        const durTotal = Number(process.hrtime.bigint() - startTotal) / 1e6;
        console.log(`readPixels total took ${durTotal.toFixed(3)} ms`);

        return { width, height, pixels: pixelBuf, colorType };
    }

    /**
     * Reads PNG header (IHDR chunk) to get image dimensions and format info
     * @returns {Promise<Object>} Object containing width, height, bitDepth, and colorType
     * @private
     */
    async _readIHDR() {
        const { SIGNATURE, SUPPORTED } = CONSTANTS.PNG;
        const fh = await open(this.filePath, 'r');
        const buf = Buffer.alloc(8 + 4 + 4 + 13 + 4); // Signature + IHDR chunk
        await fh.read(buf, 0, buf.length, 0);
        await fh.close();

        // Verify PNG signature
        if (!buf.slice(0, 8).equals(SIGNATURE)) {
            throw new Error('Invalid PNG signature');
        }

        // Parse IHDR data
        const ihdr = buf.slice(16, 16 + 13);
        const width = ihdr.readUInt32BE(0); // Image width
        const height = ihdr.readUInt32BE(4); // Image height
        const bitDepth = ihdr.readUInt8(8); // Bits per sample
        const colorType = ihdr.readUInt8(9); // Color type

        // Validate supported formats
        if (bitDepth !== SUPPORTED.BIT_DEPTH) {
            throw new Error(`Only bitDepth ${SUPPORTED.BIT_DEPTH} supported`);
        }

        if (!SUPPORTED.COLOR_TYPES.includes(colorType)) {
            throw new Error(`Unsupported colorType: ${colorType}`);
        }

        return { width, height, bitDepth, colorType };
    }

    /**
     * Extracts and inflates IDAT chunks containing compressed pixel data
     * @returns {Promise<Buffer>} Decompressed raw pixel data
     * @private
     */
    async _extractAndInflateIDAT() {
        let buffer = Buffer.alloc(0); // Current chunk buffer
        let expect = null; // Expected chunk info
        let sigSkipped = false; // PNG signature skip flag
        const parts = []; // Collected decompressed data parts

        // Transform stream to extract IDAT chunks
        const extractor = new Transform({
            transform(chunk, _, cb) {
                // Merge with existing buffer
                buffer = Buffer.concat([buffer, chunk]);

                // Skip PNG signature (8 bytes) once
                if (!sigSkipped && buffer.length >= 8) {
                    buffer = buffer.slice(8);
                    sigSkipped = true;
                }

                let offset = 0;

                while (true) {
                    if (!expect) {
                        // Read chunk header (length + type)
                        if (buffer.length < offset + 8) break;
                        const length = buffer.readUInt32BE(offset);
                        const type = buffer.toString('ascii', offset + 4, offset + 8);
                        expect = { length, type };
                        offset += 8;
                    }

                    const { length, type } = expect;
                    if (buffer.length < offset + length + 4) break; // +4 for CRC

                    // Extract chunk data
                    const data = buffer.slice(offset, offset + length);
                    
                    // Only process IDAT chunks (image data)
                    if (type === 'IDAT') this.push(data);
                    
                    // Move to next chunk
                    offset += length + 4; // Skip data + CRC
                    expect = null;
                }
                
                buffer = buffer.slice(offset);
                cb();
            }
        });

        // Inflate compressed data
        const inflator = new Inflate();
        
        // Collect inflated data
        const collector = new Writable({
            write(chunk, __, cb) {
                parts.push(chunk);
                cb();
            }
        });

        // Process PNG file through pipeline
        await pipeline(
            createReadStream(this.filePath),
            extractor,
            inflator,
            collector
        );

        return Buffer.concat(parts);
    }

    /**
     * Removes PNG filters from raw pixel data
     * @param {Buffer} raw - Raw filtered pixel data
     * @param {number} width - Image width in pixels
     * @param {number} height - Image height in pixels
     * @param {number} bpp - Bytes per pixel
     * @returns {Buffer} Unfiltered pixel data
     * @private
     */
    _reverseFilter(raw, width, height, bpp) {
        const stride = width * bpp + 1; // Row stride (pixels + filter byte)
        const out = Buffer.allocUnsafe(width * height * bpp);

        for (let y = 0; y < height; y++) {
            const rowStart = y * stride;
            const filter = raw[rowStart]; // Filter type for this row
            const row = raw.subarray(rowStart + 1, rowStart + stride);
            const prevLine = y > 0 ? out.subarray((y - 1) * width * bpp, y * width * bpp) : null;

            for (let i = 0; i < row.length; i++) {
                const idx = y * width * bpp + i;
                const x = row[i]; // Current filtered byte
                const a = i >= bpp ? out[idx - bpp] : 0; // Left pixel
                const b = prevLine ? prevLine[i] : 0; // Above pixel
                const c = prevLine && i >= bpp ? prevLine[i - bpp] : 0; // Above-left pixel
                let recon;

                // Apply reverse filter based on type
                switch (filter) {
                    case 0: recon = x; break; // None filter
                    case 1: recon = (x + a) & 0xFF; break; // Sub filter
                    case 2: recon = (x + b) & 0xFF; break; // Up filter
                    case 3: recon = (x + Math.floor((a + b) / 2)) & 0xFF; break; // Average filter
                    case 4:
                        // Paeth filter
                        const p = a + b - c;
                        const pa = Math.abs(p - a);
                        const pb = Math.abs(p - b);
                        const pc = Math.abs(p - c);
                        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                        recon = (x + pr) & 0xFF;
                        break;

                    default:
                        throw new Error(`Unsupported filter type: ${filter}`);
                }

                out[idx] = recon;
            }
        }

        return out;
    }
}
