import fs from 'fs/promises';
import { CONSTANTS } from '../constants.js';

export class WAVManager {
    constructor(outputPath) {
        this.outputPath = outputPath;
    }

    async generateWAV(width, height, pixels) {
        try {
            console.log(`Generating WAV: ${width}x${height}, ${pixels.length} pixels`);
            const samplesPerMarker = Math.round(CONSTANTS.WAV.SAMPLE_RATE * 1);
            const samplesPerPixel = Math.round(CONSTANTS.WAV.SAMPLE_RATE * CONSTANTS.WAV.PIXEL.DURATION);
            const numSamples = 2 * samplesPerMarker + pixels.length * samplesPerPixel;
            const bytesPerSample = 2;
            const dataSize = numSamples * bytesPerSample;
            const header = Buffer.alloc(44);

            header.write('RIFF', 0);
            header.writeUInt32LE(36 + dataSize, 4);
            header.write('WAVE', 8);
            header.write('fmt ', 12);
            header.writeUInt32LE(16, 16);
            header.writeUInt16LE(1, 20);
            header.writeUInt16LE(1, 22);
            header.writeUInt32LE(CONSTANTS.WAV.SAMPLE_RATE, 24);
            header.writeUInt32LE(CONSTANTS.WAV.SAMPLE_RATE * bytesPerSample, 28);
            header.writeUInt16LE(bytesPerSample, 32);
            header.writeUInt16LE(16, 34);
            header.write('data', 36);
            header.writeUInt32LE(dataSize, 40);

            const audioData = Buffer.alloc(dataSize);
            let sampleIndex = 0;
            let phase = 0;

            const generateTone = (frequency, numSamples, amplitude = 0.8) => {
                for (let i = 0; i < numSamples; i++) {
                    const t = i / CONSTANTS.WAV.SAMPLE_RATE;
                    const sample = frequency === 0 ? 0 : Math.sin(phase + 2 * Math.PI * frequency * t) * amplitude;
                    audioData.writeInt16LE(Math.round(sample * 32767), sampleIndex);
                    sampleIndex += bytesPerSample;
                }

                if (frequency !== 0) {
                    phase += 2 * Math.PI * frequency * (numSamples / CONSTANTS.WAV.SAMPLE_RATE);
                    phase %= 2 * Math.PI;
                }
            };

            const widthFrequency = width * CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
            generateTone(widthFrequency, samplesPerMarker);

            const heightFrequency = height * CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE;
            generateTone(heightFrequency, samplesPerMarker);

            for (const pixel of pixels) {
                const frequency = pixel.brightness * CONSTANTS.WAV.PIXEL.SCALE;
                generateTone(frequency, samplesPerPixel);
            }

            console.log(`Writing WAV file to ${this.outputPath}`);
            await fs.writeFile(this.outputPath, Buffer.concat([header, audioData]));
        } catch (err) {
            throw new Error(`Failed to generate WAV: ${err.message}`);
        }
    }
}
