// The phone surface: three areas switched by a bar along the bottom, one screen
// filled at a time.

import { cn } from "@web/lib/utils";
import { Film, FolderOpen, Heart } from "lucide-react";
import { useState } from "react";
import CatalogScreen from "./CatalogScreen";
import LibraryScreen from "./LibraryScreen";
import WishlistScreen from "./WishlistScreen";

/** The three areas a phone offers. */
type Tab = "wishlist" | "catalog" | "library";

// The bar order, left to right.
const TABS: { id: Tab; label: string; icon: typeof Heart }[] = [
  { id: "wishlist", label: "Wunschliste", icon: Heart },
  { id: "catalog", label: "Katalog", icon: Film },
  { id: "library", label: "Bib", icon: FolderOpen },
];

/** One screen at a time; the chosen tab is state of this component alone. */
export default function MobileApp() {
  const [tab, setTab] = useState<Tab>("wishlist");

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      {/* Only the active screen is mounted, so the others leave the queries. */}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "wishlist" && <WishlistScreen />}
        {tab === "catalog" && <CatalogScreen />}
        {tab === "library" && <LibraryScreen />}
      </main>

      {/* The bar adds the safe-area inset of a phone with an inset. */}
      <nav className="shrink-0 border-t border-hair-8 bg-glass-3 pb-[max(0.125rem,env(safe-area-inset-bottom))]">
        <div className="flex">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-current={entry.id === tab ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px]",
                  entry.id === tab ? "text-acc1" : "text-muted-foreground",
                )}
              >
                <Icon size={20} />
                {entry.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
