#!/usr/bin/env python3
"""Baut das animierte WoW-TikTok-Video (v2).

Ablauf:
  1. Sprecherstimme pro Satz mit Piper-TTS erzeugen
  2. Timeline (Szenen, Wort-Timings, Events) berechnen -> timeline.json
  3. Frames im Browser-Canvas rendern (render.js / index.html, Playwright)
  4. Musik + Soundeffekte synthetisieren, mit Stimme mischen
  5. Muxen -> wow_fakten_v2.mp4 (mit Stimme) und wow_fakten_v2_ohne_stimme.mp4

Aufruf: python3 build.py --voice /pfad/de-thorsten-low.onnx
"""
import argparse
import json
import os
import re
import subprocess
import wave

import numpy as np
from scipy.signal import butter, lfilter, sosfilt

HERE = os.path.dirname(os.path.abspath(__file__))
TMP = os.path.join(HERE, "_build")
SR = 44100
FPS = 30

# --------------------------------------------------------------------- Drehbuch
# (Anzeige-Text, gesprochener Text). *Wort* = hervorgehoben.
SCRIPT = [
    ("hook", [
        ("Diese *WoW*-Fakten klingen *erfunden*…", "Diese Wau Fakten klingen erfunden."),
        ("…aber sie sind *alle* wahr.", "Aber sie sind alle wahr."),
    ], {"erf": "erfunden"}),
    ("plague", [
        ("2005 brach in WoW eine echte *Seuche* aus.",
         "Zweitausendfünf brach in Wau eine echte Seuche aus."),
        ("Ganze Hauptstädte lagen voller *Leichen*.",
         "Ganze Hauptstädte lagen voller Leichen."),
        ("Forscher nutzen sie bis heute als *Pandemie-Modell*.",
         "Forscher nutzen sie bis heute als Pandemie Modell."),
    ], {"leichen": "leichen", "forscher": "forscher"}),
    ("leeroy", [
        ("Ein Spieler rannte einfach los:", "Ein Spieler rannte einfach los:"),
        ("*LEEROY* *JENKINS!*", "Lieroi Dschenkins!"),
        ("Seine Gruppe? *Ausgelöscht.*", "Seine Gruppe? Ausgelöscht."),
        ("Und das Internet hatte eines seiner ersten *Memes*.",
         "Und das Internet hatte eines seiner ersten Miems."),
    ], {"leeroy": "leeroy", "gruppe": "seine", "wipe": "ausgelöscht", "meme": "und"}),
    ("subs", [
        ("2010 zahlten über *12 Millionen* Menschen für WoW.",
         "Zweitausendzehn zahlten über zwölf Millionen Menschen für Wau."),
        ("Mehr als Belgien damals *Einwohner* hatte.",
         "Mehr als Belgien damals Einwohner hatte."),
    ], {"belgien": "mehr"}),
    ("funeral", [
        ("Spieler trauerten im Spiel um eine *echte* verstorbene Mitspielerin.",
         "Spieler trauerten im Spiel um eine echte, verstorbene Mitspielerin."),
        ("Dann stürmte eine feindliche Gilde die *Trauerfeier*.",
         "Dann stürmte eine feindliche Gilde die Trauerfeier!"),
    ], {"attack": "dann"}),
    ("years", [
        ("WoW läuft seit über *20 Jahren*.", "Wau läuft seit über zwanzig Jahren."),
        ("Wer damals gezockt hat, zockt heute mit seinen *Kindern*.",
         "Wer damals gezockt hat, zockt heute mit seinen Kindern."),
    ], {"kids": "wer"}),
    ("outro", [
        ("Welcher Fakt war *neu* für dich?", "Welcher Fakt war neu für dich?"),
        ("Schreib's in die Kommentare –", "Schreibs in die Kommentare,"),
        ("und folg für *Teil 2*!", "und folg für Teil zwei!"),
    ], {"follow": "und"}),
]

LEAD_IN = 0.35      # Pause vor der Stimme am Szenenanfang
SENT_GAP = 0.12     # Pause zwischen Sätzen
TAIL = 0.45         # Pause am Szenenende
LENGTH_SCALE = 0.86  # < 1 = schnelleres Sprechen (TikTok-Tempo)


def norm(w):
    return re.sub(r"[^a-zäöüß0-9]", "", w.lower())


def read_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        if w.getnchannels() == 2:
            a = a.reshape(-1, 2).mean(1)
    return a, sr


def resample(a, sr_in, sr_out):
    n = int(len(a) * sr_out / sr_in)
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32)


def trim(a, thr=0.012):
    idx = np.where(np.abs(a) > thr)[0]
    if len(idx) == 0:
        return a
    s, e = max(0, idx[0] - int(0.02 * SR)), min(len(a), idx[-1] + int(0.06 * SR))
    return a[s:e]


def tts(text, out, model):
    subprocess.run(["python3", "-m", "piper", "-m", model, "-f", out,
                    "--length-scale", str(LENGTH_SCALE)],
                   input=text.encode(), check=True, capture_output=True)


# --------------------------------------------------------------------- Timeline
def build_timeline(model):
    os.makedirs(TMP, exist_ok=True)
    scenes, voice_track = [], []
    t = 0.0
    for si, (key, lines, evdef) in enumerate(SCRIPT):
        st = t
        cur = t + LEAD_IN
        words = []
        for li, (disp, spoken) in enumerate(lines):
            wav = os.path.join(TMP, f"v_{si}_{li}.wav")
            tts(spoken, wav, model)
            a, sr = read_wav(wav)
            a = trim(resample(a, sr, SR))
            dur = len(a) / SR
            voice_track.append((cur, a))
            toks = disp.split()
            weights = [len(norm(x)) + 2 + (3 if x.endswith((",", ".", "?", "!", ":", "…", "–")) else 0)
                       for x in toks]
            tot = sum(weights)
            acc = cur
            for tok, wgt in zip(toks, weights):
                wd = dur * wgt / tot
                emph = "*" in tok
                words.append({"w": tok.replace("*", ""), "t0": round(acc, 3),
                              "t1": round(acc + wd, 3), "emph": emph,
                              "line": li, "end": tok.endswith((".", "?", "!", ":", "…", "–", ","))})
                acc += wd
            cur += dur + SENT_GAP
        end = cur - SENT_GAP + TAIL
        ev = {}
        for name, key_word in evdef.items():
            # erstes passendes Wort ab Zeile mit passendem Inhalt
            cands = [w for w in words if norm(w["w"]).startswith(key_word)]
            if name in ("meme", "follow"):
                cands = cands[-1:]
            ev[name] = cands[0]["t0"] if cands else st
        scenes.append({"key": key, "start": round(st, 3), "dur": round(end - st, 3),
                       "words": words, "ev": ev})
        t = end
    total = round(t + 0.2, 3)
    tl = {"fps": FPS, "total": total, "scenes": scenes}
    with open(os.path.join(HERE, "timeline.json"), "w") as f:
        json.dump(tl, f, ensure_ascii=False, indent=1)
    return tl, voice_track


# --------------------------------------------------------------------- Musik & SFX
def midi(m):
    return 440 * 2 ** ((m - 69) / 12)


def saw(f, t):
    return 2 * ((f * t) % 1) - 1


def lowpass(x, fc, order=2):
    sos = butter(order, fc / (SR / 2), btype="low", output="sos")
    return sosfilt(sos, x)


def highpass(x, fc, order=2):
    sos = butter(order, fc / (SR / 2), btype="high", output="sos")
    return sosfilt(sos, x)


def add(buf, start, sig, gain=1.0):
    s = int(start * SR)
    if s >= len(buf):
        return
    if s < 0:
        sig, s = sig[-s:], 0
    e = min(len(buf), s + len(sig))
    buf[s:e] += gain * sig[:e - s]


def make_music(tl):
    total = tl["total"]
    n = int(total * SR)
    rng = np.random.default_rng(3)
    pad = np.zeros(n)
    bass = np.zeros(n)
    drums = np.zeros(n)
    sfx = np.zeros(n)

    bpm = 112
    beat = 60 / bpm
    bar = 4 * beat
    prog = [(50, 57, 62, 65), (46, 53, 58, 62), (41, 48, 53, 57), (48, 55, 60, 64)]  # Dm Bb F C

    t = np.arange(n) / SR
    for k in range(int(total / bar) + 1):
        ch = prog[k % 4]
        s0, s1 = int(k * bar * SR), min(n, int((k + 1) * bar * SR))
        if s0 >= n:
            break
        tt = t[s0:s1] - k * bar
        env = np.minimum(1, tt / 0.08) * np.minimum(1, (bar - tt) / 0.08)
        seg = np.zeros(len(tt))
        for m in ch:
            f = midi(m)
            for det in (-0.12, 0, 0.11):
                seg += saw(f * 2 ** (det / 12), tt + rng.random())
        pad[s0:s1] += 0.035 * env * seg
        # Bass-Ostinato in Achteln
        root = midi(ch[0] - 12)
        for e8 in range(8):
            bs = s0 + int(e8 * beat / 2 * SR)
            L = int(beat / 2 * SR * 0.9)
            if bs >= n:
                break
            tb = np.arange(min(L, n - bs)) / SR
            f = root * (2 if e8 in (3, 7) else 1)
            bass[bs:bs + len(tb)] += 0.22 * saw(f, tb) * np.exp(-tb * 5)
    pad = lowpass(pad, 1800)
    bass = lowpass(bass, 420)

    def kick():
        L = int(0.45 * SR)
        tt = np.arange(L) / SR
        f = 150 * np.exp(-tt * 18) + 45
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 6)

    def taiko():
        L = int(0.8 * SR)
        tt = np.arange(L) / SR
        f = 90 * np.exp(-tt * 9) + 55
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 4.5)
        slap = lowpass(rng.standard_normal(L), 1500) * np.exp(-tt * 30)
        return body + 0.5 * slap

    def snare():
        L = int(0.35 * SR)
        tt = np.arange(L) / SR
        nz = highpass(rng.standard_normal(L), 900) * np.exp(-tt * 14)
        return 0.6 * nz + 0.5 * np.sin(2 * np.pi * 190 * tt) * np.exp(-tt * 25)

    K, TK, SN = kick(), taiko(), snare()
    for i in range(int(total / beat) + 1):
        tb = i * beat
        add(drums, tb, K, 0.55)
        if i % 4 == 2:
            add(drums, tb, SN, 0.35)
        if i % 8 in (0, 3, 6):
            add(drums, tb + (beat / 2 if i % 8 == 3 else 0), TK, 0.3)
        # Hi-Hat
        hh = highpass(rng.standard_normal(int(0.05 * SR)), 7000) * np.exp(-np.arange(int(0.05 * SR)) / SR * 80)
        add(drums, tb + beat / 2, hh, 0.12)

    # Dynamik: Trauerfeier-Szene ruhig bis zum Angriff
    gain_drums = np.ones(n)
    gain_bass = np.ones(n)
    for sc in tl["scenes"]:
        if sc["key"] == "funeral":
            a, b = int(sc["start"] * SR), int(sc["ev"]["attack"] * SR)
            gain_drums[a:b] = 0.0
            gain_bass[a:b] = 0.15
        if sc["key"] == "hook":
            gain_drums[:int(sc["ev"]["erf"] * SR)] = 0.4

    gain_drums = lowpass(gain_drums, 30, 1)
    gain_bass = lowpass(gain_bass, 30, 1)
    drums *= gain_drums
    bass *= gain_bass

    # SFX: Whoosh vor jedem Schnitt, Impact auf Schnitt & Events
    def riser(L):
        tt = np.arange(int(L * SR)) / SR
        nz = rng.standard_normal(len(tt))
        out = np.zeros(len(tt))
        steps = 12
        for k in range(steps):
            a, b = k * len(tt) // steps, (k + 1) * len(tt) // steps
            fc = 300 + 7000 * (k / steps) ** 2
            out[a:b] = lowpass(nz[a:b], fc)
        return out * (tt / L) ** 2

    def impact():
        L = int(1.6 * SR)
        tt = np.arange(L) / SR
        f = 70 * np.exp(-tt * 4) + 32
        boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.5)
        crash = highpass(rng.standard_normal(L), 2500) * np.exp(-tt * 5)
        return boom + 0.25 * crash

    def whoosh():
        L = int(0.4 * SR)
        tt = np.arange(L) / SR
        env = np.sin(np.pi * tt / 0.4) ** 2
        return lowpass(rng.standard_normal(L), 2500) * env

    IMP, WH = impact(), whoosh()
    cuts = [s["start"] for s in tl["scenes"]]
    for c in cuts:
        if c > 0.1:
            add(sfx, c - 0.9, riser(0.9), 0.25)
        add(sfx, c, IMP, 0.7)
        add(sfx, c - 0.15, WH, 0.35)
    for sc in tl["scenes"]:
        for name, et in sc["ev"].items():
            if name in ("erf", "leeroy", "wipe", "attack", "belgien"):
                add(sfx, et, IMP, 0.55)
    # Herzschlag / Tick bei der Seuche
    for sc in tl["scenes"]:
        if sc["key"] == "years":
            for k in range(14):
                tick = np.sin(2 * np.pi * 2200 * np.arange(int(0.03 * SR)) / SR) * np.exp(-np.arange(int(0.03 * SR)) / SR * 150)
                add(sfx, sc["start"] + 0.25 + k * 0.13, tick, 0.18)

    music = pad + bass + 0.9 * drums
    # Ende ausblenden
    fade = np.minimum(1, t / 0.02) * np.minimum(1, (total - t) / 0.6)
    return music * fade, sfx * fade


def mix(tl, voice_track, with_voice):
    n = int(tl["total"] * SR)
    voice = np.zeros(n)
    for st, a in voice_track:
        add(voice, st, a, 1.0)
    voice = highpass(voice, 90)
    music, sfx = make_music(tl)
    music /= np.max(np.abs(music)) + 1e-9
    sfx /= np.max(np.abs(sfx)) + 1e-9
    if with_voice:
        env = lowpass(np.abs(voice), 6, 1)
        env = env / (env.max() + 1e-9)
        duck = 1 - 0.55 * np.clip(env * 3, 0, 1)
        out = 0.42 * music * duck + 0.38 * sfx + 0.95 * voice / (np.max(np.abs(voice)) + 1e-9)
    else:
        out = 0.6 * music + 0.45 * sfx
    out = np.tanh(out * 1.3) / np.tanh(1.3)
    out = out / np.max(np.abs(out)) * 0.93
    return out


def write_wav(path, a):
    pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16)
    st = np.repeat(pcm[:, None], 2, axis=1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(st.tobytes())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True, help="Piper .onnx Stimmenmodell (de)")
    ap.add_argument("--skip-render", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    print("1/4 Stimme + Timeline ...")
    tl, vt = build_timeline(args.voice)
    print(f"    Gesamtdauer {tl['total']:.1f}s")

    video = os.path.join(TMP, "video.mp4")
    if not args.skip_render:
        print("2/4 Frames rendern ...")
        subprocess.run(["node", os.path.join(HERE, "render.js"), video, str(args.workers)],
                       check=True)

    print("3/4 Audio mischen ...")
    for with_voice, name in ((True, "wow_fakten_v2.mp4"), (False, "wow_fakten_v2_ohne_stimme.mp4")):
        wav = os.path.join(TMP, f"audio_{int(with_voice)}.wav")
        write_wav(wav, mix(tl, vt, with_voice))
        print(f"4/4 Muxen -> {name}")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-i", wav,
                        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest",
                        "-movflags", "+faststart", os.path.join(HERE, "..", name)], check=True)
    print("Fertig.")


if __name__ == "__main__":
    main()
