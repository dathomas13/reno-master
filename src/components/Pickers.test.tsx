import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRoomNaming } from '@/data/roomNaming';
import { RoomPicker } from './Pickers';

// Heizung and Öllager merged into Technikraum - the same fixture as roomNaming.test.ts
const ist = [
  { id: 'kg-heizung', name: 'Heizung', floor: 'KG', rects: [], areaM2: 6.17 },
  { id: 'kg-oellager', name: 'Öllager', floor: 'KG', rects: [], areaM2: 10.48 },
  { id: 'kg-wohnzimmer', name: 'Wohnzimmer', floor: 'KG', rects: [], areaM2: 24 },
];
const soll = [{ id: 'kg-technik', name: 'Technikraum', floor: 'KG', rects: [] }];
const map = { 'kg-heizung': 'kg-technik', 'kg-oellager': 'kg-technik', 'kg-wohnzimmer': 'kg-wohnzimmer' };
const planung = buildRoomNaming(ist, soll, map, 'planung');

vi.mock('@/data/RoomsContext', () => ({
  useRooms: () => ({ rooms: planung.rooms, idsFor: planung.idsFor, writeId: planung.writeId }),
}));

afterEach(cleanup);

describe('RoomPicker - a room merged in Planung', () => {
  it('shows a predecessor id checked under the merged room’s name', () => {
    render(<RoomPicker value={['kg-heizung']} onChange={vi.fn()} />);
    // the closed picker already resolves the stored Ist id to its Planung room
    expect(screen.getByRole('button', { name: /Technikraum/ })).toBeInTheDocument();
  });

  it('deselecting the merged room removes every predecessor id it stands for', () => {
    const onChange = vi.fn();
    render(<RoomPicker value={['kg-heizung', 'kg-wohnzimmer']} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /Technikraum/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Technikraum'));

    // kg-heizung is gone (it belongs to the deselected Technikraum), kg-wohnzimmer stays
    expect(onChange).toHaveBeenCalledWith(['kg-wohnzimmer']);
  });

  it('selecting a room writes the id this naming offers, not a stored predecessor', () => {
    const onChange = vi.fn();
    render(<RoomPicker value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /kein Raum/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Technikraum'));

    expect(onChange).toHaveBeenCalledWith(['kg-technik']);
  });
});
