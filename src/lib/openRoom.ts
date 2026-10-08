/**
 * The room open on screen right now, when it is not in the address (a room tapped in the
 * 3D view or in a plan). The capture button reads it, so a note taken while looking at a
 * room lands in that room. Set by the view that shows the room, cleared when it closes.
 */
let current: string | null = null;

export function setOpenRoom(id: string | null): void {
  current = id;
}

export function openRoom(): string | null {
  return current;
}
