import fs from 'fs/promises';
import { promisify } from 'util';
import { crc32 } from 'zlib';
import zlib from 'zlib';
import { SAMPLE_RATE, PIXEL_DURATION, PNG_SIGNATURE, MARKER_FREQ_SCALE, PIXEL_FREQ_SCALE } from '../constants.js';

const deflateAsync = promisify(zlib.deflate);

export class PNGFromWAVManager {
    constructor(inputWavPath, outputPngPath) {
        this.inputWavPath = inputWavPath;
        this.outputPngPath = outputPngPath;
    }

    async convert() {
        try {
            const { width, height, pixels } = await this.analyzeWAV();
            console.log(`Writing PNG with dimensions ${width}x${height}, ${pixels.length} pixels`);

            await this.writePNG(width, height, pixels);
            console.log(`PNG generated at ${this.outputPngPath}`);
        } catch (err) {
            throw new Error(`Failed to convert WAV to PNG: ${err.message}`);
        }
    }

    async analyzeWAV() {
        console.log(`Reading WAV file: ${this.inputWavPath}`);
        const buffer = await fs.readFile(this.inputWavPath);

        if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
            throw new Error('Invalid WAV file signature');
        }

        const sampleRate = buffer.readUInt32LE(24);
        if (sampleRate !== SAMPLE_RATE) {
            throw new Error(`Unsupported sample rate: ${sampleRate}, expected ${SAMPLE_RATE}`);
        }

        let offset = 12;
        while (offset < buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);
            if (chunkId === 'data') {
                break;
            }

            offset += 8 + chunkSize;
        }

        if (offset >= buffer.length) {
            throw new Error('No data chunk found');
        }

        const dataStart = offset + 8;
        const dataSize = buffer.readUInt32LE(offset + 4);
        const samples = buffer.subarray(dataStart, dataStart + dataSize);
        const samplesPerSecond = SAMPLE_RATE;
        const samplesPerPixel = Math.round(SAMPLE_RATE * PIXEL_DURATION);
        const marker1Samples = samples.subarray(0, samplesPerSecond * 2);
        const widthAnalysis = this.analyzeSegment(marker1Samples, SAMPLE_RATE, 'Width Marker', 10000);
        const width = Math.round(widthAnalysis.frequency / MARKER_FREQ_SCALE);

        const marker2Samples = samples.subarray(samplesPerSecond * 2, samplesPerSecond * 4);
        const heightAnalysis = this.analyzeSegment(marker2Samples, SAMPLE_RATE, 'Height Marker', 10000);
        const height = Math.round(heightAnalysis.frequency / MARKER_FREQ_SCALE);
        console.log(`Extracting pixel brightness values for ${width}x${height} image`);

        const pixels = [];
        for (let i = samplesPerSecond * 4; i < samples.length; i += samplesPerPixel * 2) {
            const segmentSamples = samples.subarray(i, Math.min(i + samplesPerPixel * 2, samples.length));
            const index = (i - samplesPerSecond * 4) / (samplesPerPixel * 2);
            const x = index % width;
            const y = Math.floor(index / width);
            const analysis = this.analyzeSegment(segmentSamples, SAMPLE_RATE, `Pixel (${x}, ${y})`, 255 * PIXEL_FREQ_SCALE);
            const frequency = analysis.frequency;
            const brightness = Math.max(0, Math.min(255, Math.round(frequency / PIXEL_FREQ_SCALE)));
            pixels.push({ x, y, brightness });
        }

        console.log(`Extracted ${pixels.length} pixels`);
        return { width, height, pixels };
    }

    analyzeSegment(samples, sampleRate, segmentName = 'Segment', maxFreq = 255) {
        const result = {
            frequency: 0,
            maxAmplitude: 0,
            zeroCrossings: 0,
            warnings: [],
        };

        if (samples.length < 4) {
            result.warnings.push(`${segmentName}: Segment too short (${samples.length / 2} samples) for frequency analysis`);
            console.log(`${segmentName}: ${result.warnings[0]}`);
            return result;
        }

        const sampleCount = samples.length / 2;
        const duration = sampleCount / sampleRate;
        const amplitudeThreshold = 50;
        let previousSample = 0;
        let firstZeroCrossingTime = -1;
        let lastZeroCrossingTime = -1;

        const signal = new Array(sampleCount);
        for (let i = 0; i < samples.length; i += 2) {
            signal[i / 2] = samples.readInt16LE(i) / 32768;
        }

        for (let i = 0; i < samples.length; i += 2) {
            const sample = Math.abs(samples.readInt16LE(i));
            if (sample > result.maxAmplitude) {
                result.maxAmplitude = sample;
            }
        }

        if (result.maxAmplitude < amplitudeThreshold) {
            return result;
        }

        for (let i = 0; i < samples.length; i += 2) {
            const sample = samples.readInt16LE(i);

            if (Math.abs(sample) < amplitudeThreshold) continue;
            if ((previousSample <= 0 && sample > 0) || (previousSample > 0 && sample <= 0)) {
                result.zeroCrossings++;
                const time = (i / 2) / sampleRate;

                if (firstZeroCrossingTime === -1) {
                    firstZeroCrossingTime = time;
                }

                lastZeroCrossingTime = time;
            }

            previousSample = sample;
        }

        if (result.zeroCrossings >= 4) {
            const period = (lastZeroCrossingTime - firstZeroCrossingTime) / ((result.zeroCrossings / 2) - 1);
            result.frequency = period > 0 ? 1 / period : 0;
        } else {
            result.warnings.push(`${segmentName}: Insufficient zero crossings (${result.zeroCrossings}) for frequency calculation`);
            result.frequency = PNGFromWAVManager.simpleFFT(signal, sampleRate, maxFreq);
            result.warnings.push(`${segmentName}: Used FFT fallback, frequency = ${result.frequency.toFixed(2)} Hz`);
        }

        return result;
    }

    async writePNG(width, height, pixels) {
        const bytesPerPixel = 1;
        const scanlineWidth = width * bytesPerPixel + 1;
        const dataLength = height * scanlineWidth;
        const pixelData = Buffer.alloc(dataLength);
        let offset = 0;

        let previousScanline = null;
        for (let y = 0; y < height; y++) {
            const filterType = 4;
            pixelData.writeUInt8(filterType, offset);
            offset++;

            const currentScanline = Buffer.alloc(width * bytesPerPixel);
            for (let x = 0; x < width; x++) {
                const pixel = pixels.find(p => p.x === x && p.y === y) || { brightness: 0 };
                currentScanline.writeUInt8(pixel.brightness, x * bytesPerPixel);
            }

            PNGFromWAVManager.applyFilter(filterType, currentScanline, previousScanline, bytesPerPixel, pixelData, offset);
            previousScanline = currentScanline;
            offset += width * bytesPerPixel;
        }

        const compressedData = await deflateAsync(pixelData);
        const ihdrData = Buffer.alloc(13);

        ihdrData.writeUInt32BE(width, 0);
        ihdrData.writeUInt32BE(height, 4);
        ihdrData.writeUInt8(8, 8);
        ihdrData.writeUInt8(0, 9);
        ihdrData.writeUInt8(0, 10);
        ihdrData.writeUInt8(0, 11);
        ihdrData.writeUInt8(0, 12);

        const ihdrChunk = this.createChunk('IHDR', ihdrData);
        const idatChunk = this.createChunk('IDAT', compressedData);
        const iendChunk = this.createChunk('IEND', Buffer.alloc(0));
        const fileData = Buffer.concat([PNG_SIGNATURE, ihdrChunk, idatChunk, iendChunk]);
        await fs.writeFile(this.outputPngPath, fileData);
    }

    createChunk(type, data) {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length, 0);
        const typeBuffer = Buffer.from(type);
        const crcData = Buffer.concat([typeBuffer, data]);
        const crc = this.calculateCRC(crcData);
        const crcBuffer = Buffer.alloc(4);
        crcBuffer.writeUInt32BE(crc, 0);
        return Buffer.concat([length, typeBuffer, data, crcBuffer]);
    }

    static paethPredictor(a, b, c) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        if (pa <= pb && pa <= pc) return a;
        if (pb <= pc) return b;
        return c;
    }

    static simpleFFT(signal, sampleRate, maxFreq) {
        const N = signal.length;
        let maxAmplitude = 0;
        let dominantFreq = 0;

        for (let k = 0; k < N / 2; k++) {
            let real = 0;
            let imag = 0;
            const freq = (k * sampleRate) / N;

            if (freq > maxFreq) break;
            for (let n = 0; n < N; n++) {
                const angle = (2 * Math.PI * k * n) / N;
                real += signal[n] * Math.cos(angle);
                imag -= signal[n] * Math.sin(angle);
            }

            const amplitude = Math.sqrt(real * real + imag * imag) / N;
            if (amplitude > maxAmplitude) {
                maxAmplitude = amplitude;
                dominantFreq = freq;
            }
        }

        return dominantFreq;
    }

    static applyFilter(filterType, current, previous, bpp, result, index) {
        for (let i = 0; i < current.length; i++) {
            const x = current[i];
            let a = i >= bpp ? current[i - bpp] : 0;
            let b = previous ? previous[i] : 0;
            let c = previous && i >= bpp ? previous[i - bpp] : 0;

            switch (filterType) {
                case 0:
                    result[index + i] = x;
                    break;
                case 1:
                    result[index + i] = (x - a) & 0xff;
                    break;
                case 2:
                    result[index + i] = (x - b) & 0xff;
                    break;
                case 3:
                    result[index + i] = (x - Math.floor((a + b) / 2)) & 0xff;
                    break;
                case 4:
                    result[index + i] = (x - PNGFromWAVManager.paethPredictor(a, b, c)) & 0xff;
                    break;
                default:
                    throw new Error(`Invalid filter type: ${filterType}`);
            }
        }
    }

    calculateCRC(data) {
        return crc32(data);
    }
}
