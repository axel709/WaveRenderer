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
        const { width, height, brightnessArr } = await this.analyzeWAV();
        this.writePNG(width, height, brightnessArr);
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
        const spp = Math.round(sps * CONSTANTS.WAV.PIXEL.DURATION);

        const mk1 = samples.subarray(0, sps * 2);
        const mk2 = samples.subarray(sps * 2, sps * 4);
        const wHz = this._freqFromSegment(mk1, sps) / CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
        const hHz = this._freqFromSegment(mk2, sps) / CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
        const width = Math.round(wHz);
        const height = Math.round(hHz);

        const brightnessArr = new Uint8Array(width * height);
        let ptr = 0;

        for (let i = sps * 4; ptr < brightnessArr.length; i += spp * 2, ptr++) {
            const seg = samples.subarray(i, i + spp * 2);
            const hz = this._freqFromSegment(seg, sps);
            const b = Math.min(255, Math.max(0, Math.round(hz / CONSTANTS.WAV.PIXEL.SCALE)));
            brightnessArr[ptr] = b;
        }

        return { width, height, brightnessArr };
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
            const period = (t1 - t0) / (sampleRate * ((zc >> 1) - 1));
            return period > 0 ? 1 / period : 0;
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

    writePNG(width, height, brightnessArr) {
        const scanW = width + 1;
        const dataSize = scanW * height;
        const raw = Buffer.allocUnsafe(dataSize);
        let p = 0;

        for (let y = 0; y < height; y++) {
            raw[p++] = 0;
            const base = y * width;
            
            for (let x = 0; x < width; x++, p++) {
                raw[p] = brightnessArr[base + x];
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
        out[off++] = 0;
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
