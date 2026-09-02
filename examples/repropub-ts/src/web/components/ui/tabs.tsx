import type { ReactNode } from "react";

import { cn } from "@/lib";

interface TabOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  readonly title?: string;
}

interface TabsProps<T extends string> {
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  readonly options: readonly TabOption<T>[];
  readonly label: string;
}

export function Tabs<T extends string>({ value, onValueChange, options, label }: TabsProps<T>) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          disabled={option.disabled}
          title={option.title}
          className={cn("tabs__trigger", value === option.value && "tabs__trigger--active")}
          onClick={() => onValueChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
