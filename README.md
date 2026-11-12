# Air Canvas ✨

**Draw in the air with your fingertip.**
Air Canvas is a small web app that uses your webcam and hand tracking to turn your finger into a paintbrush. No mouse, no touchscreen, just wave and paint.

🔗 **Live demo:** https://ananyasrivastava3636-ux.github.io/air-canvas/

![Air Canvas demo](assets/demo.gif)
<!-- Replace with a screenshot or GIF of the app: upload it to the assets folder as demo.gif (or demo.png and change the name above) -->

---

## What it does

- 🎥 Turns on your webcam and tracks your hand in real time, right in the browser
- ☝️ Raise your **index finger** to draw a line that follows your fingertip
- ✌️ Raise your **index + middle finger** to hover (move without drawing)
- 🌈 Shows a colourful hand "skeleton" and a cursor, so you always know where you're pointing
- 🪷 A dreamy, painterly design with hand-drawn stickers and frosted-glass panels

## How to use it

1. Open the [live demo](https://ananyasrivastava3636-ux.github.io/air-canvas/) in Chrome or Edge on a laptop.
2. Click **Start Camera** and allow camera access.
3. Sit in good light and hold your hand up, palm facing the screen, about an arm's length away.
4. Use the gestures below.

| Gesture | What it does |
|---|---|
| ☝️ Index finger up | Draw |
| ✌️ Index + middle finger up | Hover (move without drawing) |
| 🧽 "Clear drawing" button | Wipe the canvas |

> Your camera video stays on your device. Nothing is recorded or uploaded.

## Coming soon 🌱

I'm building this in stages to learn as I go. Next up:

- 🤏 Pinch to pick a colour from a palette bar, plus brush sizes
- 🖐️ Hold an open palm for 1 second to clear the canvas
- 👍 Thumbs up to save your drawing as a PNG
- 🐱 A sticker tray: pinch a sticker to pick it up, drag it, and drop it onto your drawing
- ✨ A sparkle trail while drawing and a little bounce when stickers land

## Built with

- **HTML, CSS and JavaScript**: no frameworks, just three files
- **[Google MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)**: tracks 21 points on the hand, loaded from a CDN
- **HTML Canvas**: two layers, one for the drawing and one for the live hand cursor
- **Google Fonts**: Fraunces and DM Sans
- **GitHub Pages**: free hosting

## How it works (in short)

1. MediaPipe finds 21 "landmarks" on your hand in every video frame.
2. The app checks which fingers are up by comparing each fingertip with its knuckle.
3. The gesture decides the mode: draw, hover or resting. A mode only switches after it's seen for a few frames in a row, so tracking flickers don't cause stray marks.
4. The fingertip position is smoothed so lines look hand-drawn instead of shaky.
5. In draw mode, a short line is painted from the last fingertip position to the new one, about 60 times a second.

## What I learned

- How the webcam, `<canvas>` and `requestAnimationFrame` work together to make a real-time app
- How hand-tracking landmarks are structured, and how to turn them into gestures
- Smoothing noisy input (linear interpolation) and filtering out glitches with the distance formula
- Designing a soft, minimal interface with CSS variables, glassmorphism and a consistent colour palette
- Publishing a site with Git, GitHub and GitHub Pages

## Credits 💛

**Background painting**
- Water-lily painting in the style of Claude Monet, AI-generated

All artwork belongs to its original creators and is used here with credit in a personal, non-commercial learning project. If you're one of the artists and would like your work removed, please contact me and I'll take it down.

---

Made by me
