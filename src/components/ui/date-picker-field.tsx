"use client";

import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";

type DatePickerFieldProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  defaultValue?: string;
  id: string;
  name: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  value?: string;
};

export function DatePickerField({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  defaultValue = "",
  id,
  name,
  onValueChange,
  placeholder = "Seleccionar fecha",
  required,
  value,
}: DatePickerFieldProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const currentValue = isControlled ? value : internalValue;
  const selectedDate = parseInputDate(currentValue);

  function handleSelect(date: Date | undefined) {
    const nextValue = date ? toInputDate(date) : "";

    if (!isControlled) {
      setInternalValue(nextValue);
    }

    onValueChange?.(nextValue);
    setOpen(false);
  }

  return (
    <div className="mt-2">
      <input
        name={name}
        type="hidden"
        required={required}
        value={currentValue}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-describedby={[`${id}-value`, ariaDescribedBy].filter(Boolean).join(" ")}
            data-invalid={ariaInvalid ? "true" : undefined}
            className={cn(
              buttonVariants({ variant: "secondary" }),
              "min-h-10 w-full justify-between px-3.5 py-2.5 text-left font-normal data-[invalid=true]:border-red-300 data-[invalid=true]:focus:ring-red-900/10",
              !selectedDate && "text-slate-500",
            )}
          >
            <span id={`${id}-value`}>{selectedDate ? formatDisplayDate(selectedDate) : placeholder}</span>
            <CalendarIcon className="h-4 w-4 text-slate-500" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={selectedDate}
            onSelect={handleSelect}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function parseInputDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day);
}

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
