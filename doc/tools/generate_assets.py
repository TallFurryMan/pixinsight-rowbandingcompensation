#!/usr/bin/env python3

import os
import struct
import zlib


ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ASSET_DIR = os.path.join(ROOT_DIR, "doc", "assets")


FONT = {
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
    "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
    "_": ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
    "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
    ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
    "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
    "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "=": ["00000", "11111", "00000", "11111", "00000", "00000", "00000"],
    ",": ["00000", "00000", "00000", "00000", "00110", "00100", "01000"],
    ".": ["00000", "00000", "00000", "00000", "00000", "00110", "00110"],
    "*": ["00000", "10001", "01010", "00100", "01010", "10001", "00000"],
    "/": ["00001", "00010", "00100", "01000", "10000", "00000", "00000"],
    ":": ["00000", "00110", "00110", "00000", "00110", "00110", "00000"],
    "%": ["11001", "11010", "00100", "01000", "10110", "00110", "00000"],
}


WHITE = (255, 255, 255)
BLACK = (16, 24, 32)
GRAY = (110, 120, 132)
LIGHT = (236, 240, 244)
ACCENT = (201, 214, 229)


class Canvas:
    def __init__(self, width, height, background=WHITE):
        self.width = width
        self.height = height
        self.pixels = bytearray(width * height * 3)
        self.fill(background)

    def fill(self, color):
        r, g, b = color
        row = bytes((r, g, b)) * self.width
        for y in range(self.height):
            start = y * self.width * 3
            self.pixels[start:start + self.width * 3] = row

    def set_pixel(self, x, y, color):
        if x < 0 or y < 0 or x >= self.width or y >= self.height:
            return
        index = (y * self.width + x) * 3
        self.pixels[index:index + 3] = bytes(color)

    def fill_rect(self, x, y, w, h, color):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.set_pixel(xx, yy, color)

    def stroke_rect(self, x, y, w, h, color, thickness=2):
        self.fill_rect(x, y, w, thickness, color)
        self.fill_rect(x, y + h - thickness, w, thickness, color)
        self.fill_rect(x, y, thickness, h, color)
        self.fill_rect(x + w - thickness, y, thickness, h, color)

    def line(self, x0, y0, x1, y1, color, thickness=2):
        dx = abs(x1 - x0)
        dy = abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy

        while True:
            half = thickness // 2
            for yy in range(y0 - half, y0 + half + 1):
                for xx in range(x0 - half, x0 + half + 1):
                    self.set_pixel(xx, yy, color)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x0 += sx
            if e2 < dx:
                err += dx
                y0 += sy

    def arrow(self, x0, y0, x1, y1, color, thickness=2, head=10):
        self.line(x0, y0, x1, y1, color, thickness)
        if x0 == x1 and y0 == y1:
            return
        if abs(x1 - x0) >= abs(y1 - y0):
            direction = 1 if x1 > x0 else -1
            self.line(x1, y1, x1 - direction * head, y1 - head // 2, color, thickness)
            self.line(x1, y1, x1 - direction * head, y1 + head // 2, color, thickness)
        else:
            direction = 1 if y1 > y0 else -1
            self.line(x1, y1, x1 - head // 2, y1 - direction * head, color, thickness)
            self.line(x1, y1, x1 + head // 2, y1 - direction * head, color, thickness)

    def text_size(self, text, scale=4, spacing=1):
        width = 0
        for ch in text:
            glyph = FONT.get(ch, FONT[" "])
            width += (len(glyph[0]) + spacing) * scale
        if text:
            width -= spacing * scale
        height = len(next(iter(FONT.values()))) * scale
        return width, height

    def text(self, x, y, text, scale=4, color=BLACK, spacing=1):
        cursor_x = x
        for ch in text:
            glyph = FONT.get(ch, FONT[" "])
            for gy, row in enumerate(glyph):
                for gx, cell in enumerate(row):
                    if cell == "1":
                        self.fill_rect(
                            cursor_x + gx * scale,
                            y + gy * scale,
                            scale,
                            scale,
                            color,
                        )
            cursor_x += (len(glyph[0]) + spacing) * scale

    def centered_text(self, x, y, w, h, text, scale=4, color=BLACK):
        tw, th = self.text_size(text, scale)
        self.text(x + (w - tw) // 2, y + (h - th) // 2, text, scale, color)

    def save_png(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        raw = bytearray()
        stride = self.width * 3
        for y in range(self.height):
            raw.append(0)
            start = y * stride
            raw.extend(self.pixels[start:start + stride])

        def chunk(kind, data):
            payload = kind + data
            return (
                struct.pack("!I", len(data))
                + payload
                + struct.pack("!I", zlib.crc32(payload) & 0xFFFFFFFF)
            )

        png = bytearray()
        png.extend(b"\x89PNG\r\n\x1a\n")
        png.extend(chunk(b"IHDR", struct.pack("!IIBBBBB", self.width, self.height, 8, 2, 0, 0, 0)))
        png.extend(chunk(b"IDAT", zlib.compress(bytes(raw), 9)))
        png.extend(chunk(b"IEND", b""))

        with open(path, "wb") as handle:
            handle.write(png)


def labeled_box(canvas, x, y, w, h, title, subtitle=None):
    canvas.fill_rect(x, y, w, h, LIGHT)
    canvas.stroke_rect(x, y, w, h, BLACK, 2)
    canvas.centered_text(x, y + 10, w, 26, title, 4, BLACK)
    if subtitle:
        canvas.centered_text(x, y + 44, w, 18, subtitle, 3, GRAY)


def formula_image(filename, title, lines):
    width = 2000
    height = 150 + 72 * len(lines)
    canvas = Canvas(width, height)
    canvas.text(48, 28, title, 5, BLACK)
    canvas.line(48, 82, width - 48, 82, ACCENT, 3)
    y = 118
    for line in lines:
        canvas.text(64, y, line, 5, BLACK)
        y += 72
    canvas.save_png(os.path.join(ASSET_DIR, filename))


def pipeline_overview():
    canvas = Canvas(2000, 1120)
    canvas.text(54, 30, "WORKFLOW OVERVIEW", 6, BLACK)
    canvas.line(54, 96, 1946, 96, ACCENT, 3)

    labeled_box(canvas, 60, 170, 280, 96, "TARGET IMAGE", "I_ORIG")
    labeled_box(canvas, 430, 170, 280, 96, "CURRENT IMAGE", "I_CUR")
    labeled_box(canvas, 800, 170, 280, 96, "SOFT BG MODEL", "B_SOFT")
    labeled_box(canvas, 1170, 170, 280, 96, "WORKING SUPPORT", "I_WORK")
    labeled_box(canvas, 1540, 170, 320, 96, "ROW MODEL", "R_BG / R_RES")

    labeled_box(canvas, 60, 430, 280, 96, "STAR MASK", "OPTIONAL")
    labeled_box(canvas, 430, 430, 280, 96, "STARS ONLY", "OPTIONAL")
    labeled_box(canvas, 800, 430, 280, 96, "MASK BUILDER", "M_EXCL + M_PROT")
    labeled_box(canvas, 1170, 430, 280, 96, "STAR ANALYSIS", "CATALOG / FALLBACK")
    labeled_box(canvas, 1540, 430, 320, 96, "SUPPORT TERMS", "R_INF + M_PROT")

    labeled_box(canvas, 560, 720, 380, 110, "CORRECTION MODEL", "R_VIS / R_CONF / C[Y]")
    labeled_box(canvas, 1060, 720, 380, 110, "APPLY + UPDATE", "I_CUR <- I_CUR - C[Y]")
    labeled_box(canvas, 560, 930, 380, 96, "CORRECTED OUTPUT", "TARGET_RBC")
    labeled_box(canvas, 1060, 930, 380, 96, "DIAGNOSTICS", "PLOTS + SUPPORT IMAGES")

    canvas.arrow(340, 218, 430, 218, BLACK, 3, 16)
    canvas.arrow(710, 218, 800, 218, BLACK, 3, 16)
    canvas.arrow(1080, 218, 1170, 218, BLACK, 3, 16)
    canvas.arrow(1450, 218, 1540, 218, BLACK, 3, 16)

    canvas.arrow(340, 478, 800, 478, BLACK, 3, 16)
    canvas.arrow(710, 478, 800, 478, BLACK, 3, 16)
    canvas.arrow(1080, 478, 1170, 478, BLACK, 3, 16)
    canvas.arrow(1450, 478, 1540, 478, BLACK, 3, 16)
    canvas.arrow(940, 775, 1060, 775, BLACK, 3, 16)
    canvas.arrow(1700, 266, 750, 720, BLACK, 3, 16)
    canvas.arrow(1700, 526, 750, 720, BLACK, 3, 16)
    canvas.arrow(1250, 830, 1250, 930, BLACK, 3, 16)
    canvas.arrow(940, 980, 1060, 980, BLACK, 3, 16)
    canvas.arrow(1250, 720, 570, 720, GRAY, 2, 12)
    canvas.text(704, 682, "ITERATIVE LOOP", 3, GRAY)

    canvas.save_png(os.path.join(ASSET_DIR, "pipeline_overview.png"))


def convergence_logic():
    canvas = Canvas(1600, 1120)
    canvas.text(54, 30, "ITERATION CONTROL", 6, BLACK)
    canvas.line(54, 96, 1546, 96, ACCENT, 3)

    labeled_box(canvas, 410, 150, 520, 100, "ITERATION K", "BUILD METRICS + C[Y]")
    labeled_box(canvas, 410, 330, 520, 100, "DIVERGENCE ?", "3 RMS INCREASES")
    labeled_box(canvas, 410, 510, 520, 100, "EPSILON FLOOR ?", "1E-9 SUPPRESSES EARLY STOP")
    labeled_box(canvas, 410, 690, 520, 100, "CONVERGED ?", "RMSDELTA + ABSQ95 OR MAXCORR")
    labeled_box(canvas, 410, 870, 520, 100, "ADVANCE", "APPLY C[Y] AND INCREMENT K")
    labeled_box(canvas, 1090, 510, 280, 100, "STOP", "DIV / CONV / LIMIT")

    canvas.arrow(670, 250, 670, 330, BLACK, 3, 16)
    canvas.arrow(670, 430, 670, 510, BLACK, 3, 16)
    canvas.arrow(670, 790, 670, 870, BLACK, 3, 16)
    canvas.arrow(930, 380, 1090, 560, BLACK, 3, 16)
    canvas.arrow(930, 740, 1090, 560, BLACK, 3, 16)
    canvas.arrow(670, 610, 670, 690, BLACK, 3, 16)
    canvas.arrow(930, 560, 930, 920, GRAY, 2, 12)
    canvas.arrow(670, 970, 670, 250, GRAY, 2, 12)

    canvas.text(956, 420, "YES", 3, GRAY)
    canvas.text(700, 642, "NO", 3, GRAY)
    canvas.text(956, 714, "YES", 3, GRAY)
    canvas.text(956, 778, "YES", 3, GRAY)
    canvas.text(700, 822, "NO", 3, GRAY)
    canvas.text(710, 1000, "NEXT ITERATION", 3, GRAY)

    canvas.save_png(os.path.join(ASSET_DIR, "convergence_logic.png"))


def generate():
    os.makedirs(ASSET_DIR, exist_ok=True)

    formula_image(
        "formula_masks_and_influence.png",
        "MASKS AND STAR INFLUENCE",
        [
            "M_EXCL = DILATE( THRESH( I_MASK ) )",
            "M_PROT = BLUR( I_MASK )",
            "R_INF[Y] = NORM( SUM_K A_K * K( ABS( Y - Y_K ) ) )",
            "R_INF_FALLBACK[Y] = NORM( MEAN_X M_PROT(X,Y) )",
        ],
    )

    formula_image(
        "formula_background_support.png",
        "SOFT BACKGROUND SUPPORT MODEL",
        [
            "B_SOFT(X,Y) = BILERP( G_SIGMA( NODES( I_CUR, M_EXCL ) ) )",
            "I_WORK(X,Y) = I_CUR(X,Y) - B_SOFT(X,Y)",
        ],
    )

    formula_image(
        "formula_row_profiles.png",
        "ROW PROFILE CONSTRUCTION",
        [
            "R_BG[Y]  = T_X( I_WORK(X,Y) | M_EXCL(X,Y) = 0 )",
            "R_TR[Y]  = G_SIGMA( R_BG )[Y]",
            "R_RES[Y] = R_BG[Y] - R_TR[Y]",
        ],
    )

    formula_image(
        "formula_modulation_and_correction.png",
        "MODULATION AND CORRECTION",
        [
            "Q[Y] = MAX( 0, 1 - C_CONF * ( 1 - R_CONF[Y] ) )",
            "C[Y] = CLIP( G * R_RES[Y]",
            "             * ( 1 + B_S * R_INF[Y] )",
            "             * ( 1 + B_V * R_VIS[Y] )",
            "             * Q[Y] )",
            "I_NEXT(X,Y) = CLIP( I_CUR(X,Y) - C[Y] * W_PROT(X,Y) )",
        ],
    )

    formula_image(
        "formula_convergence.png",
        "CONVERGENCE METRICS",
        [
            "STOP IF RMSDELTA <= EPS AND ABSQ95( R_RES ) <= EPS",
            "OR IF MAXCORR <= EPS AND ABSQ95( R_RES ) <= EPS",
            "IF EPS = 1E-9, EARLY STOP IS SUPPRESSED",
        ],
    )

    pipeline_overview()
    convergence_logic()


if __name__ == "__main__":
    generate()
