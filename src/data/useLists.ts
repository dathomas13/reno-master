import { useDocument } from './hooks';
import { COL, type Lists } from './types';
import { SEED_LISTS } from './seed/lists';
import { patchDoc } from '@/firebase/db';

/** the editable pick lists, falling back to the seed when the document is not there yet */
export function useLists(): { lists: Lists; addTo(key: keyof Lists, value: string): Promise<void> } {
  const { data } = useDocument<Lists>(COL.meta, 'lists');
  const lists: Lists = {
    people: data?.people?.length ? data.people : SEED_LISTS.people,
    weather: data?.weather?.length ? data.weather : SEED_LISTS.weather,
    costCategories: data?.costCategories?.length ? data.costCategories : SEED_LISTS.costCategories,
    taskAreas: data?.taskAreas?.length ? data.taskAreas : SEED_LISTS.taskAreas,
    contactRoles: data?.contactRoles?.length ? data.contactRoles : SEED_LISTS.contactRoles,
  };

  async function addTo(key: keyof Lists, value: string): Promise<void> {
    const trimmed = value.trim();
    if (!trimmed || lists[key].includes(trimmed)) return;
    await patchDoc(COL.meta, 'lists', { ...lists, [key]: [...lists[key], trimmed] });
  }

  return { lists, addTo };
}
