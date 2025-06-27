import { writeFileSync } from 'fs';
import { CONSTANTS } from '../constants.js';

export class WAVManager {
    constructor(outputPath) {
        this.outputPath = outputPath;
    }

    async generateWAV(width, height, pixels) {
        const sampleRate = CONSTANTS.WAV.SAMPLE_RATE;
        const markerSampleCount = sampleRate;
        const pixelSampleCount = Math.round(sampleRate * CONSTANTS.WAV.PIXEL.DURATION);
        const totalSamples = markerSampleCount * 2 + pixels.length * pixelSampleCount;
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
        buffer.writeUInt16LE(16, offset); offset += 2;
        buffer.write('data', offset); offset += 4;
        buffer.writeUInt32LE(dataSize, offset); offset += 4;

        const amplitudeFactor = Math.floor(0.8 * 32767);
        let phase = 0;

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
        
        for (let i = 0; i < pixels.length; i++) {
            const frequency = pixels[i].brightness * pixelScale;
            generateTone(frequency, pixelSampleCount);
        }

        writeFileSync(this.outputPath, buffer);
    }
}
