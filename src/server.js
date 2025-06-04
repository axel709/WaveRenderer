/**
 * Main server module for initializing and running the PNG pixel processing application.
 * @module server
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { ConverterController } from './controllers/ConverterController.js';
import { INPUT_DIR, DEFAULT_IMAGE_NAME } from './constants.js';

/**
 * The Server class manages the application's initialization and PNG pixel processing.
 */
class Server {
    /**
     * Initializes the Server with the input directory path.
     * @constructor
     */
    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        /** @type {string} Directory path for input PNG files */
        this.baseInputDir = path.join(__dirname, `../${INPUT_DIR}`);
    }

    /**
     * Reads pixels from a PNG file and logs their brightness.
     * @param {string} imageName - The name of the PNG file to process.
     * @throws {Error} If the image name is not provided.
     * @returns {Promise<void>}
     */
    async readPixels(imageName) {
        if (!imageName) {
            throw new Error('Image name is required for processing.');
        }

        const imagePath = path.join(this.baseInputDir, imageName);
        const controller = new ConverterController(imagePath);
        await controller.run();
    }
}

/**
 * Main function to initialize and run the server.
 * @returns {Promise<void>}
 */
async function main() {
    const server = new Server();

    try {
        await server.readPixels(DEFAULT_IMAGE_NAME);
        console.log(`Successfully processed ${DEFAULT_IMAGE_NAME}`);
        
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

// Execute the main function
main();
