import { slugify } from '@/data/options';

/** symbols for the default weather ids; custom entries have none */
export const WEATHER_ICON: Record<string, string> = {
  sonnig: '☀️',
  bewoelkt: '⛅',
  regen: '🌧️',
  frost: '❄️',
  schnee: '🌨️',
};

/** the symbol for a stored weather value (id, or an old text, which slugs to the same id) */
export function weatherIcon(stored: string | undefined): string | undefined {
  return stored ? WEATHER_ICON[slugify(stored)] : undefined;
}
