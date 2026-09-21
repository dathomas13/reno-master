import { beforeEach, describe, expect, it } from 'vitest';
import { clearDiaryDraft, hasDiaryDraftContent, loadDiaryDraft, saveDiaryDraft } from '../diaryDraft';
import type { DiaryEntry } from '@/data/types';

function entry(patch: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    id: 'draft-1',
    date: '2026-09-19',
    title: 'Tagebuch 19.09.',
    text: '',
    present: [],
    defects: false,
    tradeIds: [],
    roomIds: [],
    photoIds: [],
    ...patch,
  };
}

beforeEach(() => localStorage.clear());

describe('diary drafts', () => {
  it('does not store a draft before the user has started writing', () => {
    const empty = entry();

    expect(hasDiaryDraftContent(empty, '2026-09-19')).toBe(false);
    saveDiaryDraft(empty, '2026-09-19');

    expect(loadDiaryDraft()).toBeNull();
  });

  it('keeps a started diary entry locally', () => {
    const draft = entry({ text: 'Heute wurde der Keller ausgeraeumt.' });

    saveDiaryDraft(draft, '2026-09-19');

    expect(loadDiaryDraft()).toEqual(draft);
  });

  it('can discard a saved draft', () => {
    saveDiaryDraft(entry({ text: 'angefangen' }), '2026-09-19');
    clearDiaryDraft();

    expect(loadDiaryDraft()).toBeNull();
  });
});