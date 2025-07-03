import { Transform, Writable } from 'stream';
import { CONSTANTS } from '../constants.js';
import { pipeline } from 'stream/promises';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import { Inflate } from 'zlib';

export class PNGManager {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async readPixels() {
        const startTotal = process.hrtime.bigint();
        const startIHDR = process.hrtime.bigint();
        const { width, height, bitDepth, colorType } = await this._readIHDR();
        const durIHDR = Number(process.hrtime.bigint() - startIHDR) / 1e6;
        console.log(`_readIHDR took ${durIHDR.toFixed(3)} ms`);

        const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
        const bpp = bppMap[colorType];
        if (!bpp) throw new Error(`Unsupported colorType: ${colorType}`);

        const startIDAT = process.hrtime.bigint();
        const rawData = await this._extractAndInflateIDAT();
        const durIDAT = Number(process.hrtime.bigint() - startIDAT) / 1e6;
        console.log(`_extractAndInflateIDAT took ${durIDAT.toFixed(3)} ms`);

        const startFilter = process.hrtime.bigint();
        const pixelBuf = this._reverseFilter(rawData, width, height, bpp);
        const durFilter = Number(process.hrtime.bigint() - startFilter) / 1e6;
        console.log(`_reverseFilter took ${durFilter.toFixed(3)} ms`);

        const durTotal = Number(process.hrtime.bigint() - startTotal) / 1e6;
        console.log(`readPixels total took ${durTotal.toFixed(3)} ms`);

        return { width, height, pixels: pixelBuf, colorType };
    }

    async _readIHDR() {
        const { SIGNATURE, SUPPORTED } = CONSTANTS.PNG;
        const fh = await open(this.filePath, 'r');
        const buf = Buffer.alloc(8 + 4 + 4 + 13 + 4);
        await fh.read(buf, 0, buf.length, 0);
        await fh.close();

        if (!buf.slice(0, 8).equals(SIGNATURE)) {
            throw new Error('Invalid PNG signature');
        }

        const ihdr = buf.slice(16, 16 + 13);
        const width = ihdr.readUInt32BE(0);
        const height = ihdr.readUInt32BE(4);
        const bitDepth = ihdr.readUInt8(8);
        const colorType = ihdr.readUInt8(9);

        if (bitDepth !== SUPPORTED.BIT_DEPTH) {
            throw new Error(`Only bitDepth ${SUPPORTED.BIT_DEPTH} supported`);
        }

        if (!SUPPORTED.COLOR_TYPES.includes(colorType)) {
            throw new Error(`Unsupported colorType: ${colorType}`);
        }

        return { width, height, bitDepth, colorType };
    }

    async _extractAndInflateIDAT() {
        let buffer = Buffer.alloc(0);
        let expect = null;
        let sigSkipped = false;
        const parts = [];

        const extractor = new Transform({
            transform(chunk, _, cb) {
                buffer = Buffer.concat([buffer, chunk]);

                if (!sigSkipped && buffer.length >= 8) {
                    buffer = buffer.slice(8);
                    sigSkipped = true;
                }

                let offset = 0;

                while (true) {
                    if (!expect) {
                        if (buffer.length < offset + 8) break;
                        const length = buffer.readUInt32BE(offset);
                        const type = buffer.toString('ascii', offset + 4, offset + 8);
                        expect = { length, type };
                        offset += 8;
                    }

                    const { length, type } = expect;
                    if (buffer.length < offset + length + 4) break;

                    const data = buffer.slice(offset, offset + length);
                    if (type === 'IDAT') this.push(data);
                    offset += length + 4;
                    expect = null;
                }
                
                buffer = buffer.slice(offset);
                cb();
            }
        });

        const inflator = new Inflate();
        const collector = new Writable({
            write(chunk, __, cb) {
                parts.push(chunk);
                cb();
            }
        });

        await pipeline(
            createReadStream(this.filePath),
            extractor,
            inflator,
            collector
        );

        return Buffer.concat(parts);
    }

    _reverseFilter(raw, width, height, bpp) {
        const stride = width * bpp + 1;
        const out = Buffer.allocUnsafe(width * height * bpp);

        for (let y = 0; y < height; y++) {
            const rowStart = y * stride;
            const filter = raw[rowStart];
            const row = raw.subarray(rowStart + 1, rowStart + stride);
            const prevLine = y > 0 ? out.subarray((y - 1) * width * bpp, y * width * bpp) : null;

            for (let i = 0; i < row.length; i++) {
                const idx = y * width * bpp + i;
                const x = row[i];
                const a = i >= bpp ? out[idx - bpp] : 0;
                const b = prevLine ? prevLine[i] : 0;
                const c = prevLine && i >= bpp ? prevLine[i - bpp] : 0;
                let recon;

                switch (filter) {
                    case 0: recon = x; break;
                    case 1: recon = (x + a) & 0xFF; break;
                    case 2: recon = (x + b) & 0xFF; break;
                    case 3: recon = (x + Math.floor((a + b) / 2)) & 0xFF; break;
                    case 4:
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
