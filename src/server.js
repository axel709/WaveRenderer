import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { ConverterController } from './controllers/ConverterController.js';
import { PNGFromWAVManager } from './managers/WTPManager.js';
import { INPUT_DIR, AUDIO_DIR, OUTPUT_DIR } from './constants.js';

class Server {
    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.baseInputDir = path.join(__dirname, `../${INPUT_DIR}`);
        this.baseAudioDir = path.join(__dirname, `../${AUDIO_DIR}`);
        this.baseOutputDir = path.join(__dirname, `../${OUTPUT_DIR}`);
    }

    async ensureDirectories() {
        try {
            await fs.mkdir(this.baseInputDir, { recursive: true });
            await fs.mkdir(this.baseAudioDir, { recursive: true });
            await fs.mkdir(this.baseOutputDir, { recursive: true });
        } catch (err) {
            throw new Error(`Failed to create directories: ${err.message}`);
        }
    }

    async convertImagesToAudioAndBack() {
        try {
            await this.ensureDirectories();
            const pngFiles = (await fs.readdir(this.baseInputDir)).filter(file => file.toLowerCase().endsWith('.png'));

            if (pngFiles.length === 0) {
                console.log('No PNG files found in input directory');
            } else {
                for (const imageName of pngFiles) {
                    const imagePath = path.join(this.baseInputDir, imageName);
                    const outputWavPath = path.join(this.baseAudioDir, `C_${imageName.replace('.png', '.wav')}`);
                    console.log(`Processing ${imageName} to WAV...`);

                    const controller = new ConverterController(imagePath, outputWavPath);
                    await controller.run();
                    console.log(`Finished processing ${imageName}, WAV saved at ${outputWavPath}\n`);
                }
            }

            const wavFiles = (await fs.readdir(this.baseAudioDir)).filter(file => file.toLowerCase().endsWith('.wav'));

            if (wavFiles.length === 0) {
                console.log('No WAV files found in audio directory');
            } else {
                for (const wavName of wavFiles) {
                    const wavPath = path.join(this.baseAudioDir, wavName);
                    const outputPngPath = path.join(this.baseOutputDir, `R${wavName.replace('.wav', '.png')}`);
                    console.log(`Converting WAV ${wavName} to PNG...`);

                    const wavToPngConverter = new PNGFromWAVManager(wavPath, outputPngPath);
                    await wavToPngConverter.convert();
                    console.log(`Finished converting WAV to PNG, saved at ${outputPngPath}\n`);
                }
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
        console.log('All files processed and reconstructed successfully');
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();
