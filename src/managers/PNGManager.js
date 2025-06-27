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
            const chunks = [];

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
                throw new Error('Unsupported color type');
            }

            let offset = ihdrStart + 25;
            let idatData = Buffer.alloc(0);

            while (offset < buffer.length) {
                const length = buffer.readUInt32BE(offset);
                const type = buffer.subarray(offset + 4, offset + 8).toString();

                if (type === 'IDAT') {
                    chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
                } else if (type === 'IEND') {
                    break;
                }

                offset += length + 12;
            }

            if (chunks.length === 0) {
                throw new Error('No IDAT chunks found');
            }

            idatData = Buffer.concat(chunks);
            const decompressed = await inflateAsync(idatData);
            const bytesPerPixel = colorType === 0 ? 1 : colorType === 2 ? 3 : 4;
            const scanlineWidth = width * bytesPerPixel + 1;
            const expectedBytes = height * scanlineWidth;

            if (decompressed.length < expectedBytes) {
                throw new Error('Decompressed IDAT data too small');
            }

            const pixelData = Buffer.alloc(height * width * bytesPerPixel);
            let srcIndex = 0;
            let destIndex = 0;
            let previousScanline = null;

            const paethPredictor = (a, b, c) => {
                const p = a + b - c;
                const pa = Math.abs(p - a);
                const pb = Math.abs(p - b);
                const pc = Math.abs(p - c);

                if (pa <= pb && pa <= pc) return a;
                if (pb <= pc) return b;

                return c;
            };

            const applyReverseFilter = (filterType, current, previous, bpp, result, index) => {
                for (let i = 0; i < current.length; i++) {
                    const x = current[i];
                    let a = i >= bpp ? result[index + i - bpp] : 0;
                    let b = previous ? previous[i] : 0;
                    let c = previous && i >= bpp ? previous[i - bpp] : 0;

                    switch (filterType) {
                        case 0:
                            result[index + i] = x;
                            break;
                        case 1:
                            result[index + i] = (x + a) & 0xff;
                            break;
                        case 2:
                            result[index + i] = (x + b) & 0xff;
                            break;
                        case 3:
                            result[index + i] = (x + Math.floor((a + b) / 2)) & 0xff;
                            break;
                        case 4:
                            result[index + i] = (x + paethPredictor(a, b, c)) & 0xff;
                            break;
                        default:
                            throw new Error(`Invalid filter type: ${filterType}`);
                    }
                }
            };

            for (let y = 0; y < height; y++) {
                const filterType = decompressed[srcIndex++];
                const currentScanline = decompressed.subarray(srcIndex, srcIndex + width * bytesPerPixel);
                applyReverseFilter(filterType, currentScanline, previousScanline, bytesPerPixel, pixelData, destIndex);
                
                previousScanline = pixelData.subarray(destIndex, destIndex + width * bytesPerPixel);
                srcIndex += width * bytesPerPixel;
                destIndex += width * bytesPerPixel;
            }

            const pixels = [];
            let pixelIndex = 0;

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    let brightness;
                    if (colorType === 0) {
                        brightness = pixelData[pixelIndex++];
                    } else {
                        const r = pixelData[pixelIndex++];
                        const g = pixelData[pixelIndex++];
                        const b = pixelData[pixelIndex++];
                        const a = colorType === 6 ? pixelData[pixelIndex++] : 255;
                        brightness = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
                    }
                    pixels.push({ x, y, brightness });
                }
            }

            return { width, height, pixels };

        } catch (err) {
            throw new Error(`Failed to read PNG: ${err.message}`);
        }
    }
}
