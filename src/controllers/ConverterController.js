/**
 * Controller module for coordinating PNG pixel processing.
 * @module controllers/ConverterController
 */

import { PNGManager } from '../managers/PNGManager.js';

/**
 * The ConverterController class manages the pixel reading process for PNG files.
 */
export class ConverterController {
    /**
     * Initializes the ConverterController with the input file path.
     * @param {string} inputPath - The file path to the input PNG.
     * @constructor
     */
    constructor(inputPath) {
        /** @type {string} Path to the input PNG file */
        this.inputPath = inputPath;
        
        /** @type {PNGManager} Instance of PNGManager for pixel processing */
        this.pngManager = new PNGManager(inputPath);
    }

    /**
     * Executes the pixel reading process and logs pixel brightness.
     * @throws {Error} If pixel processing fails.
     * @returns {Promise<void>}
     */
    async run() {
        try {
            const pixels = await this.pngManager.readPixels();

            for (const pixel of pixels) {
                console.log(`Pixel at (${pixel.x}, ${pixel.y}): Brightness = ${pixel.brightness}`);
            }

        } catch (err) {
            throw new Error(`Failed to process image: ${err.message}`);
        }
    }
}
