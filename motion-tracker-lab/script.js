/* ============================================================
   Motion Tracker Lab — Main Script
   ============================================================ */

'use strict';

// ============================================================
// APPLICATION STATE
// ============================================================
const App = {
  // DOM refs (populated in init)
  videoEl:   null,
  canvasEl:  null,
  ctx:       null,

  // Video state
  videoLoaded:  false,
  fps:          30,
  isPlaying:    false,
  rafId:        null,
  isSampleMode: false,

  // Interaction mode
  // 'idle' | 'scale1' | 'scale2' | 'origin' | 'axes' | 'tracking'
  mode: 'idle',

  // Calibration
  cal: {
    scale: {
      p1: null, p2: null,
      realDist: null, unit: 'm',
      pixelsPerUnit: null,
      done: false
    },
    origin: { point: null, done: false },
    axes:   { point: null, angle: 0, coordMode: 'physics', done: false }
  },

  // Tracking
  points:        [],   // [{frame,time,px,py,rx,ry}, ...]
  velocities:    [],   // [{vx,vy}, ...] — parallel to points
  accelerations: [],   // [{ax,ay}, ...] — parallel to points
  autoAdvance:   true,

  // Overlay visibility
  showOverlay: true,

  // Axis drag state
  dragging:   null,   // null | 'x-axis' | 'y-axis'
  _dragMoved: false,  // suppress click after a drag

  // Chart
  chart:        null,
  currentGraph: 'x-t',
  currentFit:   'none'
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  App.videoEl  = document.getElementById('video-el');
  App.canvasEl = document.getElementById('overlay-canvas');
  App.ctx      = App.canvasEl.getContext('2d');

  setupVideoEvents();
  setupCanvasEvents();
  setupControlEvents();
  setupCalibrationEvents();
  setupTrackingEvents();
  setupResultEvents();
  setupInfoModals();

  updateWorkflow();
  setStatus('Upload a video or load sample video to begin.');
});

// ============================================================
// VIDEO — UPLOAD & LOAD
// ============================================================
function setupVideoEvents() {
  const input      = document.getElementById('video-input');
  const uploadArea = document.getElementById('upload-area');

  // File picker
  input.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) loadVideoFile(file);
  });

  // Drag and drop
  uploadArea.addEventListener('dragover', e => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragenter', e => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', e => {
    // Only remove when leaving the upload area itself, not a child element
    if (!uploadArea.contains(e.relatedTarget)) {
      uploadArea.classList.remove('drag-over');
    }
  });
  uploadArea.addEventListener('drop', e => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/') && !file.name.match(/\.(mp4|mov|webm)$/i)) {
      showModal('Unsupported File', 'Please drop a video file (.mp4, .mov, or .webm).');
      return;
    }
    loadVideoFile(file);
  });

  function loadVideoFile(file) {
    const url = URL.createObjectURL(file);
    App.videoEl.src = url;
    App.videoEl.load();
  }

  App.videoEl.addEventListener('loadedmetadata', onVideoMetadata);
  App.videoEl.addEventListener('seeked',         drawCanvas);
  App.videoEl.addEventListener('play',  () => { App.isPlaying = true;  updatePlayBtn(); startRaf(); });
  App.videoEl.addEventListener('pause', () => { App.isPlaying = false; updatePlayBtn(); stopRaf(); drawCanvas(); });
  App.videoEl.addEventListener('ended', () => { App.isPlaying = false; updatePlayBtn(); stopRaf(); drawCanvas(); });
  App.videoEl.addEventListener('timeupdate', updateTimeDisplay);
  App.videoEl.addEventListener('error', () => {
    // Ignore errors when no real video is loaded (e.g. empty src after reset or sample mode)
    if (!App.videoEl.src || App.videoEl.src === window.location.href || App.isSampleMode) return;
    showModal('Video Error',
      'This video could not be loaded. Please check the format. ' +
      'Supported formats: MP4, WebM, and MOV. If a MOV file fails, try re-exporting it from your camera app.');
  });
}

function onVideoMetadata() {
  App.videoLoaded = true;
  sizeCanvas();

  document.getElementById('upload-area').classList.add('hidden');
  document.getElementById('video-container').classList.remove('hidden');
  document.getElementById('video-controls').classList.remove('hidden');

  const dur = App.videoEl.duration;
  document.getElementById('scrubber').max = isFinite(dur) ? Math.round(dur * 1000) : 100000;

  App.isSampleMode = false;
  updateWorkflow();
  updateTimeDisplay();
  drawCanvas();
  setStatus('Video loaded. Proceed with calibration using the right panel.');
}

function sizeCanvas() {
  const video  = App.videoEl;
  const container = document.getElementById('video-container');
  const maxW   = container.parentElement.clientWidth || 800;
  const maxH   = 460;
  const vw     = video.videoWidth  || 800;
  const vh     = video.videoHeight || 450;
  const ratio  = vw / vh;

  let w = vw, h = vh;
  if (w > maxW)      { w = maxW;  h = w / ratio; }
  if (h > maxH)      { h = maxH;  w = h * ratio; }

  // Set canvas internal resolution to natural video size for accuracy
  App.canvasEl.width  = vw;
  App.canvasEl.height = vh;
  // Scale canvas display to fit container
  App.canvasEl.style.width  = w + 'px';
  App.canvasEl.style.height = h + 'px';
  // Match video display
  video.style.width  = w + 'px';
  video.style.height = h + 'px';
  container.style.width  = w + 'px';
  container.style.height = h + 'px';
}

// ============================================================
// VIDEO — CONTROLS
// ============================================================
function setupControlEvents() {
  document.getElementById('btn-play-pause').addEventListener('click', togglePlay);
  document.getElementById('btn-prev-frame').addEventListener('click', () => stepFrame(-1));
  document.getElementById('btn-next-frame').addEventListener('click', () => stepFrame(+1));
  document.getElementById('btn-reset-video').addEventListener('click', resetToStart);
  document.getElementById('btn-toggle-overlay').addEventListener('click', toggleOverlay);

  const scrubber = document.getElementById('scrubber');
  scrubber.addEventListener('input', () => {
    if (!App.videoLoaded || App.isSampleMode) return;
    App.videoEl.currentTime = scrubber.value / 1000;
  });

  const fpsSel = document.getElementById('fps-select');
  const fpsCustom = document.getElementById('fps-custom');
  fpsSel.addEventListener('change', () => {
    if (fpsSel.value === 'custom') {
      fpsCustom.classList.remove('hidden');
      App.fps = parseFloat(fpsCustom.value) || 30;
    } else {
      fpsCustom.classList.add('hidden');
      App.fps = parseFloat(fpsSel.value);
    }
  });
  fpsCustom.addEventListener('change', () => {
    App.fps = Math.max(1, parseFloat(fpsCustom.value) || 30);
  });
}

function togglePlay() {
  if (!App.videoLoaded || App.isSampleMode) return;
  App.isPlaying ? App.videoEl.pause() : App.videoEl.play();
}

function stepFrame(dir) {
  if (!App.videoLoaded || App.isSampleMode) return;
  App.videoEl.pause();
  App.videoEl.currentTime = Math.max(0,
    Math.min(App.videoEl.duration, App.videoEl.currentTime + dir / App.fps));
}

function resetToStart() {
  if (!App.videoLoaded || App.isSampleMode) return;
  App.videoEl.pause();
  App.videoEl.currentTime = 0;
}

function updatePlayBtn() {
  document.getElementById('btn-play-pause').textContent = App.isPlaying ? '⏸' : '▶';
}

function updateTimeDisplay() {
  if (App.isSampleMode) return;
  const t = App.videoEl.currentTime || 0;
  const frame = Math.round(t * App.fps);
  document.getElementById('display-time').textContent  = t.toFixed(3) + ' s';
  document.getElementById('display-frame').textContent = 'Frame ' + frame;
  const dur = App.videoEl.duration;
  if (isFinite(dur) && dur > 0) {
    document.getElementById('scrubber').value = Math.round(t * 1000);
  }
}

// requestAnimationFrame loop for live redraw during playback
function startRaf() {
  if (App.rafId) return;
  function loop() {
    drawCanvas();
    updateTimeDisplay();
    App.rafId = requestAnimationFrame(loop);
  }
  App.rafId = requestAnimationFrame(loop);
}
function stopRaf() {
  if (App.rafId) { cancelAnimationFrame(App.rafId); App.rafId = null; }
}

// ============================================================
// CANVAS — CLICK & DRAG ROUTING
// ============================================================
function setupCanvasEvents() {
  // Click — suppressed if a drag just finished
  App.canvasEl.addEventListener('click', e => {
    if (App._dragMoved) { App._dragMoved = false; return; }
    const { x, y } = canvasCoordsFromEvent(e);
    routeClick(x, y);
  });

  // Pointerdown — start origin or axes drag when placed but not yet confirmed
  App.canvasEl.addEventListener('pointerdown', e => {
    if (App.mode !== 'idle') return;
    App.canvasEl.setPointerCapture(e.pointerId);
    const { x, y } = canvasCoordsFromEvent(e);
    App._dragMoved = false;
    if (App.cal.origin.point && !App.cal.origin.done) {
      tryStartOriginDrag(x, y);
      if (App.dragging) return;
    }
    if (App.cal.axes.point && !App.cal.axes.done) {
      tryStartAxisDrag(x, y);
    }
  });

  // Pointermove — update drag OR update hover cursor
  App.canvasEl.addEventListener('pointermove', e => {
    const { x, y } = canvasCoordsFromEvent(e);
    if (App.dragging) {
      App._dragMoved = true;
      if (App.dragging === 'origin') {
        App.cal.origin.point = { x, y };
      } else {
        updateAxisDrag(x, y);
        recalcAllRealCoords();
      }
      drawCanvas();
    } else {
      updateHoverCursor(x, y);
    }
  });

  // Pointerup / pointercancel / pointerleave — finish drag and refresh data
  const finishDrag = e => {
    if (!App.dragging) return;
    if (e && App.canvasEl.hasPointerCapture(e.pointerId)) {
      App.canvasEl.releasePointerCapture(e.pointerId);
    }
    const wasDragging = App.dragging;
    App.dragging = null;
    if (wasDragging === 'origin') {
      drawCanvas();
      setStatus('Origin moved. Drag to adjust, then click "Confirm Origin".');
    } else {
      recalcAllRealCoords();
      recalcDerived();
      updateDataTable();
      updateChart(App.currentGraph);
      drawCanvas();
      setStatus('Axes rotated. Tracked point coordinates have been updated.');
    }
  };
  App.canvasEl.addEventListener('pointerup',     finishDrag);
  App.canvasEl.addEventListener('pointercancel', finishDrag);
  App.canvasEl.addEventListener('pointerleave',  finishDrag);
}

// ---- Axis drag helpers ----

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function getAxisTips() {
  const { origin, axes } = App.cal;
  const ox = origin.point.x, oy = origin.point.y;
  const a = axes.angle, len = 70;
  const yAngle = axes.coordMode === 'physics' ? a - Math.PI / 2 : a + Math.PI / 2;
  return {
    ox, oy,
    xTipX: ox + len * Math.cos(a),      xTipY: oy + len * Math.sin(a),
    yTipX: ox + len * Math.cos(yAngle), yTipY: oy + len * Math.sin(yAngle)
  };
}

function tryStartOriginDrag(cx, cy) {
  const HIT = 20;
  const { x, y } = App.cal.origin.point;
  if (Math.hypot(cx - x, cy - y) < HIT) {
    App.dragging = 'origin';
    App.canvasEl.style.cursor = 'grabbing';
  }
}

function tryStartAxisDrag(cx, cy) {
  const HIT = 16; // canvas-pixel hit radius around each axis line
  const { ox, oy, xTipX, xTipY, yTipX, yTipY } = getAxisTips();
  if (distToSegment(cx, cy, ox, oy, xTipX, xTipY) < HIT) {
    App.dragging = 'x-axis';
    App.canvasEl.style.cursor = 'grabbing';
  } else if (distToSegment(cx, cy, ox, oy, yTipX, yTipY) < HIT) {
    App.dragging = 'y-axis';
    App.canvasEl.style.cursor = 'grabbing';
  }
}

function updateAxisDrag(cx, cy) {
  const { ox, oy } = getAxisTips();
  const dragAngle = Math.atan2(cy - oy, cx - ox);
  if (App.dragging === 'x-axis') {
    App.cal.axes.angle = dragAngle;
  } else {
    // Dragging +y — infer the +x angle from the perpendicular
    const offset = App.cal.axes.coordMode === 'physics' ? Math.PI / 2 : -Math.PI / 2;
    App.cal.axes.angle = dragAngle + offset;
  }
}

function recalcAllRealCoords() {
  App.points.forEach(pt => {
    const real = pixelToReal(pt.px, pt.py);
    if (real) { pt.rx = real.x; pt.ry = real.y; }
  });
}

function updateHoverCursor(cx, cy) {
  if (App.mode !== 'idle') { App.canvasEl.style.cursor = 'crosshair'; return; }

  // Origin grab
  if (App.cal.origin.point && !App.cal.origin.done) {
    const { x, y } = App.cal.origin.point;
    if (Math.hypot(cx - x, cy - y) < 20) {
      App.canvasEl.style.cursor = 'grab'; return;
    }
  }

  // Axes grab
  if (App.cal.axes.point && !App.cal.axes.done) {
    const { ox, oy, xTipX, xTipY, yTipX, yTipY } = getAxisTips();
    const HIT = 16;
    if (distToSegment(cx, cy, ox, oy, xTipX, xTipY) < HIT ||
        distToSegment(cx, cy, ox, oy, yTipX, yTipY) < HIT) {
      App.canvasEl.style.cursor = 'grab'; return;
    }
  }

  App.canvasEl.style.cursor = 'default';
}

function canvasCoordsFromEvent(e) {
  const rect   = App.canvasEl.getBoundingClientRect();
  const scaleX = App.canvasEl.width  / rect.width;
  const scaleY = App.canvasEl.height / rect.height;
  const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
  const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top)  * scaleY
  };
}

function routeClick(x, y) {
  switch (App.mode) {
    case 'scale1':    handleScale1(x, y); break;
    case 'scale2':    handleScale2(x, y); break;
    case 'origin':    handleOrigin(x, y); break;
    case 'axes':      handleAxes(x, y);   break;
    case 'tracking':  handleTrack(x, y);  break;
  }
}

function setMode(mode) {
  App.mode = mode;
  const cursor = (mode === 'idle') ? 'default' : 'crosshair';
  App.canvasEl.style.cursor = cursor;
  updateCanvasHint();
}

function updateCanvasHint() {
  const el = document.getElementById('canvas-hint');
  const msgs = {
    idle:     '',
    scale1:   'Click the FIRST reference point',
    scale2:   'Click the SECOND reference point',
    origin:   'Click to set the origin (0, 0)',
    axes:     'Click a point in the +x direction',
    tracking: 'Click the object position in this frame'
  };
  const msg = msgs[App.mode] || '';
  if (msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
    // Video panel is always at the top — scroll there so the hint is visible
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    el.classList.add('hidden');
  }
}

// ============================================================
// CALIBRATION EVENTS
// ============================================================
function setupCalibrationEvents() {
  document.getElementById('btn-set-scale').addEventListener('click', () => {
    if (!App.videoLoaded && !App.isSampleMode) {
      showModal('No Video', 'Please upload a video first.'); return;
    }
    if (App.cal.scale.done) { resetScale(); return; }
    App.cal.scale.p1 = null;
    App.cal.scale.p2 = null;
    document.getElementById('scale-input-row').classList.add('hidden');
    document.getElementById('scale-result').classList.add('hidden');
    setMode('scale1');
    setBadge('scale-status', 'active', 'Click pt 1');
    setStatus('Click the first reference point on the video.');
    drawCanvas();
  });

  document.getElementById('btn-confirm-scale').addEventListener('click', confirmScale);
  document.getElementById('btn-cancel-scale').addEventListener('click', () => {
    document.getElementById('scale-input-row').classList.add('hidden');
    App.cal.scale.p1 = null;
    App.cal.scale.p2 = null;
    setMode('idle');
    setBadge('scale-status', 'pending', 'Pending');
    setStatus('Scale calibration cancelled.');
    drawCanvas();
  });

  document.getElementById('btn-set-origin').addEventListener('click', () => {
    if (!App.videoLoaded && !App.isSampleMode) {
      showModal('No Video', 'Please upload a video first.'); return;
    }
    if (App.cal.origin.done) { resetOrigin(); return; }
    if (!App.cal.scale.done) {
      showModal('Calibrate Scale First', 'Please complete scale calibration before setting the origin.');
      return;
    }
    setMode('origin');
    setBadge('origin-status', 'active', 'Click origin');
    setStatus('Click the point that will be the coordinate origin (0, 0).');
    drawCanvas();
  });

  document.getElementById('btn-set-axes').addEventListener('click', () => {
    if (!App.videoLoaded && !App.isSampleMode) {
      showModal('No Video', 'Please upload a video first.'); return;
    }
    if (App.cal.axes.done) { resetAxes(); return; }
    if (!App.cal.origin.done) {
      showModal('Set Origin First', 'Please set the coordinate origin before defining the axes.');
      return;
    }
    App.cal.axes.coordMode = document.getElementById('coord-mode').value;
    setMode('axes');
    setBadge('axes-status', 'active', 'Click +x dir');
    setStatus('Click a point in the +x direction from the origin.');
    drawCanvas();
  });

  document.getElementById('btn-confirm-origin').addEventListener('click', confirmOrigin);
  document.getElementById('btn-confirm-axes').addEventListener('click', confirmAxes);

  document.getElementById('coord-mode').addEventListener('change', e => {
    App.cal.axes.coordMode = e.target.value;
    drawCanvas();
  });
}

function resetScale() {
  App.cal.scale = { p1:null, p2:null, realDist:null, unit:'m', pixelsPerUnit:null, done:false };
  document.getElementById('btn-set-scale').textContent = 'Set Scale';
  document.getElementById('scale-result').classList.add('hidden');
  document.getElementById('scale-input-row').classList.add('hidden');
  setBadge('scale-status', 'pending', 'Pending');
  setMode('idle');
  setStatus('Scale reset. Click "Set Scale" to recalibrate.');
  updateWorkflow();
  drawCanvas();
}

function resetOrigin() {
  App.cal.origin = { point:null, done:false };
  document.getElementById('btn-set-origin').textContent = 'Set Origin';
  document.getElementById('btn-confirm-origin').classList.add('hidden');
  setBadge('origin-status', 'pending', 'Pending');
  // Axes depend on origin — reset them too
  resetAxes(true);
  setMode('idle');
  setStatus('Origin reset. Click "Set Origin" to recalibrate.');
  updateWorkflow();
  updateTrackingHint();
  drawCanvas();
}

function resetAxes(silent = false) {
  const prevMode = App.cal.axes.coordMode || 'physics';
  App.cal.axes = { point:null, angle:0, coordMode:prevMode, done:false };
  document.getElementById('btn-set-axes').textContent = 'Set Axes';
  document.getElementById('btn-confirm-axes').classList.add('hidden');
  setBadge('axes-status', 'pending', 'Pending');
  if (!silent) {
    setMode('idle');
    setStatus('Axes reset. Click "Set Axes" to recalibrate.');
    updateWorkflow();
    updateTrackingHint();
    drawCanvas();
  }
}

function handleScale1(x, y) {
  App.cal.scale.p1 = { x, y };
  setMode('scale2');
  setBadge('scale-status', 'active', 'Click pt 2');
  setStatus('Click the second reference point on the video.');
  drawCanvas();
}

function handleScale2(x, y) {
  App.cal.scale.p2 = { x, y };
  setMode('idle');
  // Show distance input
  document.getElementById('scale-input-row').classList.remove('hidden');
  setStatus('Enter the real-world distance between the two selected points.');
  drawCanvas();
}

function confirmScale() {
  const dist = parseFloat(document.getElementById('scale-distance').value);
  const unit = document.getElementById('scale-unit').value;
  if (!dist || dist <= 0) {
    showModal('Invalid Distance', 'Please enter a positive real-world distance.');
    return;
  }
  const p1 = App.cal.scale.p1, p2 = App.cal.scale.p2;
  const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (pixelDist < 5) {
    showModal('Points Too Close', 'The two calibration points are too close. Please try again.');
    return;
  }

  // Convert distance to meters for storage
  const distM = toMeters(dist, unit);
  App.cal.scale.realDist      = distM;
  App.cal.scale.unit          = unit;
  App.cal.scale.pixelsPerUnit = pixelDist / distM; // pixels per meter
  App.cal.scale.done          = true;

  const label = (1 / App.cal.scale.pixelsPerUnit).toExponential(3);
  const resultEl = document.getElementById('scale-result');
  resultEl.textContent = `Scale set: 1 pixel = ${label} m   (${pixelDist.toFixed(1)} px = ${dist} ${unit})`;
  resultEl.classList.remove('hidden');
  document.getElementById('scale-input-row').classList.add('hidden');

  document.getElementById('btn-set-scale').textContent = 'Reset Scale';
  setBadge('scale-status', 'done', 'Done ✓');
  setStatus(`Scale calibration complete. 1 pixel ≈ ${label} m`);
  updateWorkflow();
  if (App.points.length) { recalcAllRealCoords(); recalcDerived(); updateDataTable(); updateChart(App.currentGraph); }
  drawCanvas();
}

function handleOrigin(x, y) {
  App.cal.origin.point = { x, y };
  // origin.done stays false until user clicks "Confirm Origin"
  setMode('idle');
  setBadge('origin-status', 'active', 'Drag to adjust');
  setStatus('Drag the origin marker to adjust, then click "Confirm Origin".');
  document.getElementById('btn-confirm-origin').classList.remove('hidden');
  updateWorkflow();
  drawCanvas();
}

function confirmOrigin() {
  App.cal.origin.done = true;
  document.getElementById('btn-confirm-origin').classList.add('hidden');
  document.getElementById('btn-set-origin').textContent = 'Reset Origin';
  setBadge('origin-status', 'done', 'Done ✓');
  setStatus('Origin confirmed. Now set the axes direction.');
  updateWorkflow();
  if (App.points.length) { recalcAllRealCoords(); recalcDerived(); updateDataTable(); updateChart(App.currentGraph); }
  drawCanvas();
}

function handleAxes(x, y) {
  const o = App.cal.origin.point;
  App.cal.axes.point = { x, y };
  App.cal.axes.angle = Math.atan2(y - o.y, x - o.x);
  // axes.done stays false until the user clicks "Confirm Axes"
  setMode('idle');
  setBadge('axes-status', 'active', 'Drag to adjust');
  setStatus('Drag the axes arrows to adjust direction, then click "Confirm Axes".');
  document.getElementById('btn-confirm-axes').classList.remove('hidden');
  updateWorkflow();
  drawCanvas();
}

function confirmAxes() {
  App.cal.axes.done = true;
  document.getElementById('btn-confirm-axes').classList.add('hidden');
  document.getElementById('btn-set-axes').textContent = 'Reset Axes';
  const deg = (App.cal.axes.angle * 180 / Math.PI).toFixed(1);
  setBadge('axes-status', 'done', 'Done ✓');
  setStatus(`Axes confirmed. +x at ${deg}° from screen horizontal. Ready to track!`);
  updateWorkflow();
  updateTrackingHint();
  if (App.points.length) { recalcAllRealCoords(); recalcDerived(); updateDataTable(); updateChart(App.currentGraph); }
  drawCanvas();
}

// ============================================================
// TRACKING
// ============================================================
function setupTrackingEvents() {
  document.getElementById('btn-start-tracking').addEventListener('click', () => {
    if (!App.videoLoaded && !App.isSampleMode) {
      showModal('No Video', 'Please upload a video first.'); return;
    }
    if (!App.cal.scale.done) {
      showModal('Calibration Incomplete', 'Please complete scale calibration before tracking.'); return;
    }
    if (!App.cal.origin.done) {
      showModal('Calibration Incomplete', 'Please set the origin before tracking.'); return;
    }
    if (!App.cal.axes.done) {
      showModal('Calibration Incomplete', 'Please set the axes before tracking.'); return;
    }
    setMode('tracking');
    setStatus('Tracking mode active. Click the object position in each frame.');
    updateWorkflow();
  });

  document.getElementById('btn-undo').addEventListener('click', undoLastPoint);
  document.getElementById('btn-clear-points').addEventListener('click', clearAllPoints);

  document.getElementById('auto-advance').addEventListener('change', e => {
    App.autoAdvance = e.target.checked;
  });
}

function handleTrack(x, y) {
  if (!App.isSampleMode && !App.videoLoaded) return;

  const frame = App.isSampleMode ? App.points.length
                                 : Math.round(App.videoEl.currentTime * App.fps);
  const time  = App.isSampleMode ? App.points.length / App.fps
                                 : App.videoEl.currentTime;

  const real = pixelToReal(x, y);
  if (!real) {
    showModal('Calibration Required', 'Please complete calibration before tracking.');
    return;
  }

  App.points.push({ frame, time, px: x, py: y, rx: real.x, ry: real.y });
  recalcDerived();
  updateDataTable();
  updateChart(App.currentGraph);
  updateWorkflow();

  const n = App.points.length;
  document.getElementById('point-count').textContent = `${n} point${n !== 1 ? 's' : ''} tracked`;
  setStatus(`Point ${n} added at (${real.x.toFixed(3)} m, ${real.y.toFixed(3)} m)`);
  drawCanvas();

  if (App.autoAdvance && !App.isSampleMode) stepFrame(+1);
}

function undoLastPoint() {
  if (!App.points.length) return;
  App.points.pop();
  recalcDerived();
  updateDataTable();
  updateChart(App.currentGraph);
  const n = App.points.length;
  document.getElementById('point-count').textContent = `${n} point${n !== 1 ? 's' : ''} tracked`;
  setStatus('Last point removed.');
  drawCanvas();
}

function clearAllPoints() {
  if (!App.points.length) return;
  if (!confirm('Clear all tracked points?')) return;
  App.points        = [];
  App.velocities    = [];
  App.accelerations = [];
  updateDataTable();
  updateChart(App.currentGraph);
  document.getElementById('point-count').textContent = '0 points tracked';
  setStatus('All tracked points cleared.');
  drawCanvas();
}

// ============================================================
// COORDINATE MATH
// ============================================================
function toMeters(val, unit) {
  if (unit === 'cm') return val / 100;
  if (unit === 'mm') return val / 1000;
  return val; // already meters
}

function pixelToReal(px, py) {
  const cal = App.cal;
  if (!cal.scale.done || !cal.origin.done) return null;

  const ox = cal.origin.point.x;
  const oy = cal.origin.point.y;
  let dx = px - ox;
  let dy = py - oy;

  if (cal.axes.done) {
    const a    = cal.axes.angle;
    const cosA = Math.cos(a);
    const sinA = Math.sin(a);
    // Rotate coordinate system by -a to align +x with user's chosen direction
    const rx = dx * cosA + dy * sinA;
    const ry = -dx * sinA + dy * cosA;
    dx = rx;
    dy = ry;
  }

  const x = dx / cal.scale.pixelsPerUnit;
  let   y = dy / cal.scale.pixelsPerUnit;

  // Flip y for physics coordinates (screen y increases downward)
  if (cal.axes.coordMode === 'physics') y = -y;

  return { x, y };
}

// ============================================================
// DERIVED VALUES — VELOCITY & ACCELERATION
// ============================================================
function recalcDerived() {
  App.velocities    = calcVelocities(App.points);
  App.accelerations = calcAccelerations(App.points, App.velocities);
}

function calcVelocities(pts) {
  const n   = pts.length;
  const vel = Array.from({ length: n }, () => ({ vx: null, vy: null }));
  if (n < 2) return vel;

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      // Forward difference
      const dt = pts[1].time - pts[0].time;
      if (dt > 0) {
        vel[0].vx = (pts[1].rx - pts[0].rx) / dt;
        vel[0].vy = (pts[1].ry - pts[0].ry) / dt;
      }
    } else if (i === n - 1) {
      // Backward difference
      const dt = pts[n-1].time - pts[n-2].time;
      if (dt > 0) {
        vel[n-1].vx = (pts[n-1].rx - pts[n-2].rx) / dt;
        vel[n-1].vy = (pts[n-1].ry - pts[n-2].ry) / dt;
      }
    } else {
      // Central difference
      const dt = pts[i+1].time - pts[i-1].time;
      if (dt > 0) {
        vel[i].vx = (pts[i+1].rx - pts[i-1].rx) / dt;
        vel[i].vy = (pts[i+1].ry - pts[i-1].ry) / dt;
      }
    }
  }
  return vel;
}

function calcAccelerations(pts, vel) {
  const n   = pts.length;
  const acc = Array.from({ length: n }, () => ({ ax: null, ay: null }));
  if (n < 3) return acc;

  for (let i = 0; i < n; i++) {
    if (vel[i].vx === null) continue;
    if (i === 0) {
      if (vel[1].vx !== null) {
        const dt = pts[1].time - pts[0].time;
        if (dt > 0) { acc[0].ax = (vel[1].vx - vel[0].vx) / dt; acc[0].ay = (vel[1].vy - vel[0].vy) / dt; }
      }
    } else if (i === n - 1) {
      if (vel[n-2].vx !== null) {
        const dt = pts[n-1].time - pts[n-2].time;
        if (dt > 0) { acc[n-1].ax = (vel[n-1].vx - vel[n-2].vx) / dt; acc[n-1].ay = (vel[n-1].vy - vel[n-2].vy) / dt; }
      }
    } else {
      if (vel[i-1].vx !== null && vel[i+1].vx !== null) {
        const dt = pts[i+1].time - pts[i-1].time;
        if (dt > 0) { acc[i].ax = (vel[i+1].vx - vel[i-1].vx) / dt; acc[i].ay = (vel[i+1].vy - vel[i-1].vy) / dt; }
      }
    }
  }
  return acc;
}

// ============================================================
// DATA TABLE
// ============================================================
function updateDataTable() {
  const tbody   = document.getElementById('table-body');
  const emptyRow = document.getElementById('empty-row');
  const pts     = App.points;
  const vel     = App.velocities;

  // Remove all non-empty rows
  Array.from(tbody.querySelectorAll('tr:not(#empty-row)')).forEach(r => r.remove());

  if (!pts.length) {
    emptyRow.classList.remove('hidden');
    return;
  }
  emptyRow.classList.add('hidden');

  const unit = App.cal.scale.unit || 'm';
  const posUnit = 'm'; // always meters stored
  document.getElementById('th-rx').textContent = `x (${posUnit})`;
  document.getElementById('th-ry').textContent = `y (${posUnit})`;
  document.getElementById('th-vx').textContent = `vx (${posUnit}/s)`;
  document.getElementById('th-vy').textContent = `vy (${posUnit}/s)`;

  pts.forEach((pt, i) => {
    const v  = vel[i] || { vx: null, vy: null };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${pt.frame}</td>
      <td>${pt.time.toFixed(4)}</td>
      <td>${pt.px.toFixed(1)}</td>
      <td>${pt.py.toFixed(1)}</td>
      <td>${pt.rx.toFixed(4)}</td>
      <td>${pt.ry.toFixed(4)}</td>
      <td>${v.vx !== null ? v.vx.toFixed(4) : '—'}</td>
      <td>${v.vy !== null ? v.vy.toFixed(4) : '—'}</td>
      <td><button class="del-btn" data-idx="${i}" title="Delete row">✕</button></td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.idx);
      App.points.splice(idx, 1);
      recalcDerived();
      updateDataTable();
      updateChart(App.currentGraph);
      const n = App.points.length;
      document.getElementById('point-count').textContent = `${n} point${n !== 1 ? 's' : ''} tracked`;
      drawCanvas();
    });
  });

  updateWorkflow();
}

// ============================================================
// CANVAS DRAWING
// ============================================================
function drawCanvas() {
  const canvas = App.canvasEl;
  const ctx    = App.ctx;
  if (!ctx) return;

  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (App.isSampleMode) drawSampleBackground();

  if (App.showOverlay) {
    drawCalibration();
    drawTrajectory();
    drawTrackPoints();
  }
}

function toggleOverlay() {
  App.showOverlay = !App.showOverlay;
  const btn = document.getElementById('btn-toggle-overlay');
  if (App.showOverlay) {
    btn.className = 'btn-overlay-on';
    btn.innerHTML = '<span class="overlay-icon">👁</span> Hide Overlay';
  } else {
    btn.className = 'btn-overlay-off';
    btn.innerHTML = '<span class="overlay-icon">👁</span> Show Overlay';
  }
  drawCanvas();
}

function drawSampleBackground() {
  const ctx = App.ctx, W = App.canvasEl.width, H = App.canvasEl.height;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#E8F4FD');
  grad.addColorStop(1, '#F0F8FF');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(100,160,220,0.15)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y <= H; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.fillStyle = '#94A3B8';
  ctx.font = '14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Sample Mode — Simulated Projectile Motion', W/2, 22);
  ctx.textAlign = 'left';
}

function drawCalibration() {
  const cal = App.cal;
  const ctx = App.ctx;

  // Scale calibration line
  if (cal.scale.p1) {
    drawDot(cal.scale.p1.x, cal.scale.p1.y, '#F97316', 7);
    if (cal.scale.p2) {
      ctx.strokeStyle = '#F97316';
      ctx.lineWidth   = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cal.scale.p1.x, cal.scale.p1.y);
      ctx.lineTo(cal.scale.p2.x, cal.scale.p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawDot(cal.scale.p2.x, cal.scale.p2.y, '#F97316', 7);
      // Label
      const mx = (cal.scale.p1.x + cal.scale.p2.x) / 2;
      const my = (cal.scale.p1.y + cal.scale.p2.y) / 2;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui';
      const label = cal.scale.realDist ? cal.scale.realDist.toFixed(3) + ' m' : 'scale';
      const tw = ctx.measureText(label).width;
      ctx.fillRect(mx - tw/2 - 3, my - 10, tw + 6, 14);
      ctx.fillStyle = '#C2410C';
      ctx.textAlign = 'center';
      ctx.fillText(label, mx, my);
      ctx.textAlign = 'left';
    }
  }

  // Origin marker (draw while adjusting or after confirmation)
  if (cal.origin.point) {
    const ox = cal.origin.point.x, oy = cal.origin.point.y;
    drawCrosshair(ox, oy, '#06B6D4', 14);

    // Axes arrows (draw while adjusting or after confirmation)
    if (cal.axes.point) {
      const len  = 70;
      const a    = cal.axes.angle;
      const cosA = Math.cos(a), sinA = Math.sin(a);

      // +x axis (red)
      const xEx = ox + len * cosA, xEy = oy + len * sinA;
      drawArrow(ox, oy, xEx, xEy, '#EF4444', 2);
      labelAt(xEx + 8*cosA, xEy + 8*sinA, '+x', '#EF4444');

      // +y axis (green) — perpendicular, direction depends on coord mode
      const yAngle = (cal.axes.coordMode === 'physics')
        ? a - Math.PI / 2   // screen-up (negative y screen direction)
        : a + Math.PI / 2;  // screen-down
      const yEx = ox + len * Math.cos(yAngle), yEy = oy + len * Math.sin(yAngle);
      drawArrow(ox, oy, yEx, yEy, '#22C55E', 2);
      labelAt(yEx + 8*Math.cos(yAngle), yEy + 8*Math.sin(yAngle), '+y', '#22C55E');
    }
  }
}

function drawTrajectory() {
  const pts = App.points;
  if (pts.length < 2) return;
  const ctx = App.ctx;
  ctx.strokeStyle = 'rgba(59,130,246,0.55)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(pts[0].px, pts[0].py);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].px, pts[i].py);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTrackPoints() {
  const pts = App.points;
  if (!pts.length) return;
  const ctx = App.ctx;
  ctx.font = 'bold 10px system-ui';

  pts.forEach((pt, i) => {
    drawDot(pt.px, pt.py, '#2563EB', 5);
    // Label every point if ≤10, else only first/last/every 5th
    if (pts.length <= 10 || i === 0 || i === pts.length - 1 || i % 5 === 0) {
      ctx.fillStyle = '#1D4ED8';
      ctx.fillText(i+1, pt.px + 7, pt.py - 5);
    }
  });
}

// ---- Canvas helpers ----
function drawDot(x, y, color, r) {
  const ctx = App.ctx;
  ctx.fillStyle   = color;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawCrosshair(x, y, color, size) {
  const ctx = App.ctx;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size); ctx.lineTo(x, y + size);
  ctx.stroke();
  drawDot(x, y, color, 4);
}

function drawArrow(x1, y1, x2, y2, color, width) {
  const ctx = App.ctx;
  const hs = 8, ha = 0.4;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - hs*Math.cos(angle - ha), y2 - hs*Math.sin(angle - ha));
  ctx.lineTo(x2 - hs*Math.cos(angle + ha), y2 - hs*Math.sin(angle + ha));
  ctx.closePath();
  ctx.fill();
}

function labelAt(x, y, text, color) {
  const ctx = App.ctx;
  ctx.fillStyle = color;
  ctx.font      = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

// ============================================================
// GRAPH / CHART
// ============================================================
function setupResultEvents() {
  document.getElementById('graph-select').addEventListener('change', e => {
    App.currentGraph = e.target.value;
    updateChart(App.currentGraph);
  });
  document.getElementById('fit-select').addEventListener('change', e => {
    App.currentFit = e.target.value;
    updateChart(App.currentGraph);
  });
  document.getElementById('btn-export-graph').addEventListener('click', exportGraph);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('btn-copy-data').addEventListener('click', copyData);
  document.getElementById('btn-clear-table').addEventListener('click', clearAllPoints);
  document.getElementById('btn-reset-all').addEventListener('click', resetAll);
  document.getElementById('btn-load-sample').addEventListener('click', loadSampleVideo);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-ok').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
}

function updateChart(graphType) {
  if (App.chart) { App.chart.destroy(); App.chart = null; }
  document.getElementById('fit-panel').classList.add('hidden');

  const pts  = App.points;
  const vel  = App.velocities;
  const acc  = App.accelerations;

  if (!pts.length) {
    document.getElementById('fit-panel').classList.add('hidden');
    return;
  }

  let xData = [], yData = [], xLabel = '', yLabel = '';

  switch (graphType) {
    case 'x-t':
      xData  = pts.map(p => p.time); yData  = pts.map(p => p.rx);
      xLabel = 'Time (s)';           yLabel = 'x Position (m)';
      break;
    case 'y-t':
      xData  = pts.map(p => p.time); yData  = pts.map(p => p.ry);
      xLabel = 'Time (s)';           yLabel = 'y Position (m)';
      break;
    case 'y-x':
      xData  = pts.map(p => p.rx);   yData  = pts.map(p => p.ry);
      xLabel = 'x Position (m)';     yLabel = 'y Position (m)';
      break;
    case 'vx-t':
      xData  = pts.filter((_,i) => vel[i].vx !== null).map(p => p.time);
      yData  = vel.filter(v => v.vx !== null).map(v => v.vx);
      xLabel = 'Time (s)';           yLabel = 'vx (m/s)';
      break;
    case 'vy-t':
      xData  = pts.filter((_,i) => vel[i].vy !== null).map(p => p.time);
      yData  = vel.filter(v => v.vy !== null).map(v => v.vy);
      xLabel = 'Time (s)';           yLabel = 'vy (m/s)';
      break;
    case 'ax-t':
      xData  = pts.filter((_,i) => acc[i] && acc[i].ax !== null).map(p => p.time);
      yData  = acc.filter(a => a && a.ax !== null).map(a => a.ax);
      xLabel = 'Time (s)';           yLabel = 'ax (m/s²)';
      break;
    case 'ay-t':
      xData  = pts.filter((_,i) => acc[i] && acc[i].ay !== null).map(p => p.time);
      yData  = acc.filter(a => a && a.ay !== null).map(a => a.ay);
      xLabel = 'Time (s)';           yLabel = 'ay (m/s²)';
      break;
  }

  if (!xData.length) return;

  const scatterData = xData.map((x, i) => ({ x, y: yData[i] }));
  const datasets = [{
    label: yLabel,
    data:  scatterData,
    backgroundColor: 'rgba(37,99,235,0.7)',
    pointRadius: 5,
    pointHoverRadius: 7
  }];

  // Compute and add fit line
  const fitType = App.currentFit;
  let fitResult = null;
  if (fitType !== 'none' && xData.length >= 2) {
    if (fitType === 'linear' && xData.length >= 2) {
      fitResult = fitLinear(xData, yData);
    } else if (fitType === 'quadratic' && xData.length >= 3) {
      fitResult = fitQuadratic(xData, yData);
    } else if (fitType === 'quadratic') {
      showModal('Not Enough Points', 'At least 3 points are required for a quadratic fit.');
    }

    if (fitResult) {
      const minX = Math.min(...xData), maxX = Math.max(...xData);
      const steps = 80;
      const fitPts = [];
      for (let i = 0; i <= steps; i++) {
        const x = minX + (maxX - minX) * i / steps;
        const y = fitType === 'linear'
          ? fitResult.slope * x + fitResult.intercept
          : fitResult.a * x*x + fitResult.b * x + fitResult.c;
        fitPts.push({ x, y });
      }
      datasets.push({
        label: fitType === 'linear' ? 'Linear fit' : 'Quadratic fit',
        data:  fitPts,
        type:  'line',
        borderColor: '#EF4444',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0
      });
      showFitResult(fitType, fitResult, xLabel, yLabel, graphType);
    }
  }

  const ctx = document.getElementById('motion-chart').getContext('2d');
  App.chart = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: datasets.length > 1, position: 'top', labels: { font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: item => `(${item.parsed.x.toFixed(4)}, ${item.parsed.y.toFixed(4)})`
          }
        }
      },
      scales: {
        x: { title: { display: true, text: xLabel, font: { size: 12, weight: '600' } },
             ticks: { font: { size: 11 } } },
        y: { title: { display: true, text: yLabel, font: { size: 12, weight: '600' } },
             ticks: { font: { size: 11 } } }
      }
    }
  });

  updateWorkflow();
}

function showFitResult(type, result, xLabel, yLabel, graphType) {
  const panel = document.getElementById('fit-panel');
  let html = '';

  if (type === 'linear') {
    const m = result.slope.toExponential(4), b = result.intercept.toExponential(4);
    const sign = result.intercept >= 0 ? '+' : '';
    html = `<strong>Linear Fit:</strong> y = ${m} · x ${sign} ${b}<br>
            <span class="r2">R² = ${result.r2.toFixed(5)}</span>`;
    if (graphType === 'x-t')  html += `<br><span class="interp">x(t): linear → constant vx ≈ ${result.slope.toFixed(4)} m/s</span>`;
    if (graphType === 'vx-t') html += `<br><span class="interp">vx(t): linear → constant ax ≈ ${result.slope.toFixed(4)} m/s²</span>`;
    if (graphType === 'vy-t') html += `<br><span class="interp">vy(t): linear → constant ay ≈ ${result.slope.toFixed(4)} m/s² (g ≈ ${Math.abs(result.slope).toFixed(4)} m/s²)</span>`;
  } else {
    const a = result.a.toExponential(4), b = result.b.toExponential(4), c = result.c.toExponential(4);
    html = `<strong>Quadratic Fit:</strong> y = ${a}·x² + ${b}·x + ${c}<br>
            <span class="r2">R² = ${result.r2.toFixed(5)}</span>`;
    if (graphType === 'y-t') {
      const g = Math.abs(2 * result.a);
      html += `<br><span class="interp">y(t): parabolic → ay ≈ ${(2*result.a).toFixed(4)} m/s² (|g| ≈ ${g.toFixed(4)} m/s²)</span>`;
    }
    if (graphType === 'y-x') {
      html += `<br><span class="interp">y(x): parabolic trajectory consistent with projectile motion.</span>`;
    }
  }

  panel.innerHTML = html;
  panel.classList.remove('hidden');
}

// ============================================================
// FIT CALCULATIONS
// ============================================================
function fitLinear(xArr, yArr) {
  const n    = xArr.length;
  let sx=0, sy=0, sxx=0, sxy=0;
  for (let i = 0; i < n; i++) { sx += xArr[i]; sy += yArr[i]; sxx += xArr[i]**2; sxy += xArr[i]*yArr[i]; }
  const denom = n*sxx - sx*sx;
  if (Math.abs(denom) < 1e-14) return null;
  const slope     = (n*sxy - sx*sy) / denom;
  const intercept = (sy - slope*sx) / n;
  const yMean = sy/n;
  const ssTot = yArr.reduce((s,y) => s + (y-yMean)**2, 0);
  const ssRes = xArr.reduce((s,x,i) => s + (yArr[i] - (slope*x+intercept))**2, 0);
  const r2    = ssTot > 1e-14 ? 1 - ssRes/ssTot : 1;
  return { slope, intercept, r2 };
}

function fitQuadratic(xArr, yArr) {
  const n = xArr.length;
  if (n < 3) return null;
  let sx=0, sx2=0, sx3=0, sx4=0, sy=0, sxy=0, sx2y=0;
  for (let i = 0; i < n; i++) {
    const x = xArr[i], y = yArr[i];
    sx += x; sx2 += x**2; sx3 += x**3; sx4 += x**4;
    sy += y; sxy += x*y; sx2y += x**2*y;
  }
  const A = [[sx4,sx3,sx2],[sx3,sx2,sx],[sx2,sx,n]];
  const B = [sx2y, sxy, sy];
  const coeff = gaussElim3(A, B);
  if (!coeff) return null;
  const [a, b, c] = coeff;
  const yMean = sy/n;
  const ssTot = yArr.reduce((s,y) => s + (y-yMean)**2, 0);
  const ssRes = xArr.reduce((s,x,i) => s + (yArr[i] - (a*x**2 + b*x + c))**2, 0);
  const r2    = ssTot > 1e-14 ? 1 - ssRes/ssTot : 1;
  return { a, b, c, r2 };
}

function gaussElim3(A, B) {
  // Gaussian elimination with partial pivoting for 3×3 system
  const M = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < 3; col++) {
    let maxRow = col;
    for (let r = col+1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-14) return null;
    for (let r = col+1; r < 3; r++) {
      const f = M[r][col] / M[col][col];
      for (let k = col; k <= 3; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = M[i][3];
    for (let j = i+1; j < 3; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

// ============================================================
// EXPORT
// ============================================================
function exportCSV() {
  const pts = App.points;
  if (!pts.length) { showModal('No Data', 'Please track at least one point before exporting.'); return; }

  const rows = [['#','Frame','Time (s)','x pixel','y pixel','x (m)','y (m)','vx (m/s)','vy (m/s)','ax (m/s²)','ay (m/s²)']];
  pts.forEach((pt, i) => {
    const v = App.velocities[i]    || { vx:null, vy:null };
    const a = App.accelerations[i] || { ax:null, ay:null };
    rows.push([
      i+1, pt.frame, pt.time.toFixed(6),
      pt.px.toFixed(2), pt.py.toFixed(2),
      pt.rx.toFixed(6), pt.ry.toFixed(6),
      v.vx !== null ? v.vx.toFixed(6) : '',
      v.vy !== null ? v.vy.toFixed(6) : '',
      a.ax !== null ? a.ax.toFixed(6) : '',
      a.ay !== null ? a.ay.toFixed(6) : ''
    ]);
  });

  const csv  = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href     = URL.createObjectURL(blob);
  link.download = 'motion_tracker_data.csv';
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus('CSV exported successfully.');
  updateWorkflow();
}

function exportGraph() {
  if (!App.chart) { showModal('No Graph', 'No graph data to export. Track some points first.'); return; }
  const canvas = document.getElementById('motion-chart');
  const link   = document.createElement('a');
  link.download = 'motion_graph.png';
  link.href     = canvas.toDataURL('image/png');
  link.click();
  setStatus('Graph exported as PNG.');
}

function copyData() {
  const pts = App.points;
  if (!pts.length) { showModal('No Data', 'No data to copy.'); return; }

  const header = ['#','Frame','Time(s)','x_px','y_px','x(m)','y(m)','vx(m/s)','vy(m/s)'].join('\t');
  const rows   = pts.map((pt, i) => {
    const v = App.velocities[i] || { vx:null, vy:null };
    return [i+1, pt.frame, pt.time.toFixed(4), pt.px.toFixed(1), pt.py.toFixed(1),
            pt.rx.toFixed(4), pt.ry.toFixed(4),
            v.vx !== null ? v.vx.toFixed(4) : '',
            v.vy !== null ? v.vy.toFixed(4) : ''].join('\t');
  });

  navigator.clipboard.writeText([header, ...rows].join('\n'))
    .then(() => setStatus('Data copied to clipboard.'))
    .catch(() => showModal('Copy Failed', 'Could not access clipboard. Try exporting CSV instead.'));
}

// ============================================================
// SAMPLE VIDEO
// ============================================================
function loadSampleVideo() {
  if ((App.points.length || App.videoLoaded) && !confirm('This will replace the current video and tracked data. Continue?')) return;

  resetAll(true); // silent reset

  App.videoEl.src = 'motion-tracker-lab/projectile_motion.mp4';
  App.videoEl.load();
  setStatus('Loading sample video...');
}

// ============================================================
// RESET
// ============================================================
function resetAll(silent = false) {
  if (!silent && !confirm('Reset everything? This will clear all calibration and tracked data.')) return;

  stopRaf();
  App.videoLoaded   = false;
  App.isPlaying     = false;
  App.isSampleMode  = false;
  App.mode          = 'idle';
  App.points        = [];
  App.velocities    = [];
  App.accelerations = [];
  App.cal           = {
    scale:  { p1:null, p2:null, realDist:null, unit:'m', pixelsPerUnit:null, done:false },
    origin: { point:null, done:false },
    axes:   { point:null, angle:0, coordMode:'physics', done:false }
  };

  if (App.chart) { App.chart.destroy(); App.chart = null; }

  App.videoEl.pause();
  App.videoEl.src = '';
  App.videoEl.style.width  = '';
  App.videoEl.style.height = '';

  document.getElementById('upload-area').classList.remove('hidden');
  document.getElementById('video-container').classList.add('hidden');
  document.getElementById('video-controls').classList.add('hidden');
  document.getElementById('video-input').value = '';

  document.getElementById('canvas-hint').classList.add('hidden');
  document.getElementById('scale-input-row').classList.add('hidden');
  document.getElementById('scale-result').classList.add('hidden');
  document.getElementById('btn-confirm-origin').classList.add('hidden');
  document.getElementById('btn-confirm-axes').classList.add('hidden');
  document.getElementById('fit-panel').classList.add('hidden');

  setBadge('scale-status',  'pending', 'Pending');
  setBadge('origin-status', 'pending', 'Pending');
  setBadge('axes-status',   'pending', 'Pending');
  document.getElementById('btn-set-scale').textContent  = 'Set Scale';
  document.getElementById('btn-set-origin').textContent = 'Set Origin';
  document.getElementById('btn-set-axes').textContent   = 'Set Axes';

  document.getElementById('point-count').textContent = '0 points tracked';

  updateDataTable();
  updateWorkflow();

  if (!silent) setStatus('All data cleared. Upload a video to start a new experiment.');

  const ctx = App.ctx;
  if (ctx) ctx.clearRect(0, 0, App.canvasEl.width, App.canvasEl.height);
}

// ============================================================
// WORKFLOW STATUS
// ============================================================
function updateWorkflow() {
  const cal      = App.cal;
  const hasVideo = App.videoLoaded || App.isSampleMode;
  const hasPts   = App.points.length >= 2;
  const hasGraph = App.chart !== null;
  const hasExp   = false; // export can't be auto-detected

  setWf(1, hasVideo ? 'done' : 'pending');
  setWf(2, cal.scale.done  ? 'done' : hasVideo ? 'active' : 'pending');
  setWf(3, cal.origin.done ? 'done' : cal.scale.done ? 'active' : 'pending');
  setWf(4, cal.axes.done   ? 'done' : cal.origin.done ? 'active' : 'pending');
  setWf(5, hasPts          ? 'done' : cal.axes.done ? 'active' : 'pending');
  setWf(6, hasPts          ? 'done' : 'pending');
  setWf(7, hasGraph        ? 'done' : hasPts ? 'active' : 'pending');
  setWf(8, 'pending');
}

function setWf(n, state) {
  const el   = document.getElementById('wf-' + n);
  const icon = el.querySelector('.wf-icon');
  el.className = 'wf-item';
  if (state === 'done')   { el.classList.add('wf-done');   icon.textContent = '✓'; }
  if (state === 'active') { el.classList.add('wf-active'); icon.textContent = '→'; }
  if (state === 'pending'){ icon.textContent = '○'; }
}

function updateTrackingHint() {
  const cal = App.cal;
  const el  = document.getElementById('tracking-hint');
  if (cal.scale.done && cal.origin.done && cal.axes.done) {
    el.textContent = 'Calibration complete. Click "Start Tracking" then click the object in each frame.';
    el.style.borderLeftColor = 'var(--secondary)';
  } else {
    el.textContent = 'Complete all three calibration steps before tracking.';
    el.style.borderLeftColor = '';
  }
}

// ============================================================
// UI HELPERS
// ============================================================
function setBadge(id, type, text) {
  const el = document.getElementById(id);
  el.className = 'badge';
  if (type === 'done')    el.classList.add('badge-done');
  else if (type === 'active') el.classList.add('badge-active');
  else                         el.classList.add('badge-pending');
  el.textContent = text;
}

function setStatus(msg) {
  document.getElementById('status-msg').textContent = msg;
}

function showModal(title, msg) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML    = msg;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function setupInfoModals() {
  // Open buttons in header
  document.getElementById('btn-show-workflow').addEventListener('click', () => {
    document.getElementById('modal-workflow').classList.remove('hidden');
  });

  // Close buttons inside each modal (✕ and Close button share .info-close)
  document.querySelectorAll('.info-close').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.target).classList.add('hidden');
    });
  });

  // Click outside the modal box to dismiss
  ['modal-workflow'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
      if (e.target === document.getElementById(id)) {
        document.getElementById(id).classList.add('hidden');
      }
    });
  });
}
