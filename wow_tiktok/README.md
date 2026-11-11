# WoW-TikTok-Videos

## v2 (empfohlen): `wow_fakten_v2.mp4`
Komplett animiert: Fantasy-Landschaft mit Parallax und Drache, Seuchen-Simulation, Charge durch einen Dungeon-Gang,
Zahlen-Counter mit Münzregen, Hinterhalt bei der Trauerfeier, Zeitreise-Tunnel. Dazu Wort-für-Wort-Untertitel im TikTok-Stil,
deutsche Sprecherstimme, epische Musik mit Impacts und Whooshes.

- `wow_fakten_v2.mp4`: mit Sprecherstimme (Piper-TTS)
- `wow_fakten_v2_ohne_stimme.mp4`: nur Musik und SFX, falls du selbst einsprechen oder einen TikTok-Sound nutzen willst
- 1080×1920, 30 fps, ~41 s, −14 LUFS

**Neu bauen:** in `v2/` erst `npm install`, dann `python3 build.py --voice de-thorsten-low.onnx`
(Stimme: https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-de-thorsten-low.tar.gz, benötigt `pip install piper-tts numpy scipy`).
Texte stehen in `build.py` (SCRIPT), die Animationen in `index.html`.

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
