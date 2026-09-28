// turn-end classifier: unfinished-sounding speech waits long, finished speech answers fast.
// run: npx tsx scripts/turn-end.ts
import { TURN_END_COMPLETE_MS, TURN_END_FAST_MS, TURN_END_MIDPHRASE_MS, turnEndDelay } from "../src/app/chat/turnEnd";

let fails = 0;
const check = (name: string, got: number, want: number) => {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}  (${got}ms, want ${want})`);
  if (!ok) fails++;
};

// the prod split: "...so i'm just" -> reply -> "curious."
check("so i'm just (deepgram)", turnEndDelay("You said you'd tell me about setup, so I'm just", true, true), TURN_END_MIDPHRASE_MS);
check("so i'm just (web speech)", turnEndDelay("so i'm just"), TURN_END_MIDPHRASE_MS);
check("so i'm just. (pause read as a full stop)", turnEndDelay("so I'm just.", true, true), TURN_END_MIDPHRASE_MS);
check("that's all. (deepgram, speech_final)", turnEndDelay("that's all.", true, true), TURN_END_FAST_MS);
check("that's all. (no speech_final)", turnEndDelay("that's all.", false, true), TURN_END_COMPLETE_MS);
check("that's all (web speech, no punctuation)", turnEndDelay("that's all"), TURN_END_COMPLETE_MS);
check("no full stop from smart_format", turnEndDelay("I wanted to ask", true, true), TURN_END_MIDPHRASE_MS);
check("question ending in a trailing word", turnEndDelay("what is it about?", true, true), TURN_END_FAST_MS);
check("i think", turnEndDelay("it's fine i think", false, false), TURN_END_MIDPHRASE_MS);
check("filler um", turnEndDelay("my name is um", false, false), TURN_END_MIDPHRASE_MS);
check("comma", turnEndDelay("okay,", true, true), TURN_END_MIDPHRASE_MS);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
