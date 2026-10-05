import type { Contact } from './types';

/** the stored role ids of a contact */
export function contactRoleNames(contact: Pick<Contact, 'roles'>): string[] {
  return contact.roles ?? [];
}

/** the roles of a contact as display texts; `label` turns a stored id into its name */
export function contactRoleLabels(contact: Pick<Contact, 'roles'>, label: (stored: string) => string): string[] {
  return contactRoleNames(contact).map(label);
}
