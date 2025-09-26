export const CONSTANTS = {
    DIRECTORIES: {
        INPUT: 'input',
        OUTPUT: 'output',
        TESTS: 'tests',
        DIST: 'dist',
        AUDIO: 'audio'
    },

    /**
     * Color Type 0: Grayscale
     * Color Type 2: Truecolor (RGB)
     * Color Type 3: Indexed-color
     * Color Type 4: Grayscale with alpha
     * Color Type 6: Truecolor with alpha (RGBA)
     */


    /**
     
    Color    Allowed    Interpretation
    Type    Bit Depths
   
    3 -     1,2,4,8     Each pixel is a palette index;
    (ADD)               a PLTE chunk must appear.

    4 -     8,16        Each pixel is a grayscale sample,
                        followed by an alpha sample.
                        
     */

    /**
     * 
     * [===] - Add ColorType 3 support (indexed color)
     * [-] - PLTE chunk support
     * [-] - cHRM chunk support
     * [-] - gAMA chunk support
     * [-] - sRGB chunk support
     * [-] - pHYs chunk support (not needed)
     * [-] - tIME chunk support (not needed)
     *
     */

    PNG: {
        SIGNATURE: Buffer.from([ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A ]),

        SUPPORTED: {
            COLOR_TYPES: [0, 2, 6],
            BIT_DEPTH: 8
        },
    },

    WAV: {
        SAMPLE_RATE: 44100,

        FREQUENCIES: {
            MIN: 0,
            MAX: 255,
            MARKER_SCALE: 10
        },

        PIXEL: {
            SAMPLES_PER_COMPONENT: 220, // 18 .. 372
            SCALE: 10 
        }
    }
};
