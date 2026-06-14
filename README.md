# Minimal Broadcast Box Player

Minimal WebRTC player for watching [Broadcast Box](https://github.com/glimesh/broadcast-box) streams via WHEP. Single HTML file — no dependencies.

## Usage

```
https://janjusti.github.io/minimal-broadcastbox-player/?stream_key=my-key
```

Tap/click the video to go fullscreen. Automatically retries up to 3 times on failure.

## Setup

1. Edit the `WHEP_URL` constant inside `index.html` to your endpoint.
2. Deploy to GitHub Pages (or any static host).
