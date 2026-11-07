import { create } from "zustand";
import { persist } from "zustand/middleware";

type Order = "newest" | "oldest";

type State = {
  byShow: Record<string, Order>;
  setOrder: (showId: string, order: Order) => void;
  orderOf: (showId: string) => Order;
  /** Shows followed in the app only, for when following on YouTube fails. */
  localFollows: string[];
  addLocalFollow: (showId: string) => void;
  removeLocalFollow: (showId: string) => void;
};

export const useShowSortStore = create<State>()(
  persist(
    (set, get) => ({
      byShow: {},
      setOrder: (showId, order) => set((s) => ({ byShow: { ...s.byShow, [showId]: order } })),
      orderOf: (showId) => get().byShow[showId] ?? "newest",
      localFollows: [],
      addLocalFollow: (id) => set((s) => (s.localFollows.includes(id) ? s : { localFollows: [...s.localFollows, id] })),
      removeLocalFollow: (id) => set((s) => ({ localFollows: s.localFollows.filter((x) => x !== id) })),
    }),
    { name: "ytm-show-sort", version: 0 },
  ),
);
