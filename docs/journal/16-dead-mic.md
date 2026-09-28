# 16. dead mic

*sept 27, 2026*

the worst call is the one where you're talking and nobody hears you. the agent thinks you went quiet, checks in after 20 seconds, and you're sitting there saying "hello? hello?" into a mic that's muted in the os, or pointed at a headset you took off an hour ago. from your side it looks like the agent is ignoring you, which is the one thing it should never feel like.

## telling dead from quiet

a quiet room is not silent. even with noise suppression on, a live mic has a noise floor: fans, breath, the preamp hiss. a mic that's really gone (os mute, privacy switch, wrong device, unplugged) sends true digital zeros. so the call keeps one analyser on the mic and checks the level every 100ms. if nothing gets above about -80 dbfs (rms 1e-4) for 4 seconds straight, that's not a quiet person, that's no signal.

it also listens to the track itself: the browser says "mute" when the os stops sending audio and "ended" when the device goes away. either one counts right away. when sound comes back, the prompt goes away on its own.

## what that got wrong

the first version fired on people who were just being quiet. the analyser was reading the call's own stream, the one with echo cancelling, noise suppression and auto gain turned on. in a quiet room chrome's noise suppression does its job too well: it gates the floor down to nothing, and after the 16 bit step (about 3e-5) that is exact zeros. so rms under 1e-4 for 4 seconds was true for a working mic and a person thinking. the thing i called "no signal" was really "the cleanup ate the signal".

now zeros on the processed stream only mean "go check". the rules:

- the track ended: dead, right away.
- the track says muted and stays muted for 4 seconds: dead. a blip of mute while the os switches something is not.
- the processed stream is exact zeros (peak under 1e-6, not an rms) for 4 seconds: open a second, raw capture of the same mic with all the processing off, and listen for about a second. a live mic always has some hiss on the raw side. if the raw side hears anything, it's a quiet person, and it doesn't check again for 30 seconds. only if the raw side is zeros too is the mic dead. if the raw capture can't open, it doesn't nag.

quiet is left to the silence timer, which checks in and eventually offers to hang up. the mic prompt is only for a mic that sends nothing.

muting yourself in the call is different. that's on purpose, so the check pauses while you're muted and starts over when you unmute. it never nags you about a mic you switched off.

## what it asks

a small card on the call screen: "can't hear you. switch mic or text instead?" it doesn't block anything. you can pick another mic from the list and it swaps in place, the call keeps going, or tap "switch to text" and the call hangs up and you're back in the thread. if you ignore it and it was a false alarm, the next sound clears it.

this follows the same rule as the rest of the call: when something breaks, say so plainly and offer the next step (nielsen's heuristic 9, help users recognize, diagnose, and recover from errors). a silent failure that you have to debug yourself is the worst version.

## following the os

plugging in airpods mid call used to leave the call on the laptop mic, or worse, on a device that just vanished. now the call listens for device changes. if the mic it's using disappears, or the os default moves and you never picked one yourself, it grabs the new one with the same settings, rewires everything that was listening to the old one (the transcription stream, the level check, mute), stops the old mic, and shows "switched to airpods" for a couple of seconds. if you picked a mic on purpose, it stays on that one until it's gone.

one audio context per call, closed on hangup, every listener removed. nothing about turn taking, barge in, fillers or the silence timings changed.

## known gaps

- with deepgram, a swap opens a fresh session on the new mic and closes the old one once the new one is up. one socket, one recording, so deepgram never sees a second audio header mid stream and its clock starts at the new session. if the new session can't open, the call falls back to browser speech. there's a short overlap where both sockets are open, and i haven't run it against the real service yet.
- the raw check opens the same mic a second time with different processing. chrome allows that, but i haven't confirmed on real hardware it never nudges the call's own echo cancelling for that second. it only runs after 4 seconds of exact zeros, at most every 30 seconds.
- the browser speech fallback uses its own mic (the system default), so picking a mic there changes what the level check hears, not what the recognizer hears.

## sources

- nielsen norman group, "10 usability heuristics for user interface design", heuristic 9 (nielsen, 1994).
- w3c, *media capture and streams*: track mute, unmute and ended events, and devicechange.
- w3c, *web audio api*: analysernode.
