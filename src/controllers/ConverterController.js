/**
 * Controller module for coordinating PNG-to-audio conversion.
 * @module controllers/ConverterController
 */

import { PNGManager } from '../managers/PNGManager.js';
import { WAVManager } from '../managers/WAVManager.js';

/**
 * The ConverterController class manages the PNG pixel reading and audio generation process.
 */
export class ConverterController {
    /**
     * Initializes the ConverterController with input and output file paths.
     * @param {string} inputPath - The file path to the input PNG.
     * @param {string} outputPath - The file path for the output WAV file.
     * @constructor
     */
    constructor(inputPath, outputPath) {
        /** @type {string} Path to the input PNG file */
        this.inputPath = inputPath;

        /** @type {string} Path to the output WAV file */
        this.outputPath = outputPath;

        /** @type {PNGManager} Instance of PNGManager for pixel processing */
        this.pngManager = new PNGManager(inputPath);

        /** @type {WAVManager} Instance of WAVManager for audio generation */
        this.wavManager = new WAVManager(outputPath);
    }

    /**
     * Executes the pixel reading and audio generation process, logging pixel brightness.
     * @throws {Error} If pixel processing or audio generation fails.
     * @returns {Promise<void>}
     */
    async run() {
        try {
            const pixels = await this.pngManager.readPixels();

            for (const pixel of pixels) {
                console.log(`Pixel at (${pixel.x}, ${pixel.y}): Brightness = ${pixel.brightness}`);
            }

            await this.wavManager.generateWAV(pixels);
            
        } catch (err) {
            throw new Error(`Failed to process image: ${err.message}`);
        }
    }
}
