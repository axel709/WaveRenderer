import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { ConverterController } from './controllers/ConverterController.js';
import { PNGFromWAVManager } from './managers/WTPManager.js';
import { INPUT_DIR, OUTPUT_DIR } from './constants.js';

class Server {
    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.baseInputDir = path.join(__dirname, `../${INPUT_DIR}`);
        this.baseOutputDir = path.join(__dirname, `../${OUTPUT_DIR}`);
    }

    async convertImagesToAudioAndBack() {
        try {
            const files = await fs.readdir(this.baseInputDir);
            const pngFiles = files.filter(file => file.toLowerCase().endsWith('.png'));

            if (pngFiles.length === 0) {
                throw new Error('No PNG files found in input directory');
            }

            for (const imageName of pngFiles) {
                const imagePath = path.join(this.baseInputDir, imageName);
                const outputWavPath = path.join(this.baseOutputDir, `converted_${imageName}.wav`);
                const outputPngPath = path.join(this.baseOutputDir, `reconstructed_${imageName}`);
                console.log(`Processing ${imageName} to WAV...`);

                const controller = new ConverterController(imagePath, outputWavPath);
                await controller.run();
                console.log(`Finished processing ${imageName}, WAV saved at ${outputWavPath}`);
                console.log(`Converting WAV ${outputWavPath} back to PNG...`);

                const wavToPngConverter = new PNGFromWAVManager(outputWavPath, outputPngPath);
                await wavToPngConverter.convert();
                console.log(`Finished converting WAV to PNG, saved at ${outputPngPath}`);
            }
        } catch (err) {
            throw new Error(`Failed to process files: ${err.message}`);
        }
    }
}

async function main() {
    const server = new Server();

    try {
        await server.convertImagesToAudioAndBack();
        console.log('All PNG files processed and reconstructed successfully');
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();
