# Verify fixtures

Small media files used by `scripts/verify.mjs` for the "Envie um arquivo" checks. Generated with ffmpeg (fake content, no real people):

```sh
ffmpeg -f lavfi -i "testsrc2=s=1920x1080:d=3:r=10" -f lavfi -i "sine=frequency=330:duration=3" \
  -c:v libvpx-vp9 -b:v 80k -c:a libopus -b:a 24k -shortest video-3s-1080p.webm
ffmpeg -f lavfi -i "color=c=0x3A2A1D:s=160x90:d=100:r=1" -f lavfi -i "anullsrc=r=48000:cl=mono" -t 100 \
  -c:v libvpx-vp9 -b:v 5k -c:a libopus -b:a 6k video-100s.webm
ffmpeg -f lavfi -i "testsrc2=s=3840x2160:d=2:r=10" -f lavfi -i "sine=frequency=330:duration=2" \
  -c:v libvpx-vp9 -b:v 300k -deadline realtime -cpu-used 8 -c:a libopus -b:a 24k -shortest video-2s-4k.webm
```

Audio fixtures are generated as WAV inside verify (the "voice" for the distortion check is 220 Hz with 10 harmonics), and so is the 3000×2000 photo. `demo-photo.png` (256×256, drawn on a canvas, no real person) is the first photo of the seeded message `demo-1`, put in the local R2 by verify.
