#!/usr/bin/env python3
"""Erzeugt ein 9:16 TikTok-Video: "5 WoW-Fakten, die du nicht kanntest".

Alles (Grafik + Musik) wird prozedural erzeugt -> keine Lizenzprobleme.
Benötigt: python3, numpy, Pillow, ffmpeg.
Aufruf:   python3 make_video.py   -> wow_fakten_tiktok.mp4
"""
import math
import os
import random
import subprocess
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "wow_fakten_tiktok.mp4")
WAV = os.path.join(HERE, "_audio.wav")

SERIF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
SANS_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

GOLD = (255, 205, 90)
WHITE = (245, 240, 230)
ACCENT = (90, 200, 255)

# ---------------------------------------------------------------- Inhalt
HOOK_DUR = 3.0
FACT_DUR = 4.8
OUTRO_DUR = 3.6

FACTS = [
    ("Eine echte Pandemie",
     "2005 verbreitete sich der Debuff\n„Verderbtes Blut“ unkontrolliert\nin den Hauptstädten.\n\nEpidemiologen nutzen den Vorfall\nbis heute als Studienmodell."),
    ("LEEROY JENKINS!",
     "Ein Spieler stürmte 2005 einfach\nlos und ruinierte den Plan\nseiner Gruppe.\n\nDas Video wurde zu einem\nder ersten Internet-Memes."),
    ("12 Millionen Abos",
     "2010 zahlten über 12 Millionen\nMenschen monatlich für WoW.\n\nMehr Einwohner als Belgien –\nin einer Fantasy-Welt."),
    ("Ein Trauerzug im Spiel",
     "2006 hielten Spieler eine Gedenk-\nfeier für eine verstorbene\nMitspielerin ab.\n\nEine gegnerische Gilde griff an –\nund schrieb MMO-Geschichte."),
    ("Über 20 Jahre alt",
     "WoW erschien im November 2004.\n\nViele Spieler von damals\nzocken heute mit ihren Kindern."),
]

TOTAL = HOOK_DUR + FACT_DUR * len(FACTS) + OUTRO_DUR
NFRAMES = int(TOTAL * FPS)


# ---------------------------------------------------------------- Helfer
def ease_out_back(t):
    c1, c3 = 1.70158, 2.70158
    t = min(max(t, 0.0), 1.0)
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2


def ease_out(t):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** 3


def text_layer(text, font_path, size, color, glow=None, stroke=0, spacing=14,
               align="center", max_w=W - 160):
    """Rendert (mehrzeiligen) Text inkl. Glow in ein RGBA-Bild."""
    font = ImageFont.truetype(font_path, size)
    # automatisch verkleinern, falls zu breit
    while True:
        tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
        box = tmp.multiline_textbbox((0, 0), text, font=font, spacing=spacing,
                                     align=align, stroke_width=stroke)
        if box[2] - box[0] <= max_w or size < 30:
            break
        size -= 4
        font = ImageFont.truetype(font_path, size)
    pad = 60
    tw, th = int(box[2] - box[0] + pad * 2), int(box[3] - box[1] + pad * 2)
    box = [int(v) for v in box]
    img = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    org = (pad - box[0], pad - box[1])
    if glow:
        g = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        ImageDraw.Draw(g).multiline_text(org, text, font=font, fill=glow,
                                         spacing=spacing, align=align,
                                         stroke_width=stroke + 6,
                                         stroke_fill=glow)
        img = Image.alpha_composite(img, g.filter(ImageFilter.GaussianBlur(18)))
    d = ImageDraw.Draw(img)
    d.multiline_text(org, text, font=font, fill=color, spacing=spacing,
                     align=align, stroke_width=stroke,
                     stroke_fill=(20, 10, 0, 255))
    return img


def paste_center(frame, layer, cx, cy, scale=1.0, alpha=1.0):
    if alpha <= 0.01 or scale <= 0.01:
        return
    if abs(scale - 1.0) > 0.005:
        layer = layer.resize((max(1, int(layer.width * scale)),
                              max(1, int(layer.height * scale))),
                             Image.BILINEAR)
    if alpha < 0.999:
        a = layer.getchannel("A").point(lambda v: int(v * alpha))
        layer = layer.copy()
        layer.putalpha(a)
    frame.alpha_composite(layer, (int(cx - layer.width / 2),
                                  int(cy - layer.height / 2)))


# ---------------------------------------------------------------- Hintergrund
def make_background(top, bottom):
    y = np.linspace(0, 1, H)[:, None, None]
    grad = np.array(top)[None, None] * (1 - y) + np.array(bottom)[None, None] * y
    grad = np.repeat(grad, W, axis=1)
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H * 0.45) / (H * 0.7)) ** 2)
    vign = np.clip(1.15 - d * 0.9, 0.25, 1.0)[..., None]
    return Image.fromarray(np.clip(grad * vign, 0, 255).astype(np.uint8)).convert("RGBA")


BG_THEMES = [
    ((40, 10, 70), (5, 5, 20)),     # Hook: violett
    ((70, 15, 15), (10, 4, 4)),     # Pandemie: rot
    ((15, 35, 75), (3, 6, 20)),     # Leeroy: blau
    ((60, 45, 10), (12, 8, 2)),     # 12 Mio: gold
    ((20, 20, 35), (2, 2, 6)),      # Trauerzug: grau
    ((10, 55, 45), (2, 10, 8)),     # 20 Jahre: grün
    ((40, 10, 70), (5, 5, 20)),     # Outro
]
print("Erzeuge Hintergründe ...")
BGS = [make_background(t, b) for t, b in BG_THEMES]

# Glut-Partikel
random.seed(7)
PARTICLES = [dict(x=random.uniform(0, W), y=random.uniform(0, H),
                  vy=random.uniform(40, 140), vx=random.uniform(-20, 20),
                  r=random.uniform(2, 6), ph=random.uniform(0, 6.28))
             for _ in range(90)]

# Partikel-Sprite mit Glow
_SPR = {}


def ember(r):
    k = int(round(r))
    if k not in _SPR:
        s = k * 8
        im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse((s / 2 - k * 2, s / 2 - k * 2, s / 2 + k * 2, s / 2 + k * 2),
                  fill=(255, 140, 40, 90))
        im = im.filter(ImageFilter.GaussianBlur(k))
        ImageDraw.Draw(im).ellipse((s / 2 - k / 2, s / 2 - k / 2, s / 2 + k / 2,
                                    s / 2 + k / 2), fill=(255, 230, 160, 255))
        _SPR[k] = im
    return _SPR[k]


def draw_particles(frame, t):
    for p in PARTICLES:
        y = (p["y"] - p["vy"] * t) % (H + 100) - 50
        x = (p["x"] + p["vx"] * t + 30 * math.sin(t * 1.3 + p["ph"])) % W
        spr = ember(p["r"])
        frame.alpha_composite(spr, (int(x - spr.width / 2), int(y - spr.height / 2)))


# ---------------------------------------------------------------- Text-Layer vorberechnen
print("Rendere Texte ...")
L_HOOK1 = text_layer("5 WoW-FAKTEN", SERIF, 130, GOLD, glow=(255, 120, 0, 200), stroke=4)
L_HOOK2 = text_layer("die du garantiert\nNICHT kanntest", SANS, 78, WHITE,
                     glow=(120, 60, 255, 160), stroke=3)
L_HOOK3 = text_layer("Bis zum Ende schauen!", SANS_REG, 46, ACCENT)

L_NUM = [text_layer(f"#{i + 1}", SERIF, 260, GOLD, glow=(255, 110, 0, 220), stroke=5)
         for i in range(len(FACTS))]
L_TITLE = [text_layer(t, SERIF, 92, WHITE, glow=(255, 160, 40, 150), stroke=3)
           for t, _ in FACTS]
L_BODY = [text_layer(b, SANS_REG, 50, (230, 225, 215), stroke=2, spacing=16)
          for _, b in FACTS]

L_OUT1 = text_layer("Welcher Fakt\nwar neu für dich?", SERIF, 96, GOLD,
                    glow=(255, 120, 0, 200), stroke=4)
L_OUT2 = text_layer("Schreib's in die Kommentare!", SANS, 56, WHITE, stroke=2)
L_OUT3 = text_layer("FOLGEN für Teil 2", SANS, 70, (20, 10, 0),
                    max_w=W)
L_DISC = text_layer("Fan-Video · nicht mit Blizzard Entertainment verbunden",
                    SANS_REG, 26, (200, 200, 200, 150))


def pill(layer, color=GOLD):
    """Legt einen abgerundeten Button hinter den Text."""
    w, h = layer.width - 30, layer.height - 50
    im = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((20, 20, w + 20, h + 20), radius=h // 2,
                                         fill=color + (255,))
    glow = im.filter(ImageFilter.GaussianBlur(14))
    out = Image.alpha_composite(glow, im)
    out.alpha_composite(layer, ((out.width - layer.width) // 2,
                                (out.height - layer.height) // 2))
    return out


L_OUT3 = pill(L_OUT3)

# ---------------------------------------------------------------- Szenen
# TikTok-UI verdeckt unten ~380px und rechts ~150px -> Inhalt mittig/oben halten.
CX = W / 2 - 30


def scene_index(t):
    if t < HOOK_DUR:
        return 0, t
    t2 = t - HOOK_DUR
    i = int(t2 // FACT_DUR)
    if i < len(FACTS):
        return i + 1, t2 - i * FACT_DUR
    return len(FACTS) + 1, t2 - len(FACTS) * FACT_DUR


def render(fi):
    t = fi / FPS
    sc, lt = scene_index(t)
    frame = BGS[sc].copy()

    # leichtes "Atmen" / Zoom des Hintergrunds per Lichtkegel
    draw_particles(frame, t)

    shake = 0
    if sc == 0:
        s1 = ease_out_back(lt / 0.45)
        shake = 10 * max(0, 1 - lt / 0.3) * math.sin(lt * 90)
        paste_center(frame, L_HOOK1, CX + shake, 640, s1 * (1 + 0.02 * math.sin(lt * 6)))
        a2 = ease_out((lt - 0.4) / 0.4)
        paste_center(frame, L_HOOK2, CX, 900 + 60 * (1 - a2), 1.0, a2)
        a3 = ease_out((lt - 1.2) / 0.4) * (0.6 + 0.4 * math.sin(lt * 8))
        paste_center(frame, L_HOOK3, CX, 1160, 1.0, a3)
    elif sc <= len(FACTS):
        i = sc - 1
        # Nummer knallt rein
        sn = ease_out_back(lt / 0.4)
        shake = 8 * max(0, 1 - lt / 0.25) * math.sin(lt * 80)
        paste_center(frame, L_NUM[i], CX + shake, 430, sn)
        a = ease_out((lt - 0.25) / 0.35)
        paste_center(frame, L_TITLE[i], CX + 80 * (1 - a), 690, 1.0, a)
        b = ease_out((lt - 0.6) / 0.5)
        paste_center(frame, L_BODY[i], CX, 1030 + 50 * (1 - b), 1.0, b)
        # Trennlinie
        d = ImageDraw.Draw(frame)
        lw = int(500 * ease_out((lt - 0.3) / 0.5))
        if lw > 0:
            d.rectangle((CX - lw / 2, 790, CX + lw / 2, 795), fill=GOLD + (220,))
    else:
        s = ease_out_back(lt / 0.5)
        paste_center(frame, L_OUT1, CX, 640, s)
        a = ease_out((lt - 0.4) / 0.4)
        paste_center(frame, L_OUT2, CX, 900, 1.0, a)
        pulse = 1 + 0.06 * math.sin(lt * 7)
        b = ease_out((lt - 0.8) / 0.4)
        paste_center(frame, L_OUT3, CX, 1100, b * pulse)

    # Szenenwechsel-Blitz
    flash = max(0.0, 1 - lt / 0.15)
    if flash > 0 and t > 0.1:
        frame.alpha_composite(Image.new("RGBA", (W, H), (255, 230, 180, int(150 * flash))))

    # Fortschrittsbalken oben (hält Leute bis zum Ende)
    d = ImageDraw.Draw(frame)
    d.rectangle((0, 0, W, 12), fill=(0, 0, 0, 120))
    d.rectangle((0, 0, int(W * t / TOTAL), 12), fill=GOLD + (255,))

    paste_center(frame, L_DISC, W / 2, 1480, 1.0, 0.8)
    return frame.convert("RGB")


# ---------------------------------------------------------------- Musik
def make_audio(path):
    sr = 44100
    n = int(TOTAL * sr)
    t = np.arange(n) / sr
    out = np.zeros(n)
    bpm = 100
    beat = 60 / bpm

    def note(f):
        return 440 * 2 ** ((f - 69) / 12)

    # epischer Drone in d-Moll: Dm - Bb - F - C
    prog = [(50, 53, 57), (46, 50, 53), (41, 45, 48), (48, 52, 55)]
    bar = beat * 4
    for k in range(int(TOTAL / bar) + 1):
        chord = prog[k % 4]
        s0, s1 = int(k * bar * sr), min(n, int((k + 1) * bar * sr))
        tt = t[s0:s1] - k * bar
        env = np.minimum(1, tt / 0.3) * np.minimum(1, (bar - tt) / 0.3)
        for m in chord:
            f = note(m)
            out[s0:s1] += 0.05 * env * (np.sin(2 * np.pi * f * tt)
                                        + 0.4 * np.sin(2 * np.pi * f * 2.003 * tt)
                                        + 0.2 * np.sin(2 * np.pi * f * 0.5 * tt))

    # Pauken auf 1 und 3, ab dem Hook
    for k in range(int(TOTAL / beat)):
        if k % 2:
            continue
        s0 = int(k * beat * sr)
        L = int(0.5 * sr)
        tt = np.arange(min(L, n - s0)) / sr
        f = 55 * np.exp(-tt * 6) + 40
        out[s0:s0 + len(tt)] += 0.45 * np.sin(2 * np.pi * np.cumsum(f) / sr) * np.exp(-tt * 7)

    # Whoosh/Impact bei jedem Szenenwechsel
    rng = np.random.default_rng(1)
    cuts = [0.0] + [HOOK_DUR + i * FACT_DUR for i in range(len(FACTS) + 1)]
    for c in cuts:
        s0 = int(c * sr)
        L = int(0.6 * sr)
        tt = np.arange(min(L, n - s0)) / sr
        noise = rng.standard_normal(len(tt))
        noise = np.convolve(noise, np.ones(8) / 8, mode="same")
        out[s0:s0 + len(tt)] += 0.35 * noise * np.exp(-tt * 8)
        out[s0:s0 + len(tt)] += 0.6 * np.sin(2 * np.pi * 45 * tt) * np.exp(-tt * 5)

    # Fade in/out + normalisieren
    fade = np.minimum(1, t / 0.05) * np.minimum(1, (TOTAL - t) / 1.0)
    out *= fade
    out = out / np.max(np.abs(out)) * 0.85
    pcm = (out * 32767).astype(np.int16)
    stereo = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(stereo.tobytes())


def main():
    print("Erzeuge Musik ...")
    make_audio(WAV)
    print(f"Rendere {NFRAMES} Frames ({TOTAL:.1f}s) ...")
    cmd = ["ffmpeg", "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
           "-i", "-", "-i", WAV,
           "-c:v", "libx264", "-preset", "medium", "-crf", "20",
           "-pix_fmt", "yuv420p", "-profile:v", "high",
           "-c:a", "aac", "-b:a", "192k", "-shortest",
           "-movflags", "+faststart", OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for fi in range(NFRAMES):
        p.stdin.write(render(fi).tobytes())
        if fi % 150 == 0:
            print(f"  Frame {fi}/{NFRAMES}")
    p.stdin.close()
    p.wait()
    os.remove(WAV)
    print("Fertig:", OUT)


if __name__ == "__main__":
    main()
