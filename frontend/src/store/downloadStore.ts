import { create } from 'zustand';
import { z } from 'zod';

import { getRepositories, SettingKeys } from '@/services/database/repositories';
import type { DownloadRecord, MediaMetadata } from '@/types/models';

type DownloadState = {
  /** Recent downloads by id (active and finished). */
  records: Record<string, DownloadRecord>;
  /** Metadata awaiting the user's confirmation. */
  pending: MediaMetadata | null;
  consentAcknowledgedAt: number | null;

  load: () => Promise<void>;
  upsert: (record: DownloadRecord) => void;
  remove: (id: string) => void;
  setPending: (metadata: MediaMetadata | null) => void;
  acknowledgeConsent: () => Promise<void>;
  resetConsent: () => Promise<void>;
};

export const useDownloadStore = create<DownloadState>((set) => ({
  records: {},
  pending: null,
  consentAcknowledgedAt: null,

  async load() {
    const repos = await getRepositories();
    const [recent, consent] = await Promise.all([
      repos.downloads.getRecent(30),
      repos.settings.get(SettingKeys.consentAcknowledgedAt, z.number()),
    ]);
    set({
      records: Object.fromEntries(recent.map((r) => [r.id, r])),
      consentAcknowledgedAt: consent,
    });
  },

  upsert(record) {
    set((s) => ({ records: { ...s.records, [record.id]: record } }));
  },

  remove(id) {
    set((s) => {
      const { [id]: _removed, ...rest } = s.records;
      return { records: rest };
    });
  },

  setPending(pending) {
    set({ pending });
  },

  async acknowledgeConsent() {
    const now = Date.now();
    const repos = await getRepositories();
    await repos.settings.set(SettingKeys.consentAcknowledgedAt, now);
    set({ consentAcknowledgedAt: now });
  },

  async resetConsent() {
    const repos = await getRepositories();
    await repos.settings.remove(SettingKeys.consentAcknowledgedAt);
    set({ consentAcknowledgedAt: null });
  },
}));

/** Newest first. */
export function sortRecords(records: Record<string, DownloadRecord>): DownloadRecord[] {
  return Object.values(records).sort((a, b) => b.createdAt - a.createdAt);
}
