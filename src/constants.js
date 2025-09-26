/**
 * Application-wide constants and configuration
 */
export const CONSTANTS = {
    /**
     * Directory paths used throughout the application
     */
    DIRECTORIES: {
        INPUT: 'input',     // Input directory for PNG files
        OUTPUT: 'output',   // Output directory for generated PNG files
        TESTS: 'tests',     // Test files directory
        DIST: 'dist',       // Distribution directory
        AUDIO: 'audio'      // Audio files directory for WAV files
    },

    /**
     * PNG Color Type definitions:
     * Color Type 0: Grayscale
     * Color Type 2: Truecolor (RGB)
     * Color Type 3: Indexed-color
     * Color Type 4: Grayscale with alpha
     * Color Type 6: Truecolor with alpha (RGBA)
     */

    /**
     * Color Type bit depth specifications:
     * 
     * Color    Allowed    Interpretation
     * Type     Bit Depths
     * 
     * 3 -      1,2,4,8     Each pixel is a palette index;
     * (ADD)                a PLTE chunk must appear.
     * 
     * 4 -      8,16        Each pixel is a grayscale sample,
     *                      followed by an alpha sample.
     */

    /**
     * Feature implementation status:
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

    /**
     * PNG format specifications and supported features
     */
    PNG: {
        /** PNG file signature bytes */
        SIGNATURE: Buffer.from([ 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A ]),

        /** Supported PNG features */
        SUPPORTED: {
            COLOR_TYPES: [0, 2, 6], // Supported color types: Grayscale, RGB, RGBA
            BIT_DEPTH: 8 // Supported bit depth
        },
    },

    WAV: {
        SAMPLE_RATE: 44100, // Standard CD-quality sample rate

        /** Frequency mapping for pixel values */
        FREQUENCIES: {
            MIN: 0, // Minimum frequency for silent pixels
            MAX: 255, // Maximum frequency for white pixels
            MARKER_SCALE: 10 // Scale factor for dimension markers
        },

        /** Pixel-to-audio conversion settings */
        PIXEL: {
            SAMPLES_PER_COMPONENT: 220, // Audio samples per pixel component (range: 18-372)
            SCALE: 10 // Frequency scale factor for pixel values
        }
    }
};
