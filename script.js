/*
  script.js — HOW THE PAGE BEHAVES
  Responsibilities so far (Stages 1 + 2):
    1. Turn on the webcam when you click "Start Camera".
    2. Load Google's MediaPipe Hand Landmarker (the hand-tracking AI).
    3. Every frame: find your hand, work out which fingers are up,
       and decide the mode: DRAW (index up) or HOVER (index + middle up).
    4. In DRAW mode, paint a line that follows your index fingertip.
    5. Show a cursor at your fingertip and update the side panel.
*/

// ---------------------------------------------------------------
// 1. IMPORT MEDIAPIPE FROM A CDN
// NEW CONCEPT — CDN: a "Content Delivery Network" is a website that hosts
// code libraries. Instead of installing MediaPipe on your computer, we
// "import" it straight from the internet. That's why you need to be online.
// ---------------------------------------------------------------
import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// ---------------------------------------------------------------
// 2. GRAB THE HTML ELEMENTS WE NEED
// document.getElementById finds an element in index.html by its id,
// so JavaScript can control it (change text, draw on it, etc.).
// ---------------------------------------------------------------
const startButton = document.getElementById("startButton");
const clearButton = document.getElementById("clearButton");
const statusPill = document.getElementById("statusPill");
const statusMessage = document.getElementById("statusMessage");
const stage = document.getElementById("stage");
const webcamVideo = document.getElementById("webcamVideo");
const paintCanvas = document.getElementById("paintCanvas");
const overlayCanvas = document.getElementById("overlayCanvas");
const modeCard = document.getElementById("modeCard");
const modeText = document.getElementById("modeText");
const gestureRows = document.querySelectorAll(".gesture-list li[data-gesture]");

// NEW CONCEPT — canvas: a <canvas> is a blank drawing surface. To draw on
// it, we ask for its "2D context": a set of drawing tools (pen, fill,
// circles, lines). We have TWO canvases, so we get two sets of tools:
//   paintContext   → your drawing (we never wipe this by accident)
//   overlayContext → hand dots + cursor (wiped and redrawn every frame)
const paintContext = paintCanvas.getContext("2d");
const overlayContext = overlayCanvas.getContext("2d");

// ---------------------------------------------------------------
// 3. READ OUR COLOURS FROM style.css
// WHY: we want ONE place to change colours (the CSS variables). This reads
// those values so the canvas uses the same palette as the rest of the page.
// ---------------------------------------------------------------
const pageStyles = getComputedStyle(document.documentElement);

// A tiny helper: give it "--moss", it gives back "#54601B".
function readColour(variableName) {
  return pageStyles.getPropertyValue(variableName).trim();
}

// Each finger gets its own palette colour for the hand skeleton
const fingerColours = {
  wrist: readColour("--moss"),
  thumb: readColour("--hibiscus"),
  index: readColour("--tangerine"),
  middle: readColour("--lemon"),
  ring: readColour("--pear"),
  pinky: readColour("--rose-petal"),
};

// ---------------------------------------------------------------
// 4. SETTINGS YOU CAN PLAY WITH
// Keeping these at the top means you can tweak the feel of the app
// without hunting through the code.
// ---------------------------------------------------------------
const brushColour = readColour("--hibiscus"); // Stage 3 will let you pick colours
const brushSize = 8;                          // line thickness in pixels

// How much to smooth the fingertip's movement (0 = very smooth/slow, 1 = raw/jittery)
const smoothingAmount = 0.45;

// How many frames in a row a gesture must be seen before we believe it.
// WHY: hand tracking flickers a little; without this, a single wrong frame
// could leave a random dot or break your line.
const framesNeededToSwitchMode = 3;

// If the fingertip "jumps" further than this in one frame, it's probably a
// tracking glitch, so we don't draw a line across the whole screen.
const maximumJumpDistance = 120;

// ---------------------------------------------------------------
// 5. VARIABLES THAT REMEMBER THINGS BETWEEN FRAMES
// "let" (not "const") because these values change while the app runs.
// ---------------------------------------------------------------
let handLandmarker = null;       // the hand tracker, once loaded
let lastVideoTime = -1;          // helps us skip frames we've already processed
let currentMode = "off";         // "off", "none" (no hand), "idle", "draw" or "hover"
let candidateMode = "none";      // a mode we've just started seeing (not confirmed yet)
let candidateFrameCount = 0;     // how many frames in a row we've seen candidateMode
let smoothedFingertip = null;    // the fingertip position after smoothing
let previousDrawPoint = null;    // where the last bit of line ended (null = start a new line)

// NEW CONCEPT — landmarks: MediaPipe describes a hand as 21 numbered points
// called "landmarks". Each point has x and y between 0 and 1 (a fraction of
// the video's width and height). The numbers we need:
//   4 = thumb tip, 8 = index tip, 12 = middle tip, 16 = ring tip, 20 = pinky tip
//   6, 10, 14, 18 = the middle knuckle of index, middle, ring, pinky
const FINGERTIP_INDEXES = [4, 8, 12, 16, 20];
const handConnections = HandLandmarker.HAND_CONNECTIONS; // pairs of points to join with lines

// ---------------------------------------------------------------
// 6. LOAD THE HAND TRACKER
// NEW CONCEPT — async / await: some tasks take time (downloading a model,
// asking for the camera). "async" marks a function that can wait, and
// "await" means "pause here until this finishes, then continue", without
// freezing the whole page while we wait.
// ---------------------------------------------------------------
async function loadHandTracker() {
  setStatus("Loading hand tracker…", "is-loading");

  // Load MediaPipe's engine files (WebAssembly: a fast format browsers can run)
  const visionFiles = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(visionFiles, {
    baseOptions: {
      // The trained AI "model" file that knows what hands look like
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU", // use the graphics card if possible: it's faster
    },
    runningMode: "VIDEO", // we're tracking a moving video, not a single photo
    numHands: 1,          // only one hand: simpler and faster
  });
}

// ---------------------------------------------------------------
// 7. TURN ON THE WEBCAM
// getUserMedia asks the browser for camera access. If you allow it, we get
// a live "stream" and plug it into the <video> element.
// ---------------------------------------------------------------
async function startWebcam() {
  setStatus("Asking for camera permission…", "is-loading");

  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 }, // a modest size keeps tracking fast
    audio: false,
  });
  webcamVideo.srcObject = cameraStream;

  // Wait until the video has real frames, so we know its actual size
  await new Promise((resolve) => {
    webcamVideo.onloadeddata = resolve;
  });

  // Make BOTH canvases match the video's size exactly, so a point on the
  // video lines up with the same point on each canvas.
  for (const canvas of [paintCanvas, overlayCanvas]) {
    canvas.width = webcamVideo.videoWidth;
    canvas.height = webcamVideo.videoHeight;
  }
}

// ---------------------------------------------------------------
// 8. SMALL HELPERS
// ---------------------------------------------------------------

// Update the status pill text and its dot colour ("is-loading" or "is-live")
function setStatus(message, stateClass) {
  statusMessage.textContent = message;
  statusPill.classList.remove("is-loading", "is-live");
  if (stateClass) statusPill.classList.add(stateClass);
}

// Convert a landmark (fractions 0–1) into canvas pixels.
// We flip x with (1 - x) because the video is mirrored in CSS.
function toCanvasPoint(landmark) {
  return {
    x: (1 - landmark.x) * overlayCanvas.width,
    y: landmark.y * overlayCanvas.height,
  };
}

// NEW CONCEPT — distance formula: the straight-line distance between two
// points is √((x2 − x1)² + (y2 − y1)²). It's Pythagoras' theorem: the
// x-gap and y-gap are the two short sides of a triangle, distance is the long side.
// Math.hypot does exactly this calculation for us.
function distanceBetween(pointA, pointB) {
  return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
}

// Which colour should a landmark be? Points are numbered along each finger:
// 0 = wrist, 1–4 thumb, 5–8 index, 9–12 middle, 13–16 ring, 17–20 pinky.
function colourForPoint(pointNumber) {
  if (pointNumber === 0) return fingerColours.wrist;
  if (pointNumber <= 4) return fingerColours.thumb;
  if (pointNumber <= 8) return fingerColours.index;
  if (pointNumber <= 12) return fingerColours.middle;
  if (pointNumber <= 16) return fingerColours.ring;
  return fingerColours.pinky;
}

// ---------------------------------------------------------------
// 9. IS A FINGER UP?
// In images, y = 0 is the TOP and y grows downwards. So when a finger points
// up, its tip is HIGHER than its middle knuckle, meaning a SMALLER y value.
// ---------------------------------------------------------------
function isFingerUp(handLandmarks, tipNumber, knuckleNumber) {
  return handLandmarks[tipNumber].y < handLandmarks[knuckleNumber].y;
}

// ---------------------------------------------------------------
// 10. WORK OUT THE GESTURE (the "raw" mode for this single frame)
// ---------------------------------------------------------------
function detectGesture(handLandmarks) {
  const indexUp = isFingerUp(handLandmarks, 8, 6);
  const middleUp = isFingerUp(handLandmarks, 12, 10);
  const ringUp = isFingerUp(handLandmarks, 16, 14);
  const pinkyUp = isFingerUp(handLandmarks, 20, 18);

  // We also check ring and pinky are DOWN, so an open hand doesn't count as drawing
  if (indexUp && !middleUp && !ringUp && !pinkyUp) return "draw";
  if (indexUp && middleUp && !ringUp && !pinkyUp) return "hover";
  return "idle";
}

// ---------------------------------------------------------------
// 11. CONFIRM A MODE ONLY AFTER IT'S STEADY
// We only switch to a new mode after seeing it framesNeededToSwitchMode
// times in a row. One flickery frame can't interrupt your drawing.
// ---------------------------------------------------------------
function updateMode(rawMode) {
  if (rawMode === candidateMode) {
    candidateFrameCount += 1;
  } else {
    candidateMode = rawMode;
    candidateFrameCount = 1;
  }

  if (candidateFrameCount >= framesNeededToSwitchMode && candidateMode !== currentMode) {
    currentMode = candidateMode;
    showModeInPanel(currentMode);

    // Leaving draw mode means lifting the pen: the next line starts fresh
    if (currentMode !== "draw") previousDrawPoint = null;
  }
}

// ---------------------------------------------------------------
// 12. SHOW THE MODE IN THE SIDE PANEL
// data-mode on the card lets style.css tint it; "is-active" highlights
// the matching row in the gesture list.
// ---------------------------------------------------------------
const modeDescriptions = {
  off: "Camera is off",
  none: "Looking for your hand 👀",
  idle: "Resting 🤚",
  draw: "Drawing ✏️",
  hover: "Hovering ✌️",
};

function showModeInPanel(mode) {
  modeCard.dataset.mode = mode;          // sets data-mode="draw" etc. in the HTML
  modeText.textContent = modeDescriptions[mode];

  gestureRows.forEach((row) => {
    // toggle(className, condition): adds the class if true, removes it if false
    row.classList.toggle("is-active", row.dataset.gesture === mode);
  });
}

// ---------------------------------------------------------------
// 13. SMOOTH THE FINGERTIP
// NEW CONCEPT — "lerp" (linear interpolation): instead of jumping straight
// to the new position, we move part of the way there each frame.
// With smoothingAmount = 0.45 we move 45% of the gap each frame. That
// cancels out tiny shakes and makes lines look hand-drawn, not jittery.
// ---------------------------------------------------------------
function smoothPoint(newPoint) {
  if (smoothedFingertip === null) {
    smoothedFingertip = { ...newPoint }; // first frame: no history yet, so just copy it
  } else {
    smoothedFingertip.x += (newPoint.x - smoothedFingertip.x) * smoothingAmount;
    smoothedFingertip.y += (newPoint.y - smoothedFingertip.y) * smoothingAmount;
  }
  return smoothedFingertip;
}

// ---------------------------------------------------------------
// 14. PAINT A PIECE OF LINE
// Every frame in draw mode, we draw a short line from where the fingertip
// WAS to where it IS now. Hundreds of short lines join into one smooth stroke.
// ---------------------------------------------------------------
function paintStroke(fingertipPoint) {
  // Skip suspicious jumps (tracking glitches), and start a fresh line instead
  if (previousDrawPoint && distanceBetween(previousDrawPoint, fingertipPoint) < maximumJumpDistance) {
    paintContext.strokeStyle = brushColour;
    paintContext.lineWidth = brushSize;
    paintContext.lineCap = "round";   // round ends so short pieces join without gaps
    paintContext.lineJoin = "round";  // round corners where pieces meet

    // beginPath = start a new shape; moveTo = put the pen down;
    // lineTo = drag the pen to here; stroke = actually draw it.
    paintContext.beginPath();
    paintContext.moveTo(previousDrawPoint.x, previousDrawPoint.y);
    paintContext.lineTo(fingertipPoint.x, fingertipPoint.y);
    paintContext.stroke();
  }

  // Remember this point so the next piece of line starts here
  previousDrawPoint = { ...fingertipPoint };
}

// ---------------------------------------------------------------
// 15. DRAW THE HAND SKELETON (faint, so your drawing is the star)
// ---------------------------------------------------------------
function drawHandSkeleton(handLandmarks) {
  // globalAlpha = transparency for everything drawn next (0 invisible, 1 solid)
  overlayContext.globalAlpha = 0.45;
  overlayContext.lineWidth = 3;
  overlayContext.lineCap = "round";

  for (const connection of handConnections) {
    const startPoint = toCanvasPoint(handLandmarks[connection.start]);
    const endPoint = toCanvasPoint(handLandmarks[connection.end]);
    overlayContext.strokeStyle = colourForPoint(connection.end);
    overlayContext.beginPath();
    overlayContext.moveTo(startPoint.x, startPoint.y);
    overlayContext.lineTo(endPoint.x, endPoint.y);
    overlayContext.stroke();
  }

  // Small dots on each fingertip (skipping the index tip: the cursor goes there)
  for (const tipNumber of FINGERTIP_INDEXES) {
    if (tipNumber === 8) continue; // "continue" = skip to the next item in the loop
    const point = toCanvasPoint(handLandmarks[tipNumber]);
    overlayContext.fillStyle = colourForPoint(tipNumber);
    overlayContext.beginPath();
    // arc(centre x, centre y, radius, start angle, end angle): Math.PI * 2 = full circle
    overlayContext.arc(point.x, point.y, 5, 0, Math.PI * 2);
    overlayContext.fill();
  }

  overlayContext.globalAlpha = 1; // reset transparency for whatever we draw next
}

// ---------------------------------------------------------------
// 16. DRAW THE FINGERTIP CURSOR
// Draw mode: a solid dot in the brush colour ("the pen is touching paper").
// Hover/idle mode: an empty ring ("the pen is lifted").
// ---------------------------------------------------------------
function drawCursor(point, mode) {
  const radius = brushSize / 2 + 6;

  overlayContext.beginPath();
  overlayContext.arc(point.x, point.y, radius, 0, Math.PI * 2);

  if (mode === "draw") {
    overlayContext.fillStyle = brushColour;
    overlayContext.fill();
  } else {
    overlayContext.fillStyle = "rgba(255, 255, 255, 0.35)";
    overlayContext.fill();
  }

  // White outline in every mode, so the cursor is visible on any background
  overlayContext.lineWidth = 3;
  overlayContext.strokeStyle = "white";
  overlayContext.stroke();
}

// ---------------------------------------------------------------
// 17. THE MAIN LOOP: runs once for every screen refresh
// NEW CONCEPT — requestAnimationFrame: tells the browser "run this function
// just before you next repaint the screen" (usually 60 times a second).
// Calling it again at the end creates a smooth loop that pauses
// automatically when the tab is hidden, saving battery.
// ---------------------------------------------------------------
function processEveryFrame() {
  // Only analyse the video when it has a NEW frame (no wasted work)
  if (webcamVideo.currentTime !== lastVideoTime) {
    lastVideoTime = webcamVideo.currentTime;

    const detectionResults = handLandmarker.detectForVideo(webcamVideo, performance.now());

    // Wipe ONLY the overlay. The paint canvas keeps your drawing.
    overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (detectionResults.landmarks.length > 0) {
      const handLandmarks = detectionResults.landmarks[0]; // the first (only) hand

      updateMode(detectGesture(handLandmarks));

      const fingertip = smoothPoint(toCanvasPoint(handLandmarks[8])); // 8 = index tip

      if (currentMode === "draw") paintStroke(fingertip);

      drawHandSkeleton(handLandmarks);
      drawCursor(fingertip, currentMode);
    } else {
      // No hand: lift the pen and forget the smoothing history
      updateMode("none");
      previousDrawPoint = null;
      smoothedFingertip = null;
    }
  }

  requestAnimationFrame(processEveryFrame); // schedule the next frame → a loop
}

// ---------------------------------------------------------------
// 18. BUTTONS
// addEventListener("click", ...) means "when this is clicked, run this".
// try/catch lets us show a friendly message if anything goes wrong
// (e.g. you block the camera) instead of failing silently.
// ---------------------------------------------------------------
startButton.addEventListener("click", async () => {
  startButton.disabled = true; // stop double-clicks while things load

  try {
    await loadHandTracker();
    await startWebcam();
    stage.classList.add("camera-on"); // style.css fades out the waiting screen
    setStatus("Live", "is-live");
    currentMode = "none";
    showModeInPanel("none");
    processEveryFrame();               // start the loop
  } catch (error) {
    console.error(error);              // full details go to the browser console (F12)
    setStatus("Something went wrong: check camera permission", null);
    startButton.disabled = false;      // let you try again
  }
});

// Clear only the paint canvas: your drawing disappears, the camera stays on
clearButton.addEventListener("click", () => {
  paintContext.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
});
