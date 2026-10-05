/** symbols for the default weather ids; custom entries have none */
export const WEATHER_ICON: Record<string, string> = {
  sonnig: '☀️',
  bewoelkt: '⛅',
  regen: '🌧️',
  frost: '❄️',
  schnee: '🌨️',
};

/** the symbol for a stored weather id */
export function weatherIcon(stored: string | undefined): string | undefined {
  return stored ? WEATHER_ICON[stored] : undefined;
}
