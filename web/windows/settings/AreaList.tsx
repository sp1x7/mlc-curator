// The area list on the left: the active area shows a dot while keys in it stand open.

import type { SettingsArea } from "@shared/types/settings";
import { AREA_LABELS, TEXT } from "./labels";

/** The areas, the picked one and the count of keys still open in it. */
type Props = {
  areas: SettingsArea[];
  active: SettingsArea;
  open: number;
  onPick(area: SettingsArea): void;
};

/** One button per area, the active one coloured. */
export function AreaList({ areas, active, open, onPick }: Props) {
  return (
    <aside className="flex w-[190px] shrink-0 flex-col border-r border-hair-8 bg-glass-2">
      <div className="px-3 pt-2 pb-1 text-[11px] text-muted-foreground">{TEXT.areas}</div>

      {areas.map((area) => {
        const on = area === active;
        return (
          <button
            key={area}
            type="button"
            className={`flex cursor-pointer items-center gap-2 px-3 py-[5px] text-left transition ${
              on ? "bg-acc1/16 text-acc1" : "hover:bg-white/6"
            }`}
            onClick={() => onPick(area)}
          >
            <span className="min-w-0 flex-1 truncate text-[11px]">{AREA_LABELS[area]}</span>
            {on && open > 0 && (
              <span className="size-[6px] shrink-0 rounded-full bg-acc1" title={`${open} open`} />
            )}
          </button>
        );
      })}
    </aside>
  );
}
