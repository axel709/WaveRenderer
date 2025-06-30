import { CONSTANTS } from '../constants.js';
import { writeFileSync } from 'fs';
import fs from 'fs/promises';
import zlib from 'zlib';

export class PNGFromWAVManager {
    constructor(inputWavPath, outputPngPath) {
        this.inputWavPath = inputWavPath;
        this.outputPngPath = outputPngPath;
    }

    static _crcTable = (() => {
        const table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    })();

    static crc32(buf) {
        let c = 0xFFFFFFFF;
        for (let i = 0; i < buf.length; i++) {
            c = (c >>> 8) ^ PNGFromWAVManager._crcTable[(c ^ buf[i]) & 0xFF];
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }


    async convert() {
        const { width, height, pixelData, colorType } = await this.analyzeWAV();
        this.writePNG(width, height, pixelData, colorType);
    }

    async analyzeWAV() {
        const buf = await fs.readFile(this.inputWavPath);

        if (
            buf.toString('ascii', 0, 4) !== 'RIFF' ||
            buf.toString('ascii', 8, 12) !== 'WAVE'
        ) {
            throw new Error('Invalid WAV file');
        }

        const sr = buf.readUInt32LE(24);

        if (sr !== CONSTANTS.WAV.SAMPLE_RATE) {
            throw new Error(`Unsupported sample rate ${sr}`);
        }

        let offset = 12;

        while (offset < buf.length) {
            const id = buf.toString('ascii', offset, offset + 4);
            const size = buf.readUInt32LE(offset + 4);
            if (id === 'data') break;
            offset += 8 + size;
        }

        if (offset >= buf.length) throw new Error('No data chunk');

        const dataStart = offset + 8;
        const dataSize = buf.readUInt32LE(offset + 4);
        const samples = buf.subarray(dataStart, dataStart + dataSize);

        const sps = CONSTANTS.WAV.SAMPLE_RATE;
        const spp = CONSTANTS.WAV.PIXEL.SAMPLES_PER_COMPONENT;
        const bytesPerPixelComponent = spp * 2;

        const markerBytes = sps * 2; 
        
        const mk1 = samples.subarray(0, markerBytes); 
        const mk2 = samples.subarray(markerBytes, markerBytes * 2); 

        const wHz = this._freqFromSegment(mk1, sps) / CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
        const hHz = this._freqFromSegment(mk2, sps) / CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
        const width = Math.round(wHz);
        const height = Math.round(hHz);

        const encodedDataBytes = dataSize - (markerBytes * 2);
        const encodedComponents = encodedDataBytes / bytesPerPixelComponent;

        let colorType;
        let bytesPerPixel;
        const epsilon = 0.5;

        if (Math.abs(encodedComponents - (width * height * 4)) < epsilon) {
            colorType = 6;
            bytesPerPixel = 4;
        } else if (Math.abs(encodedComponents - (width * height * 3)) < epsilon) {
            colorType = 2;
            bytesPerPixel = 3;
        } else if (Math.abs(encodedComponents - (width * height)) < epsilon) {
            colorType = 0;
            bytesPerPixel = 1;
        } else {
            console.warn(`Onverwacht aantal gecodeerde componenten. Verwacht ${width * height} (Grijswaarden), ${width * height * 3} (RGB) of ${width * height * 4} (RGBA), maar kreeg ${encodedComponents}. Terugval op grijswaarden.`);
            colorType = 0;
            bytesPerPixel = 1;
        }

        const pixelData = new Uint8Array(width * height * bytesPerPixel);
        let dataPtr = 0;
        let currentByteOffset = markerBytes * 2;

        if (colorType === 6) {
            for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex++) {
                for (let channel = 0; channel < 4; channel++) {
                    const seg = samples.subarray(currentByteOffset, currentByteOffset + bytesPerPixelComponent); 
                    const hz = this._freqFromSegment(seg, sps);
                    pixelData[dataPtr++] = Math.min(255, Math.max(0, Math.round(hz / CONSTANTS.WAV.PIXEL.SCALE)));
                    currentByteOffset += bytesPerPixelComponent;
                }
            }
        } else if (colorType === 2) {
            for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex++) {
                for (let channel = 0; channel < 3; channel++) {
                    const seg = samples.subarray(currentByteOffset, currentByteOffset + bytesPerPixelComponent);
                    const hz = this._freqFromSegment(seg, sps);
                    pixelData[dataPtr++] = Math.min(255, Math.max(0, Math.round(hz / CONSTANTS.WAV.PIXEL.SCALE)));
                    currentByteOffset += bytesPerPixelComponent;
                }
            }
        } else if (colorType === 0) {
            for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex++) {
                const seg = samples.subarray(currentByteOffset, currentByteOffset + bytesPerPixelComponent);
                const hz = this._freqFromSegment(seg, sps);
                pixelData[dataPtr++] = Math.min(255, Math.max(0, Math.round(hz / CONSTANTS.WAV.PIXEL.SCALE)));
                currentByteOffset += bytesPerPixelComponent;
            }
        } else {
            throw new Error(`Niet-ondersteund colorType voor reconstructie tijdens WAV-analyse: ${colorType}`);
        }

        return { width, height, pixelData, colorType };
    }

    _freqFromSegment(seg, sampleRate) {
        const N = seg.length >> 1;
        let maxAmp = 0, prev = 0, zc = 0, t0 = -1, t1 = -1;

        for (let i = 0; i < seg.length; i += 2) {
            const v = seg.readInt16LE(i);
            const av = Math.abs(v);
            if (av > maxAmp) maxAmp = av;
        }

        if (maxAmp < 50) return 0;

        for (let i = 0, j = 0; i < seg.length; i += 2, j++) {
            const v = seg.readInt16LE(i);

            if ((prev <= 0 && v > 0) || (prev > 0 && v <= 0)) {
                if (t0 < 0) t0 = j;
                t1 = j;
                zc++;
            }

            prev = v;
        }

        if (zc >= 4) {
            const calculatedFrequency = ((zc / 2) * sampleRate) / (t1 - t0);
            return calculatedFrequency > 0 ? calculatedFrequency : 0;
        }

        const signal = new Float32Array(N);

        for (let i = 0, j = 0; i < seg.length; i += 2, j++) {
            signal[j] = seg.readInt16LE(i) / 32768;
        }

        return PNGFromWAVManager.simpleFFT(signal, sampleRate, 255 * CONSTANTS.WAV.PIXEL.SCALE);
    }

    static simpleFFT(signal, sr, maxF) {
        const N = signal.length;
        let bestAmp = 0, bestF = 0;

        for (let k = 0; k < N / 2; k++) {
            const f = k * sr / N;
            if (f > maxF) break;
            let re = 0, im = 0;

            for (let n = 0; n < N; n++) {
                const a = (2 * Math.PI * k * n) / N;
                re += signal[n] * Math.cos(a);
                im -= signal[n] * Math.sin(a);
            }

            const amp = Math.hypot(re, im);
            if (amp > bestAmp) bestAmp = amp, bestF = f;
        }

        return bestF;
    }

    writePNG(width, height, pixelData, colorType) {
        let bytesPerPixel;
        
        if (colorType === 0) {
            bytesPerPixel = 1;
        } else if (colorType === 2) {
            bytesPerPixel = 3;
        } else if (colorType === 4) {
            bytesPerPixel = 2;
        } else if (colorType === 6) {
            bytesPerPixel = 4;
        } else {
            throw new Error(`Unsupported colorType for PNG writing: ${colorType}`);
        }

        const scanlineLength = width * bytesPerPixel;
        const dataSize = (scanlineLength + 1) * height;
        const raw = Buffer.allocUnsafe(dataSize);
        let p = 0;

        for (let y = 0; y < height; y++) {
            raw[p++] = 0;
            const base = y * scanlineLength;
            for (let x = 0; x < scanlineLength; x++, p++) {
                raw[p] = pixelData[base + x];
            }
        }

        const comp = zlib.deflateSync(raw, { level: zlib.constants.Z_BEST_SPEED });

        const ihdrLen = 13;
        const idatLen = comp.length;
        const total = 8 + (4 + 4 + ihdrLen + 4) + (4 + 4 + idatLen + 4) + (4 + 4 + 0 + 4);
        const out = Buffer.allocUnsafe(total);
        let off = 0;

        CONSTANTS.PNG.SIGNATURE.copy(out, off); off += 8;

        out.writeUInt32BE(ihdrLen, off); off += 4;
        out.write('IHDR', off); off += 4;
        out.writeUInt32BE(width, off); off += 4;
        out.writeUInt32BE(height, off); off += 4;
        out[off++] = 8;
        out[off++] = colorType;
        out[off++] = 0;
        out[off++] = 0;
        out[off++] = 0;

        const ihdrCrc = PNGFromWAVManager.crc32(out.subarray(off - (4 + ihdrLen), off));
        out.writeUInt32BE(ihdrCrc, off); off += 4;

        out.writeUInt32BE(idatLen, off); off += 4;
        out.write('IDAT', off); off += 4;
        comp.copy(out, off); off += comp.length;
        const idatCrc = PNGFromWAVManager.crc32(out.subarray(off - (4 + idatLen), off));
        out.writeUInt32BE(idatCrc, off); off += 4;

        out.writeUInt32BE(0, off); off += 4;
        out.write('IEND', off); off += 4;
        const iendCrc = PNGFromWAVManager.crc32(Buffer.from('IEND'));
        out.writeUInt32BE(iendCrc, off); off += 4;

        writeFileSync(this.outputPngPath, out);
    }
}
