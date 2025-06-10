import fs from 'fs/promises';
import { SAMPLE_RATE, PIXEL_DURATION, MARKER_FREQ_SCALE, MIN_FREQUENCY, MAX_FREQUENCY } from '../constants.js';

export class WAVManager {
    constructor(outputPath) {
        this.outputPath = outputPath;
    }

    async generateWAV(width, height, pixels) {
        try {
            console.log(`Generating WAV: ${width}x${height}, ${pixels.length} pixels`);
            const samplesPerMarker = Math.round(SAMPLE_RATE * 1);
            const samplesPerPixel = Math.round(SAMPLE_RATE * PIXEL_DURATION);
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
            header.writeUInt32LE(SAMPLE_RATE, 24);
            header.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
            header.writeUInt16LE(bytesPerSample, 32);
            header.writeUInt16LE(16, 34);
            header.write('data', 36);
            header.writeUInt32LE(dataSize, 40);

            const audioData = Buffer.alloc(dataSize);
            let sampleIndex = 0;
            let phase = 0;

            const generateTone = (frequency, numSamples, amplitude = 0.8) => {
                // console.log(`Generating tone: Frequency = ${frequency.toFixed(2)} Hz, Samples = ${numSamples}, Amplitude = ${amplitude}`);

                for (let i = 0; i < numSamples; i++) {
                    const t = i / SAMPLE_RATE;
                    const sample = frequency === 0 ? 0 : Math.sin(phase + 2 * Math.PI * frequency * t) * amplitude;
                    audioData.writeInt16LE(Math.round(sample * 32767), sampleIndex);
                    sampleIndex += bytesPerSample;
                }

                if (frequency !== 0) {
                    phase += 2 * Math.PI * frequency * (numSamples / SAMPLE_RATE);
                    phase %= 2 * Math.PI;
                }
            };

            const widthFrequency = width * MARKER_FREQ_SCALE;
            console.log(`Encoding width: ${width} pixels -> ${widthFrequency} Hz`);
            generateTone(widthFrequency, samplesPerMarker);

            const heightFrequency = height * MARKER_FREQ_SCALE;
            console.log(`Encoding height: ${height} pixels -> ${heightFrequency} Hz`);
            generateTone(heightFrequency, samplesPerMarker);

            for (const pixel of pixels) {
                const frequency = Math.max(MIN_FREQUENCY, Math.min(MAX_FREQUENCY, pixel.brightness));
                // console.log(`Pixel (${pixel.x}, ${pixel.y}), Brightness: ${pixel.brightness}, Frequency: ${frequency.toFixed(2)} Hz`);
                generateTone(frequency, samplesPerPixel);
            }

            console.log(`Writing WAV file to ${this.outputPath}`);
            await fs.writeFile(this.outputPath, Buffer.concat([header, audioData]));
        } catch (err) {
            throw new Error(`Failed to generate WAV: ${err.message}`);
        }
    }
}
