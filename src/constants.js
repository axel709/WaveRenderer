/**
 * Constants used throughout the application for PNG processing and file handling.
 * @module constants
 */

/**
 * The PNG file signature as a Buffer.
 * @constant {Buffer}
 */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

/**
 * Supported PNG color types (2: RGB, 6: RGBA).
 * @constant {number[]}
 */
export const SUPPORTED_COLOR_TYPES = [2, 6];

/**
 * Supported bit depth for PNG processing (currently only 8).
 * @constant {number}
 */
export const BIT_DEPTH = 8;

/**
 * Directory name for input files.
 * @constant {string}
 */
export const INPUT_DIR = 'input';

/**
 * Directory name for output files (not used in current implementation).
 * @constant {string}
 */
export const OUTPUT_DIR = 'output';

/**
 * Default image name for processing.
 * @constant {string}
 */
export const DEFAULT_IMAGE_NAME = 'monk.png';
