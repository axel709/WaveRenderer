/**
 * Manager module for generating WAV audio files from pixel data.
 * @module managers/WAVManager
 */

import fs from 'fs/promises';
import { SAMPLE_RATE, PIXEL_DURATION, MIN_FREQUENCY, MAX_FREQUENCY } from '../constants.js';

/**
 * The WAVManager class handles the generation and saving of WAV audio files.
 */
export class WAVManager {
    /**
     * Initializes the WAVManager with the output file path.
     * @param {string} outputPath - The file path for the output WAV file.
     * @constructor
     */
    constructor(outputPath) {
        /** @type {string} Path to the output WAV file */
        this.outputPath = outputPath;
    }

    /**
     * Generates a WAV file from an array of pixel objects, mapping brightness to frequency.
     * @param {{x: number, y: number, brightness: number}[]} pixels - Array of pixel objects.
     * @throws {Error} If audio generation or file writing fails.
     * @returns {Promise<void>}
     */
    async generateWAV(pixels) {
        try {
            /** @type {number} Number of samples per pixel */
            const samplesPerPixel = Math.round(SAMPLE_RATE * PIXEL_DURATION);

            /** @type {number} Total number of samples */
            const numSamples = pixels.length * samplesPerPixel;

            /** @type {number} Bytes per sample (16-bit = 2 bytes) */
            const bytesPerSample = 2;

            /** @type {number} Total data size in bytes */
            const dataSize = numSamples * bytesPerSample;

            // Maak WAV-header (44 bytes)
            const header = Buffer.alloc(44);

            header.write('RIFF', 0); // Chunk ID
            header.writeUInt32LE(36 + dataSize, 4); // Chunk Size (file size - 8)
            header.write('WAVE', 8); // Format
            header.write('fmt ', 12); // Subchunk1 ID

            header.writeUInt32LE(16, 16); // Subchunk1 Size (PCM = 16)
            header.writeUInt16LE(1, 20); // Audio Format (1 = PCM)
            header.writeUInt16LE(1, 22); // Num Channels (1 = mono)
            header.writeUInt32LE(SAMPLE_RATE, 24); // Sample Rate
            header.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28); // Byte Rate
            header.writeUInt16LE(bytesPerSample, 32); // Block Align
            header.writeUInt16LE(16, 34); // Bits per Sample

            header.write('data', 36); // Subchunk2 ID
            header.writeUInt32LE(dataSize, 40); // Subchunk2 Size

            // Genereer audio samples
            const audioData = Buffer.alloc(dataSize);
            let sampleIndex = 0;

            for (const pixel of pixels) {
                // Map brightness (0-255) naar frequentie (MIN_FREQUENCY-MAX_FREQUENCY)
                const frequency = MIN_FREQUENCY + (pixel.brightness / 255) * (MAX_FREQUENCY - MIN_FREQUENCY);

                for (let i = 0; i < samplesPerPixel; i++) {
                    const t = i / SAMPLE_RATE;
                    const sample = Math.sin(2 * Math.PI * frequency * t) * 0.5; // Sinusgolf, amplitude 0.5
                    const sampleValue = Math.round(sample * 32767); // 16-bit signed

                    audioData.writeInt16LE(sampleValue, sampleIndex);
                    sampleIndex += bytesPerSample;
                }
            }

            // Schrijf WAV-bestand
            await fs.writeFile(this.outputPath, Buffer.concat([header, audioData]));
            
        } catch (err) {
            throw new Error(`Failed to generate WAV: ${err.message}`);
        }
    }
}
