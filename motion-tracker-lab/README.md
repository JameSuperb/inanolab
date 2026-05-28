# Motion Tracker Lab

A browser-based physics video analysis tool for manually tracking the motion of objects in uploaded videos.

## Purpose

Motion Tracker Lab helps physics students measure and analyze the motion of real objects captured on video. It replicates core features of desktop tools like Tracker, running entirely in the browser with no installation required.

## Main Features

- **Video upload** — load MP4, WebM, or MOV files directly from your device; nothing is sent to a server
- **Frame-by-frame navigation** — step through video one frame at a time with configurable FPS
- **Calibration system** — define a real-world scale, coordinate origin, and axis orientation
- **Manual tracking** — click the object position on each frame; auto-advance steps the video automatically
- **Data table** — shows frame, time, pixel and real coordinates, velocities; exportable as CSV
- **Graphs** — x(t), y(t), y(x), vx(t), vy(t), ax(t), ay(t) with Chart.js
- **Curve fitting** — linear and quadratic fits with R² and physical interpretation
- **Sample data** — load built-in projectile motion data without a video
- **Export** — CSV data download, graph PNG export, clipboard copy

## How to Run Locally

1. Download or clone this repository.
2. Open `index.html` in any modern web browser (Chrome, Firefox, Edge).
3. No server, build step, or internet connection required (Chart.js loads from CDN on first use — an offline copy can be downloaded if needed).

## Supported Video Formats

| Format | Support |
|--------|---------|
| MP4 (H.264) | ✅ All browsers |
| WebM (VP8/VP9) | ✅ All browsers |
| MOV | ⚠️ Browser-dependent; may not work in Chrome |

For best results, use MP4 (H.264).

## Calibration Workflow

1. **Set Scale** — click two points on the video that span a known distance; enter that distance in m, cm, or mm.
2. **Set Origin** — click the point that will be (0, 0) in your coordinate system.
3. **Set Axes** — click a point in the +x direction; choose physics coordinates (y↑) or screen coordinates (y↓).
4. **Track** — click the object in each frame; the app records position in both pixels and real-world units.

## Classroom Use Cases

- Projectile motion analysis (ball throw, basketball shot)
- Cart acceleration on a ramp (constant acceleration)
- Pendulum motion (x oscillation vs time)
- Collision analysis (two objects before/after)
- Any experiment where position vs time data is needed from a video

## Limitations

- Frame stepping accuracy depends on the browser's video seek precision and on the FPS setting being correct.
- MOV files may fail to load in Chromium-based browsers depending on the codec used.
- Very large video files (>500 MB) may be slow to seek; compress the video first.
- Automatic object detection is not implemented; all tracking is manual.
- No multi-object tracking.

## Future Improvements

- Automatic object tracking using color or feature detection
- Multi-object tracking with multiple data series
- Angle and distance measurement tools
- Uncertainty/error estimation for each tracked point
- Full lab report export (PDF)
- Offline-ready PWA mode (bundled Chart.js)
- Teacher assignment mode with guided prompts
- Cloud save / shareable experiment links
- Video annotation and notes layer
