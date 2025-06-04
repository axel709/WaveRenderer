/**
 * Manager module for reading and processing PNG pixel data.
 * @module managers/PNGManager
 */

import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';
import { PNG_SIGNATURE, SUPPORTED_COLOR_TYPES, BIT_DEPTH } from '../constants.js';

const inflateAsync = promisify(zlib.inflate);

/**
 * The PNGManager class handles reading and processing of PNG pixel data.
 */
export class PNGManager {
    /**
     * Initializes the PNGManager with the input file path.
     * @param {string} inputPath - The file path to the input PNG.
     * @constructor
     */
    constructor(inputPath) {
        /** @type {string} Path to the input PNG file */
        this.inputPath = inputPath;
    }

    /**
     * Reads pixel data from a PNG file and returns an array of pixel objects with brightness.
     * Supports only RGB (color type 2) and RGBA (color type 6) with bit depth 8.
     * @returns {Promise<{x: number, y: number, brightness: number}[]>} Array of pixel objects.
     * @throws {Error} If the PNG is invalid or unsupported.
     */
    async readPixels() {
        try {
            /** @type {Buffer} Raw PNG file data */
            const buffer = await fs.readFile(this.inputPath);

            // Check the PNG signature
            const signature = buffer.subarray(0, 8);
            console.log(`File: ${this.inputPath}, Signature: ${signature.toString('hex')}`);

            if (!signature.equals(PNG_SIGNATURE)) {
                throw new Error('Invalid PNG file signature');
            }

            // Read IHDR chunk
            const ihdrStart = 8;
            const chunkType = buffer.subarray(ihdrStart + 4, ihdrStart + 8).toString();

            if (chunkType !== 'IHDR') {
                throw new Error('IHDR chunk not found');
            }

            /** @type {number} Image width in pixels */
            const width = buffer.readUInt32BE(ihdrStart + 8);

            /** @type {number} Image height in pixels */
            const height = buffer.readUInt32BE(ihdrStart + 12);

            /** @type {number} Bit depth of the PNG */
            const bitDepth = buffer.readUInt8(ihdrStart + 16);

            /** @type {number} Color type of the PNG */
            const colorType = buffer.readUInt8(ihdrStart + 17);

            if (bitDepth !== BIT_DEPTH) {
                throw new Error(`Only bit depth ${BIT_DEPTH} is supported`);
            }

            if (!SUPPORTED_COLOR_TYPES.includes(colorType)) {
                throw new Error('Only RGB and RGBA color types are supported');
            }

            // Search IDAT chunk(s)
            let offset = ihdrStart + 25; // Skip IHDR + CRC

            /** @type {Buffer} Concatenated IDAT data */
            let idatData = Buffer.alloc(0);

            while (offset < buffer.length) {
                const length = buffer.readUInt32BE(offset);
                const type = buffer.subarray(offset + 4, offset + 8).toString();

                if (type === 'IDAT') {
                    const data = buffer.subarray(offset + 8, offset + 8 + length);
                    idatData = Buffer.concat([idatData, data]);

                } else if (type === 'IEND') {
                    break;
                }

                offset += length + 12;
            }

            // Decompress IDAT
            /** @type {Buffer} Decompressed pixel data */
            const decompressed = await inflateAsync(idatData);

            // Debug: check size of decompressed data
            const expectedBytes = height * (width * (colorType === 2 ? 3 : 4) + 1);
            console.log(`File: ${this.inputPath}, Decompressed IDAT size: ${decompressed.length}, Expected: ${expectedBytes}`);

            if (decompressed.length < expectedBytes) {
                throw new Error('Decompressed IDAT data too small');
            }

            // Process pixel data
            /** @type {{x: number, y: number, brightness: number}[]} Array of pixel objects */
            const pixels = [];
            let pixelIndex = 0;
            const bytesPerPixel = colorType === 2 ? 3 : 4;

            for (let y = 0; y < height; y++) {
                pixelIndex++; // Skip filterbyte

                for (let x = 0; x < width; x++) {
                    const r = decompressed[pixelIndex++];
                    const g = decompressed[pixelIndex++];
                    const b = decompressed[pixelIndex++];
                    const a = colorType === 6 ? decompressed[pixelIndex++] : 255;

                    // Calculate brightness (weighted average)
                    const brightness = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    pixels.push({ x, y, brightness });
                }
            }

            return pixels;

        } catch (err) {
            throw new Error(`Failed to read PNG: ${err.message}`);
        }
    }
}
