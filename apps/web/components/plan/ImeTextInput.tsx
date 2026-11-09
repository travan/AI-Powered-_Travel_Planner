"use client";

import React, { useLayoutEffect, useRef } from "react";

export type ImeTextInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue" | "onChange"
> & {
  value: string | number;
  onValueChange: (value: string) => void;
};

/** Preserve native accented text while keeping the form draft current. */
export function ImeTextInput({
  value,
  onValueChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: ImeTextInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const initialValue = useRef(value);

  useLayoutEffect(() => {
    const field = input.current;
    // External changes (such as clearing a selected city) must not replace an
    // active IME composition or reset the caret on ordinary keystrokes.
    if (field && !composing.current && field.value !== String(value))
      field.value = String(value);
  }, [value]);

  return (
    <input
      {...props}
      ref={input}
      defaultValue={initialValue.current}
      onCompositionStart={(event) => {
        composing.current = true;
        onCompositionStart?.(event);
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        onValueChange(event.currentTarget.value);
        onCompositionEnd?.(event);
      }}
      onChange={(event) => {
        // Keep the draft current during composition without writing back into
        // the native field. Autocomplete can wait until compositionend.
        onValueChange(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        // Some IMEs use Enter to confirm a word. Safari can report keyCode 229
        // after compositionend while isComposing is already false.
        if (
          event.key === "Enter" &&
          (composing.current ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229)
        ) {
          event.preventDefault();
          return;
        }
        onKeyDown?.(event);
      }}
    />
  );
}
