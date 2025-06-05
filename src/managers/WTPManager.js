import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import { promisify } from 'util';
import { SAMPLE_RATE, PIXEL_DURATION, PNG_SIGNATURE, MARKER_FREQ_SCALE } from '../constants.js';

const deflateAsync = promisify(zlib.deflate);

function simpleFFT(signal, sampleRate, maxFreq) {
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

export class PNGFromWAVManager {
    constructor(inputWavPath, outputPngPath) {
        this.inputWavPath = inputWavPath;
        this.outputPngPath = outputPngPath;
    }

    async convert() {
        try {
            console.log(`Starting WAV to PNG conversion for ${this.inputWavPath}`);
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
        console.log(`Sample rate: ${sampleRate} Hz`);
        if (sampleRate !== SAMPLE_RATE) {
            throw new Error(`Unsupported sample rate: ${sampleRate}, expected ${SAMPLE_RATE}`);
        }

        let offset = 12;
        while (offset < buffer.length) {
            const chunkId = buffer.toString('ascii', offset, offset + 4);
            const chunkSize = buffer.readUInt32LE(offset + 4);

            console.log(`Found chunk: ${chunkId}, size: ${chunkSize}`);

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
        console.log(`Data chunk found at offset ${dataStart}, size: ${dataSize} bytes`);

        const samples = buffer.subarray(dataStart, dataStart + dataSize);
        const samplesPerSecond = SAMPLE_RATE;
        const samplesPerPixel = Math.round(SAMPLE_RATE * PIXEL_DURATION);
        console.log(`Samples per pixel: ${samplesPerPixel} (duration: ${PIXEL_DURATION}s)`);

        const marker1Samples = samples.subarray(0, samplesPerSecond * 2);
        const widthAnalysis = this.analyzeSegment(marker1Samples, SAMPLE_RATE, 'Width Marker', 10000);
        console.log(`Width Marker: Frequency = ${widthAnalysis.frequency.toFixed(2)} Hz, Zero Crossings = ${widthAnalysis.zeroCrossings}, Max Amplitude = ${widthAnalysis.maxAmplitude}, Warnings: ${widthAnalysis.warnings.join('; ')}`);
        
        const width = Math.round(widthAnalysis.frequency / MARKER_FREQ_SCALE);
        console.log(`Extracted width: ${width} pixels`);

        const marker2Samples = samples.subarray(samplesPerSecond * 2, 2 * samplesPerSecond * 2);
        const heightAnalysis = this.analyzeSegment(marker2Samples, SAMPLE_RATE, 'Height Marker', 10000);
        console.log(`Height Marker: Frequency = ${heightAnalysis.frequency.toFixed(2)} Hz, Zero Crossings = ${heightAnalysis.zeroCrossings}, Max Amplitude = ${heightAnalysis.maxAmplitude}, Warnings: ${heightAnalysis.warnings.join('; ')}`);
        
        const height = Math.round(heightAnalysis.frequency / MARKER_FREQ_SCALE);
        console.log(`Extracted height: ${height} pixels`);
        console.log(`Extracting pixel brightness values for ${width}x${height} image`);

        const pixels = [];
        for (let i = 2 * samplesPerSecond * 2; i < samples.length; i += samplesPerPixel * 2) {
            const segmentSamples = samples.subarray(i, Math.min(i + samplesPerPixel * 2, samples.length));
            const index = (i - 2 * samplesPerSecond * 2) / (samplesPerPixel * 2);
            const x = index % width;
            const y = Math.floor(index / width);
            const analysis = this.analyzeSegment(segmentSamples, SAMPLE_RATE, `Pixel (${x}, ${y})`, 255);
            const frequency = analysis.frequency;
            const brightness = Math.max(0, Math.min(255, Math.round(frequency)));
            console.log(`Pixel (${x}, ${y}): Frequency = ${frequency.toFixed(2)} Hz, Brightness = ${brightness}, Zero Crossings = ${analysis.zeroCrossings}, Max Amplitude = ${analysis.maxAmplitude}, Warnings: ${analysis.warnings.join('; ')}`);
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
            if (sample > result.maxAmplitude) result.maxAmplitude = sample;
        }

        console.log(`${segmentName}: Sample count = ${sampleCount}, Duration = ${duration.toFixed(4)}s, Max Amplitude = ${result.maxAmplitude}`);

        if (result.maxAmplitude < amplitudeThreshold) {
            result.warnings.push(`${segmentName}: Low amplitude (${result.maxAmplitude}) in segment, possible invalid signal`);
            console.log(`${segmentName}: ${result.warnings[0]}`);
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
            console.log(`${segmentName}: Zero-crossing frequency = ${result.frequency.toFixed(2)} Hz`);
        } else {
            result.warnings.push(`${segmentName}: Insufficient zero crossings (${result.zeroCrossings}) for frequency calculation`);
            console.log(`${segmentName}: ${result.warnings[0]}`);
            result.frequency = simpleFFT(signal, sampleRate, maxFreq);
            result.warnings.push(`${segmentName}: Used FFT fallback, frequency = ${result.frequency.toFixed(2)} Hz`);
            console.log(`${segmentName}: FFT frequency = ${result.frequency.toFixed(2)} Hz`);
        }

        return result;
    }

    async writePNG(width, height, pixels) {
        const bytesPerPixel = 1;
        const scanlineWidth = width * bytesPerPixel + 1;
        const dataLength = height * scanlineWidth;
        const pixelData = Buffer.alloc(dataLength);
        let offset = 0;

        for (let y = 0; y < height; y++) {
            pixelData.writeUInt8(0, offset);
            offset++;

            for (let x = 0; x < width; x++) {
                const pixel = pixels.find(p => p.x === x && p.y === y) || { brightness: 0 };
                pixelData.writeUInt8(pixel.brightness, offset);
                offset++;
            }
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

    calculateCRC(data) {
        let c = 0xffffffff;
        const crcTable = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            crcTable[n] = c;
        }
        for (let i = 0; i < data.length; i++) {
            c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
        }
        return (c ^ 0xffffffff) >>> 0;
    }
}
