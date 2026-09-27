// A few hand-checked GIFs for short, friendly replies ("okay", "yes", "haha").
// Each one was looked at frame by frame: nothing sarcastic, nothing that reads as mocking.
export const GIFS = {
  ok: ["3oz8xQQP4ahKiyuxHy", "OE6FE4GZF78nm", "111ebonMs90YLu", "BYoRqTmcgzHcL9TCy1"], // "sounds good to me" cat, han solo thumbs up, kid thumbs up, baby thumbs up
  on_it: ["GEbJInD9agAMnF1yZq"], // "I'M ON IT"
  nice: ["yJFeycRK2DB4c"], // "noice"
  yes: ["l1J9N8zrmYCfSrQFq"], // "YES"
  no: ["spfi6nabVuq5y"], // "no way"
  lol: ["GpyS1lJXJYupG", "ZqlvCTNHpqrio"], // laughing
} as const;

export type GifMood = keyof typeof GIFS;
export const GIF_MOODS = Object.keys(GIFS) as GifMood[];

export const gifUrl = (id: string) => `https://media.giphy.com/media/${id}/200.gif`;

// Rare on purpose: a gif lands when it's the exception, not the style.
export const GIF_MIN_GAP = 8; // agent messages between gifs
