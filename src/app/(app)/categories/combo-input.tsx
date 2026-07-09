"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ComboGroup = {
  /** Section heading. Omit for an unlabelled first group. */
  label?: string;
  items: string[];
};

/**
 * Free-text input with a grouped dropdown of existing names. Typing filters
 * every group; anything not on the list is simply created on save.
 */
export function ComboInput({
  id,
  value,
  onChange,
  groups,
  placeholder,
  disabled,
  autoFocus,
  emptyHint,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  groups: ComboGroup[];
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Shown instead of the list when nothing matches. */
  emptyHint?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = value.trim().toLowerCase();

  const shown = useMemo(() => {
    const seen = new Set<string>();
    return groups
      .map((g) => ({
        label: g.label,
        items: g.items.filter((o) => {
          const key = o.toLowerCase();
          if (seen.has(key)) return false; // a sibling wins over "reuse"
          if (q && !key.includes(q)) return false;
          seen.add(key);
          return true;
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  // Flat list drives keyboard navigation across group boundaries.
  const flat = useMemo(() => shown.flatMap((g) => g.items), [shown]);
  // Only the first group holds names that already live under this parent —
  // a name reused from another branch still creates a row here.
  const exact = useMemo(
    () => (groups[0]?.items ?? []).some((o) => o.toLowerCase() === q),
    [groups, q],
  );
  const showPanel = open && (flat.length > 0 || !!emptyHint);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (flat.length === 0) return;
      const dir = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + dir + flat.length) % flat.length);
      return;
    }
    if (e.key === "Enter" && open && active >= 0 && flat[active]) {
      e.preventDefault();
      pick(flat[active]);
      return;
    }
    if (e.key === "Escape" && open) {
      // Close the dropdown, not the surrounding dialog.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
  }

  let flatIndex = -1;

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 100);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
      />

      {showPanel && (
        <div
          className="absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
          // Keep focus in the input so onBlur doesn't fire before the click.
          onMouseDown={(e) => e.preventDefault()}
          onMouseUp={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {flat.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">{emptyHint}</p>
          ) : (
            <div id={listId} role="listbox" className="max-h-56 overflow-y-auto py-1">
              {shown.map((g) => (
                <div key={g.label ?? "_"}>
                  {g.label && (
                    <p className="px-3 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {g.label}
                    </p>
                  )}
                  <ul>
                    {g.items.map((name) => {
                      const i = ++flatIndex;
                      const selected = name.toLowerCase() === q;
                      return (
                        <li
                          key={name}
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => pick(name)}
                          className={cn(
                            "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                            i === active && "bg-accent text-accent-foreground",
                          )}
                        >
                          {name}
                          {selected && <Check className="size-3.5 opacity-60" />}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {q && !exact && (
        <p className="text-xs text-muted-foreground">
          New — “{value.trim()}” will be created.
        </p>
      )}
    </div>
  );
}
