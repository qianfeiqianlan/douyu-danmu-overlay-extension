# Douyu Danmu Overlay

Douyu Danmu Overlay is a minimal Chrome extension that displays live Douyu danmu messages over the stream area on Douyu room pages.

## Features

- Runs only on `https://www.douyu.com/*`.
- Stays disabled by default until you enable it from the extension popup.
- Provides a toolbar popup switch for turning the overlay on or off.
- Detects the Douyu stream container and mounts a transparent overlay above it.
- Connects to Douyu's danmu WebSocket service and listens for live chat messages.
- Displays danmu as scrolling text from right to left.
- Uses the color value included in Douyu chat messages when available.
- Hides sender names and shows only the danmu text.
- Falls back to a small demo message loop when the room ID cannot be detected or the WebSocket connection is unavailable.

## Installation

1. Open Chrome and go to `chrome://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

   ```text
   douyu-danmu-overlay-extension
   ```

5. Open or refresh a Douyu room page.
6. Click the extension icon in the Chrome toolbar and turn on **Show danmu overlay**.

## Current Limitations

- The extension currently targets `.stream__T55I3`, which appears to be a generated Douyu frontend class name. If Douyu changes its page structure, the selector may need to be updated.
- Room ID detection is intentionally simple. Numeric room URLs work best.
- This is a learning/demo project and is not an official Douyu product.

## Development Notes

The danmu protocol implementation is based on the local demo script in `../test/print-danmu.mjs` and the existing project code under `../DouYuRecorder/src/dy_client`.

After editing the extension, refresh it from `chrome://extensions/`, then reload the Douyu page.
