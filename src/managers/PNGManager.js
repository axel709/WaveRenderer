import fs from 'fs/promises';
import zlib from 'zlib';
import { promisify } from 'util';
import { PNG_SIGNATURE, SUPPORTED_COLOR_TYPES, BIT_DEPTH } from '../constants.js';

const inflateAsync = promisify(zlib.inflate);

export class PNGManager {
    constructor(inputPath) {
        this.inputPath = inputPath;
    }

    async readPixels() {
        try {
            const buffer = await fs.readFile(this.inputPath);
            const signature = buffer.subarray(0, 8);
            console.log(`File: ${this.inputPath}, Signature: ${signature.toString('hex')}`);

            if (!signature.equals(PNG_SIGNATURE)) {
                throw new Error('Invalid PNG file signature');
            }

            const ihdrStart = 8;
            const chunkType = buffer.subarray(ihdrStart + 4, ihdrStart + 8).toString();

            if (chunkType !== 'IHDR') {
                throw new Error('IHDR chunk not found');
            }

            const width = buffer.readUInt32BE(ihdrStart + 8);
            const height = buffer.readUInt32BE(ihdrStart + 12);
            const bitDepth = buffer.readUInt8(ihdrStart + 16);
            const colorType = buffer.readUInt8(ihdrStart + 17);

            if (bitDepth !== BIT_DEPTH) {
                throw new Error(`Only bit depth ${BIT_DEPTH} is supported`);
            }

            if (!SUPPORTED_COLOR_TYPES.includes(colorType)) {
                throw new Error('Only RGB and RGBA color types are supported');
            }

            let offset = ihdrStart + 25;
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

            const decompressed = await inflateAsync(idatData);
            const bytesPerPixel = colorType === 2 ? 3 : 4;
            const expectedBytes = height * (width * bytesPerPixel + 1);
            console.log(`File: ${this.inputPath}, Decompressed IDAT size: ${decompressed.length}, Expected: ${expectedBytes}`);

            if (decompressed.length < expectedBytes) {
                throw new Error('Decompressed IDAT data too small');
            }

            const pixels = [];
            let pixelIndex = 0;

            for (let y = 0; y < height; y++) {
                pixelIndex++; // Skip filter byte

                for (let x = 0; x < width; x++) {
                    const r = decompressed[pixelIndex++];
                    const g = decompressed[pixelIndex++];
                    const b = decompressed[pixelIndex++];
                    const a = colorType === 6 ? decompressed[pixelIndex++] : 255;
                    pixels.push({ x, y, r, g, b, a });
                }
            }

            return { width, height, pixels };

        } catch (err) {
            throw new Error(`Failed to read PNG: ${err.message}`);
        }
    }
}
