/**
 * Main server module for initializing and running the PNG-to-audio conversion application.
 * @module server
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { ConverterController } from './controllers/ConverterController.js';
import { INPUT_DIR, OUTPUT_DIR } from './constants.js';

/**
 * The Server class manages the application's initialization and PNG-to-audio conversion.
 */
class Server {
    /**
     * Initializes the Server with input and output directory paths.
     * @constructor
     */
    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        /** @type {string} Directory path for input PNG files */
        this.baseInputDir = path.join(__dirname, `../${INPUT_DIR}`);
        
        /** @type {string} Directory path for output WAV files */
        this.baseOutputDir = path.join(__dirname, `../${OUTPUT_DIR}`);
    }

    /**
     * Processes all PNG files in the input directory and converts them to WAV audio.
     * @returns {Promise<void>}
     */
    async convertImagesToAudio() {
        try {
            /** @type {string[]} List of files in the input directory */
            const files = await fs.readdir(this.baseInputDir);
            const pngFiles = files.filter(file => file.toLowerCase().endsWith('.png'));

            if (pngFiles.length === 0) {
                throw new Error('No PNG files found in input directory');
            }

            for (const imageName of pngFiles) {
                const imagePath = path.join(this.baseInputDir, imageName);
                const outputPath = path.join(this.baseOutputDir, `converted_${imageName}.wav`);
                console.log(`Processing ${imageName}...`);

                const controller = new ConverterController(imagePath, outputPath);
                await controller.run();
                console.log(`Finished processing ${imageName}, output saved at ${outputPath}`);

            }

        } catch (err) {
            throw new Error(`Failed to process PNG files: ${err.message}`);
        }
    }
}

/**
 * Main function to initialize and run the server.
 * @returns {Promise<void>}
 */
async function main() {
    const server = new Server();

    try {
        await server.convertImagesToAudio();
        console.log('All PNG files processed successfully');

    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

// Execute the main function
main();
