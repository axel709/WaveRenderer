import { Process } from './services/processor.js';

class Server {
    static async start() {
        const processor = new Process();
        await processor.runAll();
    }
}

async function main() {
    try {
        await Server.start();
    } catch (err) {
        console.error('An error occurred during the process:', err);
        process.exit(1);
    }
}

main();
