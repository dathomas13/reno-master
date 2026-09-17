/**
 * Text folding for the search index.
 *
 * Both the stored text and the query run through the same scanner, so what matters is
 * not that the result is pretty but that both sides fold the same way:
 *
 *   'Gartentür'   -> 'gartentur'      'gartentuer' -> 'gartentur'
 *   'Straße'      -> 'strase'         'strasse'    -> 'strase'
 *   '1.234,56 €'  -> '123456'         '1234,56'    -> '123456'
 *   '13.09.2026'  -> '13092026'       '13.09'      -> '1309'  (substring of the above)
 *
 * German compounds are the reason everything is matched as a substring later: whoever
 * types 'putz' means 'Innenputz' as well.
 *
 * The scanner is written once and returns the position map with it. A second
 * implementation without the map would drift from this one, and the map is what lets the
 * result list highlight the hit in the *original* text.
 */

const COMBINING = /[̀-ͯ]/g;

export interface Folded {
  /** the folded text: lower case, no diacritics, single spaces, no leading/trailing space */
  text: string;
  /** map[i] = index in the original string that produced folded character i */
  map: number[];
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

/**
 * The base letter of a character: 'ä' -> 'a', 'é' -> 'e', a combining mark -> ''.
 *
 * Plain a-z and 0-9 take the shortcut - they are almost everything, and `normalize('NFD')`
 * on every single character is what made folding a whole diary noticeable on the phone.
 */
function base(char: string): string {
  const code = char.charCodeAt(0);
  if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) return char;
  if (code < 128) return char;
  if (char === 'ß') return 'ss';
  return char.normalize('NFD').replace(COMBINING, '');
}

/**
 * Folds a string and records where every character came from.
 *
 * Rules, in the order the scanner applies them:
 *  - lower case, diacritics dropped ('ä' -> 'a')
 *  - 'ae', 'oe', 'ue' collapse to their vowel, 'ß' and 'ss' collapse to 's'
 *  - '.' and ',' between two digits vanish, so amounts and dates become one token
 *  - everything else that is not a letter or a digit becomes a single space
 */
export function fold(input: string): Folded {
  const lower = input.toLowerCase();
  const out: string[] = [];
  const map: number[] = [];
  // the folded characters of the current source position, re-filled on every step
  let pending = '';

  for (let i = 0; i < lower.length; i += 1) {
    const char = lower[i];
    pending = base(char);

    if (pending === '') continue; // a combining mark, already folded into its letter

    const code = pending.charCodeAt(0);
    const letter = code >= 97 && code <= 122;

    if (isDigit(code)) {
      out.push(pending);
      map.push(i);
      continue;
    }

    if (!letter) {
      // a separator between two digits inside a number disappears instead of splitting it
      if ((char === '.' || char === ',') && isDigit(lower.charCodeAt(i + 1))) {
        const previous = out[out.length - 1];
        if (previous && isDigit(previous.charCodeAt(0))) continue;
      }
      if (out.length && out[out.length - 1] !== ' ') {
        out.push(' ');
        map.push(i);
      }
      continue;
    }

    // 'ss' (also from 'ß') folds to a single 's'
    if (pending === 'ss') {
      if (out[out.length - 1] !== 's') {
        out.push('s');
        map.push(i);
      }
      continue;
    }
    if (pending === 's' && out[out.length - 1] === 's') continue;

    // 'ae', 'oe', 'ue' fold to the bare vowel; the same happens to 'ä', 'ö', 'ü' above.
    // The next character is folded first, so an accented 'é' counts as the 'e' it is.
    if (
      (pending === 'a' || pending === 'o' || pending === 'u') &&
      i + 1 < lower.length &&
      base(lower[i + 1]) === 'e'
    ) {
      out.push(pending);
      map.push(i);
      i += 1;
      continue;
    }

    out.push(pending);
    map.push(i);
  }

  while (out.length && out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }

  return { text: out.join(''), map };
}

/** the folded text without the position map */
export function normalize(input: string): string {
  return fold(input).text;
}

/** the query split into the words that all have to match */
export function terms(query: string): string[] {
  return normalize(query).split(' ').filter(Boolean);
}
