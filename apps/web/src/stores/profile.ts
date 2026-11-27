import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProfileState {
  profileId: number | null;
  /** True once the person has picked a profile in this browser session. */
  confirmed: boolean;
  choose: (id: number) => void;
  forget: () => void;
}

export const useProfile = create<ProfileState>()(
  persist(
    (set) => ({
      profileId: null,
      confirmed: false,
      choose: (id) => set({ profileId: id, confirmed: true }),
      forget: () => set({ confirmed: false }),
    }),
    {
      name: 'marquee.profile',
      version: 1,
      partialize: (s) => ({ profileId: s.profileId }),
    },
  ),
);
