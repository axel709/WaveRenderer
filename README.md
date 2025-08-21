# WaveRenderer

WaveRenderer is a Node.js application designed to explore the fascinating intersection of image and audio data. It provides functionality to convert PNG images into WAV audio files and, conversely, convert WAV audio files back into PNG images.

## Features

*   **Image to Audio Conversion:** Transforms PNG images into WAV audio files, where visual data is represented as sound.
*   **Audio to Image Conversion:** Reconstructs PNG images from WAV audio files, allowing for the visualization of sound data.
*   **Directory Monitoring:** Automatically processes files placed in designated input directories.

## Installation

To set up the project locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/axel709/WaveRenderer.git
    cd WaveRenderer
    ```

## Usage

To run the WaveRenderer application:

1.  **Place your input files:**
    *   For **PNG to WAV** conversion, place your `.png` image files into the `input/` directory.
    *   For **WAV to PNG** conversion, place your `.wav` audio files into the `audio/` directory.

2.  **Start the application:**
    ```bash
    npm start
    ```

The application will automatically process the files:
*   PNG files from `input/` will be converted to WAV and saved in the `audio/` directory.
*   WAV files from `audio/` will be converted to PNG and saved in the `output/` directory.

## Project Structure

```
.
├── audio/          # Stores generated WAV files and input WAVs for image conversion
├── input/          # Place your PNG images here for audio conversion
├── output/         # Stores generated PNG images from audio conversion
├── src/
│   ├── controllers/  # Handles conversion logic (e.g., ConverterController)
│   ├── managers/     # Manages specific file operations (e.g., PNGFromWAVManager)
│   ├── services/     # Core processing logic (e.g., processor.js)
│   ├── constants.js  # Defines project-wide constants
│   └── server.js     # Application entry point
├── .gitattributes
├── .gitignore
└── package.json
```

## License

This project is licensed under the MIT License.
