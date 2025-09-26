// IMPORT CUSTOM MODULES
import { Process } from './services/processor.js';

/**
 * Main server class responsible for starting the application
 */
class Server {
    /**
     * Starts the processing pipeline
     * @returns {Promise<void>}
     */
    static async start() {
        // Initialize and run the processing pipeline
        const processor = new Process();
        await processor.runAll();
    }
}

/**
 * Main entry point of the application
 * Handles global error catching and process termination
 */
async function main() {
    try {
        await Server.start(); // Start the server
    } catch (err) {
        // Handle errors that occur during startup
        console.error('An error occurred during the process:', err);
        process.exit(1);
    }
}

// Start the application
main();
