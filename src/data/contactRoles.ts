import type { Contact } from './types';

/**
 * The roles of a contact, old or new shape. Contacts saved before the role picker became
 * multi-select only carry the legacy `role` string; everything written since carries
 * `roles`. Reading through this one function means the two shapes never have to be told
 * apart anywhere else.
 */
export function contactRoleNames(contact: Contact): string[] {
  if (contact.roles?.length) return contact.roles;
  return contact.role ? [contact.role] : [];
}
