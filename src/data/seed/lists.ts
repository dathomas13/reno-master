import type { Lists } from '@/data/types';

/** editable pick lists; seeded from what the project already used */
export const SEED_LISTS: Lists = {
  people: [
    'Thomas', 'Sarah', 'Wolfgang', 'Christine', 'Laura', 'Matze', 'Julia', 'Tom',
    'Jonas', 'Joni', 'Andre', 'Peter', 'Hannes', 'Robert', 'Sabi', 'Handwerker',
  ],
  weather: ['Sonnig', 'Bewölkt', 'Regen', 'Frost', 'Schnee'],
  costCategories: [
    'Material allgemein', 'Werkzeug', 'Baustellenequipment', 'Abriss/Entsorgung',
    'Keller', 'Dach', 'Außendämmung/Fassade', 'Fenster', 'Elektrik', 'Sanitär',
    'Wärmepumpe', 'Heizungsmontage', 'Fußbodenheizung', 'Lüftungsanlage', 'Estrich',
    'Innenausbau', 'Bäder', 'Küche', 'PV-Anlage', 'Energieberater/Baubegleitung',
    'Verpflegung Helfer', 'Gebühren/Abgaben', 'Sonstiges',
  ],
  taskAreas: [
    'Planung', 'Organisation', 'Rückbau', 'Keller', 'Gebäudehülle', 'Dach', 'Fenster',
    'Fassade', 'Heizung', 'Elektrik', 'Sanitär', 'PV', 'Innenausbau', 'Finanzen',
    'Förderung', 'Energieberatung', 'Versicherung', 'Behörden', 'Kauf',
  ],
  contactRoles: [
    'Energieberater (iSFP)', 'Statiker', 'Dachdecker', 'Heizungsbauer', 'Elektriker',
    'Fensterbauer', 'Sanitär', 'Trockenbauer', 'Estrichleger', 'Fliesenleger', 'Maler',
    'PV-Installateur', 'Baustoffhandel', 'Notar', 'Bank/Finanzierung', 'Immobilienmaklerin',
  ],
};
