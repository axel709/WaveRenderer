import { ConverterController } from '../controllers/ConverterController.js';
import { PNGFromWAVManager } from '../managers/WTPManager.js';
import { CONSTANTS } from '../constants.js';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import path from 'path';

export class Process {
    constructor() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(path.dirname(path.dirname(__filename))); 

        this.baseInputDir = path.join(__dirname, CONSTANTS.DIRECTORIES.INPUT);
        this.baseAudioDir = path.join(__dirname, CONSTANTS.DIRECTORIES.AUDIO);
        this.baseOutputDir = path.join(__dirname, CONSTANTS.DIRECTORIES.OUTPUT);
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

    async processImagesToAudio() {
        const pngFiles = (await fs.readdir(this.baseInputDir)).filter(file => file.toLowerCase().endsWith('.png'));

        if (pngFiles.length === 0) {
            console.log('No PNG files found in input directory');
            return;
        }

        for (const imageName of pngFiles) {
            const imagePath = path.join(this.baseInputDir, imageName);
            const outputWavPath = path.join(this.baseAudioDir, `C_${imageName.replace('.png', '.wav')}`);
            console.log(`Processing ${imageName} to WAV...`);

            const controller = new ConverterController(imagePath, outputWavPath);
            await controller.run();
            console.log(`Finished processing ${imageName}, WAV saved at ${outputWavPath}\n`);
        }
    }

    async processAudioToImages() {
        const wavFiles = (await fs.readdir(this.baseAudioDir)).filter(file => file.toLowerCase().endsWith('.wav'));

        if (wavFiles.length === 0) {
            console.log('No WAV files found in audio directory');
            return;
        }
        
        for (const wavName of wavFiles) {
            const wavPath = path.join(this.baseAudioDir, wavName);
            const outputPngPath = path.join(this.baseOutputDir, `R${wavName.replace('.wav', '.png')}`);
            console.log(`Converting WAV ${wavName} to PNG...`);

            const wavToPngConverter = new PNGFromWAVManager(wavPath, outputPngPath);
            await wavToPngConverter.convert();
            console.log(`Finished converting WAV to PNG, saved at ${outputPngPath}\n`);
        }
    }
    
    async runAll() {
        await this.ensureDirectories();
        await this.processImagesToAudio();
        await this.processAudioToImages();
    }
}
