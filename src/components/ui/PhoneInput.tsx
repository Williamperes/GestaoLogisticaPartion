"use client";

import { formatPhoneNumber } from "@/lib/utils";

export function PhoneInput({
  name,
  placeholder,
  className,
  defaultValue,
}: {
  name: string;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}) {
  return (
    <input
      type="tel"
      name={name}
      defaultValue={defaultValue ? formatPhoneNumber(defaultValue) : undefined}
      placeholder={placeholder}
      className={className}
      onChange={(event) => {
        event.currentTarget.value = formatPhoneNumber(event.currentTarget.value);
      }}
    />
  );
}
