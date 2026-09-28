# 16. dead mic

*sept 27, 2026*

the worst call is the one where you're talking and nobody hears you. the agent thinks you went quiet, checks in after 20 seconds, and you're sitting there saying "hello? hello?" into a mic that's muted in the os, or pointed at a headset you took off an hour ago. from your side it looks like the agent is ignoring you, which is the one thing it should never feel like.

## telling dead from quiet

a quiet room is not silent. even with noise suppression on, a live mic has a noise floor: fans, breath, the preamp hiss. a mic that's really gone (os mute, privacy switch, wrong device, unplugged) sends true digital zeros. so the call keeps one analyser on the mic and checks the level every 100ms. if nothing gets above about -80 dbfs (rms 1e-4) for 4 seconds straight, that's not a quiet person, that's no signal.

it also listens to the track itself: the browser says "mute" when the os stops sending audio and "ended" when the device goes away. either one counts right away. when sound comes back, the prompt goes away on its own.

muting yourself in the call is different. that's on purpose, so the check pauses while you're muted and starts over when you unmute. it never nags you about a mic you switched off.

## what it asks

a small card on the call screen: "can't hear you. switch mic or text instead?" it doesn't block anything. you can pick another mic from the list and it swaps in place, the call keeps going, or tap "switch to text" and the call hangs up and you're back in the thread. if you ignore it and it was a false alarm, the next sound clears it.

this follows the same rule as the rest of the call: when something breaks, say so plainly and offer the next step (nielsen's heuristic 9, help users recognize, diagnose, and recover from errors). a silent failure that you have to debug yourself is the worst version.

## following the os

plugging in airpods mid call used to leave the call on the laptop mic, or worse, on a device that just vanished. now the call listens for device changes. if the mic it's using disappears, or the os default moves and you never picked one yourself, it grabs the new one with the same settings, rewires everything that was listening to the old one (the transcription stream, the level check, mute), stops the old mic, and shows "switched to airpods" for a couple of seconds. if you picked a mic on purpose, it stays on that one until it's gone.

one audio context per call, closed on hangup, every listener removed. nothing about turn taking, barge in, fillers or the silence timings changed.

## known gaps

- with deepgram, a swap restarts the recorder on the same socket, so a second webm header goes down the wire. if deepgram doesn't like that and closes, the call already falls back to browser speech, but i haven't seen it against the real service yet.
- deepgram's timestamps drift by the length of the swap gap (a few hundred ms), which only matters for echo timing right after a switch.
- the browser speech fallback uses its own mic (the system default), so picking a mic there changes what the level check hears, not what the recognizer hears.

## sources

- nielsen norman group, "10 usability heuristics for user interface design", heuristic 9 (nielsen, 1994).
- w3c, *media capture and streams*: track mute, unmute and ended events, and devicechange.
- w3c, *web audio api*: analysernode.
