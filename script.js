/*
  script.js — HOW THE PAGE BEHAVES
  Stage 1 responsibilities:
    1. Turn on the webcam when you click "Start Camera".
    2. Load Google's MediaPipe Hand Landmarker (the hand-tracking AI).
    3. Every frame, find your hand and draw its 21 points + connecting lines
       on the canvas, on top of the video.
*/

// ---------------------------------------------------------------
// 1. IMPORT MEDIAPIPE FROM A CDN
// NEW CONCEPT — CDN: a "Content Delivery Network" is a website that hosts
// code libraries. Instead of installing MediaPipe on your computer, we
// "import" it straight from the internet. That's why you need to be online.
//   - FilesetResolver: loads the low-level files MediaPipe needs to run.
//   - HandLandmarker: the actual hand-tracking tool.
// ---------------------------------------------------------------
import {
  FilesetResolver,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// ---------------------------------------------------------------
// 2. GRAB THE HTML ELEMENTS WE NEED
// document.getElementById finds an element in index.html by its id,
// so JavaScript can control it (e.g. change text, draw on it).
// ---------------------------------------------------------------
const startButton = document.getElementById("startButton");
const statusMessage = document.getElementById("statusMessage");
const webcamVideo = document.getElementById("webcamVideo");
const landmarkCanvas = document.getElementById("landmarkCanvas");

// NEW CONCEPT — canvas: a <canvas> is a blank drawing surface. To draw on
// it, we ask for its "2D context" — a set of drawing tools (pen, fill,
// circles, lines). Everything we draw goes through this context object.
const drawingContext = landmarkCanvas.getContext("2d");

// ---------------------------------------------------------------
// 3. READ OUR COLOURS FROM style.css
// WHY: we want ONE place to change colours (the CSS variables). This reads
// those values so the canvas uses the same palette as the rest of the page.
// ---------------------------------------------------------------
const pageStyles = getComputedStyle(document.documentElement);

// A tiny helper so we don't repeat the same long line six times.
// It takes a variable name like "--moss" and returns its colour, like "#54601B".
function readColour(variableName) {
  return pageStyles.getPropertyValue(variableName).trim();
}

// Give every finger its own palette colour, so your hand looks like a little rainbow.
const fingerColours = {
  wrist: readColour("--moss"),
  thumb: readColour("--hibiscus"),
  index: readColour("--tangerine"),
  middle: readColour("--lemon"),
  ring: readColour("--pear"),
  pinky: readColour("--rose-petal"),
};

// ---------------------------------------------------------------
// 4. VARIABLES THAT REMEMBER THINGS BETWEEN FRAMES
// "let" (not "const") because these values change later.
// ---------------------------------------------------------------
let handLandmarker = null;     // will hold the hand tracker once it has loaded
let lastVideoTime = -1;        // helps us skip frames we've already processed

// NEW CONCEPT — landmarks: MediaPipe describes a hand as 21 numbered points
// called "landmarks" (0 = wrist, 4 = thumb tip, 8 = index tip, 12 = middle
// tip, 16 = ring tip, 20 = pinky tip). Each point has an x and y between
// 0 and 1, measured as a fraction of the video's width and height.
const FINGERTIP_INDEXES = [4, 8, 12, 16, 20];

// HAND_CONNECTIONS is a list of pairs like {start: 0, end: 1}, meaning
// "draw a line from point 0 to point 1". Together they form the hand's skeleton.
const handConnections = HandLandmarker.HAND_CONNECTIONS;

// ---------------------------------------------------------------
// 5. LOAD THE HAND TRACKER
// NEW CONCEPT — async / await: some tasks take time (downloading a model,
// asking for the camera). "async" marks a function that can wait, and
// "await" means "pause here until this finishes, then continue" — without
// freezing the whole page while we wait.
// ---------------------------------------------------------------
async function loadHandTracker() {
  statusMessage.textContent = "Loading hand tracker… (first time can take a few seconds)";

  // Load MediaPipe's engine files (written in WebAssembly, a fast format browsers can run)
  const visionFiles = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  // Create the hand tracker with our settings
  handLandmarker = await HandLandmarker.createFromOptions(visionFiles, {
    baseOptions: {
      // The trained AI "model" file that knows what hands look like
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU", // use the graphics card if possible — it's faster
    },
    runningMode: "VIDEO", // we're tracking a moving video, not a single photo
    numHands: 1,          // only track one hand: simpler, and faster
  });
}

// ---------------------------------------------------------------
// 6. TURN ON THE WEBCAM
// navigator.mediaDevices.getUserMedia asks the browser for camera access.
// The browser shows a permission pop-up; if you allow it, we get a "stream"
// (live video) and plug it into the <video> element.
// ---------------------------------------------------------------
async function startWebcam() {
  statusMessage.textContent = "Asking for camera permission…";

  const cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 }, // a modest size keeps tracking fast
    audio: false,
  });

  webcamVideo.srcObject = cameraStream;

  // Wait until the video has actual frames, so we know its real size.
  // WHY: before this, videoWidth and videoHeight are 0.
  await new Promise((resolve) => {
    webcamVideo.onloadeddata = resolve;
  });

  // Make the canvas's drawing area exactly match the video's size,
  // so point (x, y) on the canvas lines up with point (x, y) on the video.
  landmarkCanvas.width = webcamVideo.videoWidth;
  landmarkCanvas.height = webcamVideo.videoHeight;
}

// ---------------------------------------------------------------
// 7. CONVERT A LANDMARK INTO CANVAS PIXELS
// Landmarks are fractions (0 to 1). We multiply by the canvas size to get
// pixels. We also flip x with (1 - x) because our video is mirrored in CSS —
// without this, the dots would appear on the opposite side to your hand.
// ---------------------------------------------------------------
function toCanvasPoint(landmark) {
  return {
    x: (1 - landmark.x) * landmarkCanvas.width,
    y: landmark.y * landmarkCanvas.height,
  };
}

// ---------------------------------------------------------------
// 8. WHICH FINGER DOES A POINT BELONG TO?
// The 21 landmarks are numbered in order along each finger:
//   0 = wrist, 1–4 = thumb, 5–8 = index, 9–12 = middle, 13–16 = ring, 17–20 = pinky.
// So we can work out the finger just by checking which range the number is in.
// ---------------------------------------------------------------
function colourForPoint(pointNumber) {
  if (pointNumber === 0) return fingerColours.wrist;
  if (pointNumber <= 4) return fingerColours.thumb;
  if (pointNumber <= 8) return fingerColours.index;
  if (pointNumber <= 12) return fingerColours.middle;
  if (pointNumber <= 16) return fingerColours.ring;
  return fingerColours.pinky;
}

// ---------------------------------------------------------------
// 9. DRAW ONE HAND (lines first, then dots on top)
// ---------------------------------------------------------------
function drawHand(handLandmarks) {
  // --- Draw the skeleton lines ---
  drawingContext.lineWidth = 5;      // pen thickness in pixels
  drawingContext.lineCap = "round";  // rounded line ends look softer than square ones

  // shadowBlur + shadowColor add a soft white glow around everything we draw next.
  // WHY: it makes the colours readable on top of any background in your webcam.
  drawingContext.shadowColor = "rgba(255, 255, 255, 0.9)";
  drawingContext.shadowBlur = 10;

  for (const connection of handConnections) {
    const startPoint = toCanvasPoint(handLandmarks[connection.start]);
    const endPoint = toCanvasPoint(handLandmarks[connection.end]);

    // Colour each line by the finger its END point belongs to
    drawingContext.strokeStyle = colourForPoint(connection.end);

    // beginPath = start a new shape; moveTo = put the pen down;
    // lineTo = drag the pen to here; stroke = actually draw it.
    drawingContext.beginPath();
    drawingContext.moveTo(startPoint.x, startPoint.y);
    drawingContext.lineTo(endPoint.x, endPoint.y);
    drawingContext.stroke();
  }

  // --- Draw a dot on each of the 21 points ---
  // forEach gives us each landmark AND its number (pointNumber, 0 to 20)
  handLandmarks.forEach((landmark, pointNumber) => {
    const point = toCanvasPoint(landmark);
    const isFingertip = FINGERTIP_INDEXES.includes(pointNumber);

    // Fingertips are bigger so they stand out (we'll need them later!)
    const dotRadius = isFingertip ? 9 : 5;

    // arc draws a circle: (centre x, centre y, radius, start angle, end angle).
    // Math.PI * 2 is a full circle in "radians" (the unit canvas uses for angles).
    drawingContext.beginPath();
    drawingContext.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
    drawingContext.fillStyle = colourForPoint(pointNumber);
    drawingContext.fill();

    // A thin white ring around each dot, like a sticker outline: cute and clear
    drawingContext.lineWidth = 2;
    drawingContext.strokeStyle = "white";
    drawingContext.stroke();
  });

  // Reset the line width for next time (we changed it for the white rings)
  drawingContext.lineWidth = 5;
}

// ---------------------------------------------------------------
// 10. THE MAIN LOOP — runs once for every screen refresh
// NEW CONCEPT — requestAnimationFrame: tells the browser "run this function
// just before you next repaint the screen" (usually 60 times a second).
// By calling it again at the end of the function, we create a smooth loop
// that pauses automatically when the tab is hidden, saving battery.
// ---------------------------------------------------------------
function processEveryFrame() {
  // Only analyse the video if it has moved on to a new frame.
  // WHY: the screen may refresh faster than the webcam delivers frames,
  // and analysing the same frame twice wastes effort.
  if (webcamVideo.currentTime !== lastVideoTime) {
    lastVideoTime = webcamVideo.currentTime;

    // Ask MediaPipe to find hands in the current video frame.
    // performance.now() is the current time in milliseconds — MediaPipe
    // uses it to track movement smoothly from frame to frame.
    const detectionResults = handLandmarker.detectForVideo(webcamVideo, performance.now());

    // Wipe the canvas clean, otherwise old dots would pile up into a smear
    drawingContext.clearRect(0, 0, landmarkCanvas.width, landmarkCanvas.height);

    // detectionResults.landmarks is a list of hands (empty if no hand is seen)
    if (detectionResults.landmarks.length > 0) {
      drawHand(detectionResults.landmarks[0]); // [0] = the first (only) hand
      statusMessage.textContent = "Hand found! 🖐️ Try moving it around.";
    } else {
      statusMessage.textContent = "Show your hand to the camera 👋";
    }
  }

  // Schedule this same function again for the next frame → a loop
  requestAnimationFrame(processEveryFrame);
}

// ---------------------------------------------------------------
// 11. WHAT HAPPENS WHEN YOU CLICK "START CAMERA"
// addEventListener("click", ...) means "when this button is clicked,
// run this function". try/catch lets us show a friendly message if
// anything goes wrong (e.g. you block the camera) instead of failing silently.
// ---------------------------------------------------------------
startButton.addEventListener("click", async () => {
  startButton.disabled = true; // stop double-clicks while things load

  try {
    await loadHandTracker();
    await startWebcam();

    // Adding the class "camera-on" makes style.css fade out the waiting screen
    document.getElementById("stage").classList.add("camera-on");
    statusMessage.textContent = "Show your hand to the camera 👋";
    processEveryFrame(); // start the loop
  } catch (error) {
    console.error(error); // full details go to the browser console (F12)
    statusMessage.textContent =
      "Oops, something went wrong: " + error.message + " — check camera permission and your internet.";
    startButton.disabled = false; // let you try again
  }
});
