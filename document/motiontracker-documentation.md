# Motion Tracker Lab Documentation

## About

- Version: 1.0
- Website: https://www.inanolab.com/motiontracker.html
- Developer / Programmer: Dr. James Salveo Olarve
- Affiliation: i-Nano Research Facility, De La Salle University Manila

## Citation Recommendation

If you use Motion Tracker in academic work:

Olarve, J. S. L. (2026). Motion Tracker. i-Nano Research Facility, De La Salle University Manila. Retrieved from https://www.inanolab.com/motiontracker.html

Updated citation will be provided once DOI is assigned.

## Purpose

Motion Tracker Lab is a browser-based physics video analysis tool for manually tracking the motion of an object in a video. It allows users to upload a video, calibrate the video against a known real-world distance, define a coordinate system, mark an object's position frame by frame, and analyze the resulting motion data through tables, graphs, and curve fits.

The tool is designed as a lightweight alternative to installed desktop motion-analysis software. It runs locally in the browser and keeps uploaded videos on the user's device.

## Primary Use Cases

- Analyze projectile motion from videos of thrown balls, launched objects, or sports motion.
- Measure position, velocity, and acceleration from classroom or laboratory videos.
- Study carts, ramps, pendulums, oscillations, collisions, and other mechanics experiments.
- Convert video observations into graphable experimental data.
- Let students practice coordinate-system setup, scale calibration, and frame-by-frame measurement.
- Export motion data for reports, spreadsheets, or further analysis.

## Target Users

- Physics students who need to collect position-time data from real videos.
- Physics teachers and laboratory instructors who want a browser-based tool for mechanics lessons.
- STEM learners doing home, classroom, or remote experiments without installing specialized software.
- Researchers or hobbyists who need quick manual motion tracking for simple single-object motion.
- Schools using shared or restricted devices where local installation of desktop applications is inconvenient.

## Core Workflow

1. Upload a video file or load the built-in sample video.
2. Set the calibration scale by clicking two points with a known real-world separation.
3. Set the coordinate origin.
4. Set the positive x-axis direction and choose the coordinate convention.
5. Start tracking and click the object's position on successive frames.
6. Review the generated data table.
7. Select graphs and optional curve fits.
8. Export data as CSV or copy it for external use.

## Key Features

### Local Video Loading

Users can upload MP4, WebM, or MOV files. The file is loaded directly in the browser using a local object URL, so videos are not uploaded to a server.

### Frame-by-Frame Controls

The interface supports play, pause, reset, previous-frame, and next-frame controls. Users can set the video FPS from common values or enter a custom FPS, which is important because frame numbers and derived velocities depend on the time interval between frames.

### Calibration

The calibration system includes three required steps:

- Scale calibration: two clicked reference points are matched to a known distance in meters, centimeters, or millimeters.
- Origin selection: a clicked point becomes coordinate position `(0, 0)`.
- Axis direction: a clicked point defines the positive x-axis direction.

The app supports both physics-style coordinates, where positive y points upward, and screen-style coordinates, where positive y points downward.

### Manual Motion Tracking

After calibration, users click the object location in each frame. The app records the frame number, timestamp, pixel coordinates, calibrated real-world coordinates, velocity, and acceleration values. Auto-advance can move the video forward after each click, making frame-by-frame collection faster.

### Visual Overlay

The canvas overlay displays calibration markers, coordinate axes, tracked points, and trajectory information on top of the video. Users can hide or show the overlay while reviewing the source video.

### Zoom and Pan

The video workspace includes zoom controls from 100% to 300% and directional pan buttons. This helps users click small or fast-moving objects more accurately.

### Data Table

Tracked motion data is shown in a table with:

- point number
- frame
- time
- x and y pixel coordinates
- calibrated x and y coordinates
- x and y velocity

The CSV export also includes x and y acceleration values.

### Graphing and Curve Fitting

Motion Tracker Lab uses Chart.js to plot:

- x position vs time
- y position vs time
- y vs x trajectory
- x velocity vs time
- y velocity vs time
- x acceleration vs time
- y acceleration vs time

Users can apply no fit, a linear fit, or a quadratic fit. The fit panel reports the equation, R-squared value, and selected physics interpretations such as constant velocity, acceleration, or projectile-like parabolic motion.

### Export Options

The app supports:

- CSV export of measured and calculated data
- graph export as PNG
- clipboard copy of tabular data

### Guided Workflow Modal

A workflow modal lists the major stages of the analysis process and marks progress through uploading, calibration, tracking, table review, graphing, and export.

## Strengths

- Runs entirely in the browser with no installation requirement.
- Preserves privacy by processing uploaded videos locally.
- Provides a complete introductory mechanics workflow from video to graph.
- Includes both raw pixel data and calibrated real-world data.
- Supports classroom-friendly exports for lab reports and spreadsheets.
- Includes a built-in sample video for demonstrations and first-time practice.

## Current Limitations

- Tracking is manual; there is no automatic object detection.
- The app appears designed for one tracked object at a time.
- Accuracy depends on correct FPS selection and browser video-seeking behavior.
- MOV support depends on the browser and the video's codec.
- Large videos may load or seek slowly.
- Measurement uncertainty and error bars are not currently built into the interface.
- Some icon characters appeared garbled in terminal output during review. If they also render incorrectly in the browser, the files should be re-saved as UTF-8 and the affected button/modal labels cleaned up.

## Recommended Classroom Applications

- Projectile motion lab: estimate initial velocity and gravitational acceleration from a ball toss.
- Inclined plane lab: track a rolling cart and compare acceleration with theory.
- Pendulum lab: track horizontal displacement against time.
- Collision lab: collect position data before and after impact for simple momentum studies.
- Video-based homework: students record a motion clip, track it, export CSV, and interpret graphs.
