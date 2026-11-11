# WoW-TikTok-Videos

## v3 (empfohlen): `wow_fakten_v3_3d.mp4`
Alle Szenen in echtem 3D (three.js): Burg am See mit Drache, Stadtplatz mit Seuche, Dungeon-Gang mit Held,
Brutstätte mit Drachenschwarm, Menschenmeer mit Fackeln, Trauerfeier am Seeufer, Zeittunnel und Wohnzimmer.
Mit Licht, Schatten, Nebel, Bloom und Kamerafahrten. Untertitel, Stimme und Musik wie in v2.

- `wow_fakten_v3_3d.mp4`: mit Sprecherstimme
- `wow_fakten_v3_3d_ohne_stimme.mp4`: nur Musik und SFX
- 1080×1920, 30 fps, ~41 s

**Neu bauen:** in `v2/` erst `npm install`, dann `python3 build.py --voice de-thorsten-low.onnx`
(Stimme: https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-de-thorsten-low.tar.gz, benötigt `pip install piper-tts numpy scipy`).
Texte stehen in `build.py` (SCRIPT), die 3D-Szenen in `scene3d.js`, Untertitel und Einblendungen in `index.html`.

## v2: `wow_fakten_v2.mp4`
Die 2D-Fassung (flach gezeichnete Szenen), ebenfalls mit und ohne Stimme. Der Code in `v2/` erzeugt inzwischen v3.

## v1: `wow_fakten_tiktok.mp4`
Einfache Textfolien (Generator: `make_video.py`).

- **Datei:** `wow_fakten_tiktok.mp4` (1080×1920, 9:16, 30 fps, ~30,6 s, H.264 + AAC)
- **Neu erzeugen:** `python3 make_video.py` (braucht numpy, Pillow, ffmpeg)
- Grafik und Musik werden komplett per Code erzeugt, es gibt also keine Copyright-Probleme mit Ingame-Material oder Musik.

## Caption (zum Kopieren)
> Fakt #1 ist komplett wild 🤯 Welchen kanntest du schon? #wow #worldofwarcraft #gaming #gamingfacts #mmorpg #fyp #fürdich #leeroyjenkins #nostalgie

## Tipps fürs Posten
- Posten zur Hauptzeit (ca. 18 bis 21 Uhr).
- Einen **Trending-Sound** mit niedriger Lautstärke (5–10 %) unter die Musik legen. Das hilft beim Algorithmus.
- Die ersten Kommentare selbst beantworten (z. B. „Teil 2 kommt morgen!“), damit die Interaktion steigt.
- Die Texte bleiben außerhalb der Zonen, die von der TikTok-Oberfläche verdeckt werden (unten und rechts).
