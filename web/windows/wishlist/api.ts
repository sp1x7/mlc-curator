// The calls of the wishlist window: the list, the resolver of the add dialog, the
// target write and the delete.

import type { ResolveAnswer, WishKind, WishList, WishTarget } from "@shared/types/wishlist";
import { clientOf } from "@web/lib/api";

// The area prefix of every path.
const wishlist = clientOf("wishlist");

/** The resolver answers with a title, a list of candidates, or nothing. */
export type ResolveReply = ResolveAnswer | { error: string };

/** The title and the target of a new wish. */
export type AddWishArgs = {
  tmdbId: number;
  kind: WishKind;
  note: string | null;
} & WishTarget;

/** The wishlist endpoints, one function each. */
export const wishlistApi = {
  /** Every wish with its state in the library. */
  list: () => wishlist.get<WishList>("/wishes"),

  // Search text, a tt id or a tmdb id in; a title or candidates back out.
  resolve: (query: string) => wishlist.post<ResolveReply>("/resolve", { query }),

  // A title already on the list keeps the target it has: the answer says so.
  add: (wish: AddWishArgs) => wishlist.post<{ ok: boolean; exists: boolean }>("/add", wish),

  /** Writes the target of one wish. */
  target: (id: number, target: WishTarget, note: string | null) =>
    wishlist.put<{ ok: boolean }>(`/target/${id}`, { ...target, note }),

  /** Takes one wish off the list. */
  remove: (id: number) => wishlist.del<{ ok: boolean }>(`/wish/${id}`),
};
