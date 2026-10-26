import { String as Str, pipe } from "effect";

const BASE_PATH = pipe(import.meta.env.BASE_URL, Str.replace(/\/$/u, ""));

export { BASE_PATH };
