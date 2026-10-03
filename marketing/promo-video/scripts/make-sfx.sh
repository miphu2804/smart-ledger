#!/usr/bin/env bash
# Synthesizes simple ambience and Foley for Story30 with ffmpeg noise and sine sources.
# Nothing is downloaded. Output: public/audio/story/sfx/*.wav (48 kHz stereo).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/audio/story/sfx
mkdir -p "$OUT"
FF=(ffmpeg -hide_banner -loglevel error -y)
FMT=(-ar 48000 -ac 2)

# Room tone: low brown noise, 30 s.
"${FF[@]}" -f lavfi -i "anoisesrc=color=brown:amplitude=0.5:duration=30:seed=3" \
  -af "lowpass=f=320,highpass=f=40,volume=0.18" "${FMT[@]}" "$OUT/room-tone.wav"

# Shutter: metallic rattle that slows down, then a soft clunk as it locks open.
"${FF[@]}" -f lavfi -i "anoisesrc=color=white:amplitude=0.8:duration=3.2:seed=11" \
  -f lavfi -i "anoisesrc=color=brown:amplitude=0.9:duration=3.2:seed=12" \
  -f lavfi -i "aevalsrc=0.9*sin(2*PI*95*t)*exp(-9*t):s=48000:d=0.6" \
  -filter_complex "\
[0]bandpass=f=2600:width_type=h:w=2200,volume='0.55*(0.55+0.45*sin(2*PI*(26-5*t)*t))':eval=frame,afade=t=in:d=0.08,afade=t=out:st=2.3:d=0.8[r];\
[1]lowpass=f=420,volume='0.7*(0.5+0.5*sin(2*PI*13*t))':eval=frame,afade=t=in:d=0.1,afade=t=out:st=2.2:d=0.9[b];\
[2]adelay=2950|2950,apad=whole_dur=3.6[c];\
[r][b][c]amix=inputs=3:normalize=0,alimiter=limit=0.9" "${FMT[@]}" -t 3.6 "$OUT/shutter.wav"

# Motorbike pass-by: engine hum with a small Doppler drop, swelling in and out.
"${FF[@]}" -f lavfi -i "aevalsrc='(0.5*sin(2*PI*(78*t-7*log(cosh(1.6*(t-2.2))))) + 0.25*sin(4*PI*(78*t-7*log(cosh(1.6*(t-2.2)))))) * exp(-pow((t-2.2)/1.1,2))':s=48000:d=4.4" \
  -f lavfi -i "anoisesrc=color=pink:amplitude=0.6:duration=4.4:seed=21" \
  -filter_complex "[1]lowpass=f=900,volume='0.5*exp(-pow((t-2.2)/1.2,2))':eval=frame[n];[0][n]amix=inputs=2:normalize=0,lowpass=f=1800,volume=0.7" \
  "${FMT[@]}" "$OUT/motorbike.wav"

# Birds: short frequency-modulated chirps in loose pairs.
"${FF[@]}" -f lavfi -i "aevalsrc='0.22*sin(2*PI*3300*t+9*sin(2*PI*34*t))*(exp(-pow((mod(t,1.3)-0.12)/0.035,2))+exp(-pow((mod(t,1.3)-0.27)/0.03,2)))*(0.6+0.4*sin(2*PI*0.23*t))+0.15*sin(2*PI*4100*t+6*sin(2*PI*41*t))*exp(-pow((mod(t+0.55,2.1)-0.1)/0.03,2))':s=48000:d=6" \
  -af "highpass=f=1500,aecho=0.6:0.5:60:0.2" "${FMT[@]}" "$OUT/birds.wav"

# Pen on paper: band-passed noise with an irregular stroke rhythm.
"${FF[@]}" -f lavfi -i "anoisesrc=color=white:amplitude=0.7:duration=2.6:seed=31" \
  -af "highpass=f=1800,bandpass=f=4200:width_type=h:w=3000,volume='0.9*abs(sin(2*PI*5.3*t)*sin(2*PI*1.9*t+0.4))':eval=frame,afade=t=out:st=2.3:d=0.3" \
  "${FMT[@]}" "$OUT/pen.wav"

# Calculator key: a short plastic click.
"${FF[@]}" -f lavfi -i "anoisesrc=color=white:amplitude=0.9:duration=0.06:seed=41" \
  -f lavfi -i "aevalsrc=0.4*sin(2*PI*2200*t)*exp(-120*t):s=48000:d=0.06" \
  -filter_complex "[0]highpass=f=2500,volume='exp(-90*t)':eval=frame[a];[a][1]amix=inputs=2:normalize=0" \
  "${FMT[@]}" "$OUT/calc-click.wav"

# Paper note pressed onto metal: a soft tap.
"${FF[@]}" -f lavfi -i "anoisesrc=color=pink:amplitude=0.8:duration=0.2:seed=51" \
  -f lavfi -i "aevalsrc=0.5*sin(2*PI*210*t)*exp(-40*t):s=48000:d=0.2" \
  -filter_complex "[0]lowpass=f=1500,volume='exp(-35*t)':eval=frame[a];[a][1]amix=inputs=2:normalize=0" \
  "${FMT[@]}" "$OUT/paper-tap.wav"

# Night: faint crickets.
"${FF[@]}" -f lavfi -i "aevalsrc='0.06*sin(2*PI*4700*t)*gt(sin(2*PI*28*t),0)*gt(sin(2*PI*0.85*t),0)':s=48000:d=8" \
  -af "highpass=f=3000,lowpass=f=6000" "${FMT[@]}" "$OUT/crickets.wav"

ls -la "$OUT"
