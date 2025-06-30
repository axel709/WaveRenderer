export const CONSTANTS = {
    DIRECTORIES: {
        INPUT: 'input',
        OUTPUT: 'output',
        TESTS: 'tests',
        DIST: 'dist',
        AUDIO: 'audio'
    },

    PNG: {
        SIGNATURE: Buffer.from([ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A ]),

        SUPPORTED: {
            COLOR_TYPES: [0, 2, 6],
            BIT_DEPTH: 8
        }
    },

    WAV: {
        SAMPLE_RATE: 44100,

        FREQUENCIES: {
            MIN: 0,
            MAX: 255,
            MARKER_SCALE: 10
        },

        PIXEL: {
            // DURATION: 0.005, // Oude waarde, veroorzaakte afrondingsproblemen
            SAMPLES_PER_COMPONENT: 220, // Expliciet aantal samples per pixel component
            SCALE: 10
        }
    }
};