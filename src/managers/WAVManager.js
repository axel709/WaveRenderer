import { CONSTANTS } from '../constants.js';
import { writeFile } from 'fs/promises';

export class WAVManager {
    constructor(outputPath) {
        this.outputPath = outputPath;
    }

    async generateWAV(width, height, pixels, colorType) {
        const sampleRate = CONSTANTS.WAV.SAMPLE_RATE;
        const markerSampleCount = sampleRate;
        const pixelSampleComponentCount = CONSTANTS.WAV.PIXEL.SAMPLES_PER_COMPONENT;
        const totalComponents = pixels.length;
        
        const totalSamples = markerSampleCount * 2 + totalComponents * pixelSampleComponentCount;
        const bytesPerSample = 2;
        const dataSize = totalSamples * bytesPerSample;
        const totalSize = 44 + dataSize;

        const buffer = Buffer.allocUnsafe(totalSize);
        let offset = 0;

        buffer.write('RIFF', offset); offset += 4;
        buffer.writeUInt32LE(36 + dataSize, offset); offset += 4;
        buffer.write('WAVE', offset); offset += 4;
        buffer.write('fmt ', offset); offset += 4;
        buffer.writeUInt32LE(16, offset); offset += 4;
        buffer.writeUInt16LE(1, offset); offset += 2;
        buffer.writeUInt16LE(1, offset); offset += 2;
        buffer.writeUInt32LE(sampleRate, offset); offset += 4;
        buffer.writeUInt32LE(sampleRate * bytesPerSample, offset); offset += 4;
        buffer.writeUInt16LE(bytesPerSample, offset); offset += 2;
        buffer.writeUInt16LE(bytesPerSample * 8, offset); offset += 2;
        buffer.write('data', offset); offset += 4;
        buffer.writeUInt32LE(dataSize, offset); offset += 4;

        let phase = 0;
        const amplitudeFactor = 0.5 * 32767;

        const generateTone = (frequency, count) => {
            if (frequency === 0) {
                buffer.fill(0, offset, offset + count * 2);
                offset += count * 2;
                return;
            }

            const phaseDelta = 2 * Math.PI * frequency / sampleRate;
            const cosDelta = Math.cos(phaseDelta);
            let previousSample = Math.sin(phase - phaseDelta);
            let currentSample = Math.sin(phase);

            for (let i = 0; i < count; i++) {
                const nextSample = 2 * cosDelta * currentSample - previousSample;
                buffer.writeInt16LE((currentSample * amplitudeFactor) | 0, offset);
                offset += 2;
                previousSample = currentSample;
                currentSample = nextSample;
            }

            phase = (phase + phaseDelta * count) % (2 * Math.PI);
        };

        const widthFrequency = width * CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
        const heightFrequency = height * CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
        generateTone(widthFrequency, markerSampleCount);
        generateTone(heightFrequency, markerSampleCount);

        const pixelScale = CONSTANTS.WAV.PIXEL.SCALE;
        const bytesPerPixel = { 6: 4, 2: 3, 0: 1 }[colorType];

        for (let i = 0; i < pixels.length; i += bytesPerPixel) {
            if (colorType === 6) {
                generateTone(pixels[i] * pixelScale, pixelSampleComponentCount);
                generateTone(pixels[i + 1] * pixelScale, pixelSampleComponentCount);
                generateTone(pixels[i + 2] * pixelScale, pixelSampleComponentCount);
                generateTone(pixels[i + 3] * pixelScale, pixelSampleComponentCount);
            } else if (colorType === 2) {
                generateTone(pixels[i] * pixelScale, pixelSampleComponentCount);
                generateTone(pixels[i + 1] * pixelScale, pixelSampleComponentCount);
                generateTone(pixels[i + 2] * pixelScale, pixelSampleComponentCount);
            } else {
                generateTone(pixels[i] * pixelScale, pixelSampleComponentCount);
            }
        }

        await writeFile(this.outputPath, buffer);
    }
}
