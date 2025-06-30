import { PNGManager } from '../managers/PNGManager.js';
import { WAVManager } from '../managers/WAVManager.js';

export class ConverterController {
    constructor(inputPath, outputPath) {
        this.inputPath = inputPath;
        this.outputPath = outputPath;
        this.pngManager = new PNGManager(inputPath);
        this.wavManager = new WAVManager(outputPath);
    }

    async run() {
        try {
            const { width, height, pixels, colorType } = await this.pngManager.readPixels();
            await this.wavManager.generateWAV(width, height, pixels, colorType);
        } catch (err) {
            throw new Error(`Failed to process image: ${err.message}`);
        }
    }
}
