"""
Generates projectile_motion.mp4 — a simple physics animation
used as the built-in sample video for Motion Tracker Lab.

Physics:  x(t) = Vx·t          Vx = 3 m/s
          y(t) = Vy·t – ½g·t²   Vy = 8 m/s,  g = 9.8 m/s²

Scale:    80 px = 1 m
Origin:   pixel (100, 370)  → real (0, 0)
Canvas:   800 × 450 px,  30 fps
"""

import cv2
import numpy as np
import math

# ── constants ────────────────────────────────────────────────────────────────
W, H   = 800, 450
FPS    = 30
PX_M   = 80          # pixels per metre
OX, OY = 100, 370    # origin in canvas pixels (bottom-left of trajectory)

VX, VY = 3.0, 8.0    # m/s
G      = 9.8          # m/s²

T_LAND = 2 * VY / G  # ≈ 1.633 s
N_MOTION = math.ceil(T_LAND * FPS) + 1
HOLD_FRAMES = 20     # freeze on last frame before looping

# ── colour palette (BGR) ─────────────────────────────────────────────────────
BG         = (245, 242, 238)
GRID_MINOR = (220, 216, 212)
GRID_MAJOR = (190, 185, 180)
GROUND_CLR = ( 90,  80,  70)
SCALE_CLR  = ( 60,  50,  40)
BALL_FILL  = ( 30, 100, 230)   # orange-red (BGR = blue=30, green=100, red=230)
BALL_EDGE  = ( 15,  55, 160)
HIGHLIGHT  = (200, 220, 255)
TRAIL_CLR  = (150, 180, 220)
SHADOW_CLR = (180, 175, 170)
TEXT_CLR   = ( 60,  50,  40)

# ── helpers ──────────────────────────────────────────────────────────────────
def ball_pos(t):
    rx = VX * t
    ry = VY * t - 0.5 * G * t * t
    cx = int(round(OX + rx * PX_M))
    cy = int(round(OY - ry * PX_M))
    return cx, cy

def draw_background(frame):
    """Fills background, grid lines, ground, axes labels, scale bar."""
    frame[:] = BG

    # ── minor grid (every 0.5 m = 40 px)
    for x in range(0, W, PX_M // 2):
        cv2.line(frame, (x, 0), (x, H), GRID_MINOR, 1)
    for y in range(0, H, PX_M // 2):
        cv2.line(frame, (0, y), (W, y), GRID_MINOR, 1)

    # ── major grid (every 1 m = 80 px)
    for x in range(0, W, PX_M):
        cv2.line(frame, (x, 0), (x, H), GRID_MAJOR, 1)
    for y in range(0, H, PX_M):
        cv2.line(frame, (0, y), (W, y), GRID_MAJOR, 1)

    # ── ground line
    cv2.line(frame, (0, OY), (W, OY), GROUND_CLR, 2)

    # ── distance labels along ground (0 m … 5 m)
    for m in range(6):
        lx = OX + m * PX_M
        if lx > W - 10:
            break
        cv2.line(frame, (lx, OY), (lx, OY + 8), SCALE_CLR, 1)
        label = f'{m}m'
        (tw, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.38, 1)
        cv2.putText(frame, label, (lx - tw // 2, OY + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.38, SCALE_CLR, 1, cv2.LINE_AA)

    # ── scale bar (bottom-right corner)
    bx1, bx2 = W - 30 - PX_M, W - 30
    by = OY + 38
    cv2.line(frame,  (bx1, by),     (bx2, by),     SCALE_CLR, 2)
    cv2.line(frame,  (bx1, by - 5), (bx1, by + 5), SCALE_CLR, 2)
    cv2.line(frame,  (bx2, by - 5), (bx2, by + 5), SCALE_CLR, 2)
    label = '1 m'
    (tw, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
    cv2.putText(frame, label, ((bx1 + bx2) // 2 - tw // 2, by + 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, SCALE_CLR, 1, cv2.LINE_AA)

    # ── origin dot
    cv2.circle(frame, (OX, OY), 4, SCALE_CLR, -1)

def draw_trail(frame, positions):
    n = len(positions)
    for i, (px, py) in enumerate(positions):
        alpha = (i + 1) / n
        r = max(2, int(4 * alpha))
        shade = int(200 - 80 * alpha)
        cv2.circle(frame, (px, py), r, (shade, shade + 10, shade + 40), -1, cv2.LINE_AA)

def draw_ball(frame, cx, cy):
    # Drop shadow on ground
    sy = OY
    ratio = max(0.0, 1.0 - abs(cy - OY) / (3.5 * PX_M))
    if ratio > 0.05:
        sw = max(4, int(14 * ratio))
        sh = max(2, int(5 * ratio))
        cv2.ellipse(frame, (cx, sy), (sw, sh), 0, 0, 360, SHADOW_CLR, -1, cv2.LINE_AA)

    # Ball body
    cv2.circle(frame, (cx, cy), 12, BALL_FILL, -1, cv2.LINE_AA)
    cv2.circle(frame, (cx, cy), 12, BALL_EDGE,  2, cv2.LINE_AA)

    # Specular highlight
    cv2.circle(frame, (cx - 4, cy - 4), 4, HIGHLIGHT, -1, cv2.LINE_AA)

# ── write video ───────────────────────────────────────────────────────────────
fourcc = cv2.VideoWriter_fourcc(*'H264')   # falls back to avc1 — broadest browser support
out_path = 'C:/Users/James Olarve/motion-tracker-lab/projectile_motion.mp4'
out = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))

positions = []

for fi in range(N_MOTION):
    t  = fi / FPS
    cx, cy = ball_pos(t)

    frame = np.empty((H, W, 3), dtype=np.uint8)
    draw_background(frame)
    draw_trail(frame, positions)
    draw_ball(frame, cx, cy)

    # Time counter (top-left)
    cv2.putText(frame, f't = {t:.2f} s', (12, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, TEXT_CLR, 1, cv2.LINE_AA)

    positions.append((cx, cy))
    out.write(frame)

# Freeze on final frame
final_frame = frame.copy()
for _ in range(HOLD_FRAMES):
    out.write(final_frame)

out.release()
print(f'Saved: {out_path}')
print(f'Frames: {N_MOTION} motion + {HOLD_FRAMES} hold = {N_MOTION + HOLD_FRAMES} total')
print(f'Duration: {(N_MOTION + HOLD_FRAMES) / FPS:.2f} s  |  FPS: {FPS}  |  Size: {W}×{H}')
print(f'Scale: {PX_M} px = 1 m  |  Origin pixel: ({OX}, {OY})')
