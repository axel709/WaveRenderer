import { CONSTANTS } from '../constants.js';
import { writeFile } from 'fs/promises';

/**
 * Manages WAV audio file generation from PNG pixel data
 * Converts pixel values to audio frequencies for data storage
 */
export class WAVManager {
    /**
     * Creates a new WAV manager instance
     * @param {string} outputPath - Path where the WAV file will be saved
     */
    constructor(outputPath) {
        this.outputPath = outputPath;
    }

    /**
     * Generates a WAV audio file from PNG pixel data
     * @param {number} width - Image width in pixels
     * @param {number} height - Image height in pixels
     * @param {Buffer} pixels - Pixel data buffer
     * @param {number} colorType - PNG color type (0, 2, 3, 6)
     * @returns {Promise<void>}
     */
    async generateWAV(width, height, pixels, colorType) {
        const sampleRate = CONSTANTS.WAV.SAMPLE_RATE;
        const markerSampleCount = sampleRate; // Duration for dimension markers
        const pixelSampleComponentCount = CONSTANTS.WAV.PIXEL.SAMPLES_PER_COMPONENT;
        const totalComponents = pixels.length; // Total pixel components

        // Calculate total audio samples needed
        const totalSamples = markerSampleCount * 2 + totalComponents * pixelSampleComponentCount;
        const bytesPerSample = 2; // 16-bit audio
        const dataSize = totalSamples * bytesPerSample; // Audio data size
        const totalSize = 44 + dataSize; // WAV header + data

        // Allocate buffer for entire WAV file
        const buffer = Buffer.allocUnsafe(totalSize);
        let offset = 0;

        // Write WAV header
        buffer.write('RIFF', offset); offset += 4; // RIFF chunk identifier
        buffer.writeUInt32LE(36 + dataSize, offset); offset += 4; // File size - 8 bytes
        buffer.write('WAVE', offset); offset += 4; // WAVE format

        // Write format chunk
        buffer.write('fmt ', offset); offset += 4; // Format chunk identifier
        buffer.writeUInt32LE(16, offset); offset += 4; // Format chunk size
        buffer.writeUInt16LE(1, offset); offset += 2; // Audio format (PCM)
        buffer.writeUInt16LE(1, offset); offset += 2; // Number of channels (mono)
        buffer.writeUInt32LE(sampleRate, offset); offset += 4; // Sample rate
        buffer.writeUInt32LE(sampleRate * bytesPerSample, offset); offset += 4; // Byte rate
        buffer.writeUInt16LE(bytesPerSample, offset); offset += 2; // Block align
        buffer.writeUInt16LE(bytesPerSample * 8, offset); offset += 2; // Bits per sample

        // Write data chunk header
        buffer.write('data', offset); offset += 4; // Data chunk identifier
        buffer.writeUInt32LE(dataSize, offset); offset += 4; // Data chunk size

        // Initialize tone generation variables
        let phase = 0; // Current wave phase
        const amplitudeFactor = 0.5 * 32767; // 16-bit amplitude scaling

        /**
         * Generates a sine wave tone and writes it to the buffer
         * @param {number} frequency - Frequency in Hz (0 for silence)
         * @param {number} count - Number of samples to generate
         */
        const generateTone = (frequency, count) => {
            if (frequency === 0) {
                // Generate silence for zero frequency
                buffer.fill(0, offset, offset + count * 2);
                offset += count * 2;
                return;
            }

            // Calculate phase increment per sample
            const phaseDelta = 2 * Math.PI * frequency / sampleRate;
            const cosDelta = Math.cos(phaseDelta);
            
            // Use recurrence relation for efficient sine calculation
            let previousSample = Math.sin(phase - phaseDelta);
            let currentSample = Math.sin(phase);

            // Generate sine wave samples
            for (let i = 0; i < count; i++) {
                const nextSample = 2 * cosDelta * currentSample - previousSample;
                buffer.writeInt16LE((currentSample * amplitudeFactor) | 0, offset);
                offset += 2;
                previousSample = currentSample;
                currentSample = nextSample;
            }

            // Update phase for continuity
            phase = (phase + phaseDelta * count) % (2 * Math.PI);
        };

        // Generate dimension markers at the start
        const widthFrequency = width * CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE; // Width marker frequency
        const heightFrequency = height * CONSTANTS.WAV.FREQUENCIES.MARKER_SCALE; // Height marker frequency
        generateTone(widthFrequency, markerSampleCount); // Encode width
        generateTone(heightFrequency, markerSampleCount); // Encode height

        // Convert pixel data to audio tones
        const pixelScale = CONSTANTS.WAV.PIXEL.SCALE; // Pixel value scaling factor
        const bytesPerPixel = { 6: 4, 2: 3, 0: 1 }[colorType]; // Bytes per pixel for each color type

        // Process each pixel based on color type
        for (let i = 0; i < pixels.length; i += bytesPerPixel) {
            if (colorType === 6) {
                // RGBA: 4 components per pixel
                generateTone(pixels[i] * pixelScale, pixelSampleComponentCount); // Red
                generateTone(pixels[i + 1] * pixelScale, pixelSampleComponentCount); // Green
                generateTone(pixels[i + 2] * pixelScale, pixelSampleComponentCount); // Blue
                generateTone(pixels[i + 3] * pixelScale, pixelSampleComponentCount); // Alpha
            } else if (colorType === 2) {
                // RGB: 3 components per pixel
                generateTone(pixels[i] * pixelScale, pixelSampleComponentCount); // Red
                generateTone(pixels[i + 1] * pixelScale, pixelSampleComponentCount); // Green
                generateTone(pixels[i + 2] * pixelScale, pixelSampleComponentCount); // Blue
            } else {
                // Grayscale or indexed: 1 component per pixel
                generateTone(pixels[i] * pixelScale, pixelSampleComponentCount); // Gray or index value
            }
        }

        // Log file size for monitoring
        console.log(`WAV size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

        // Write the completed WAV file
        await writeFile(this.outputPath, buffer);
    }
}
