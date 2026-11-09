// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImeTextInput } from "../../../../../../apps/web/components/plan/ImeTextInput";

afterEach(cleanup);

function Destination() {
  const [query, setQuery] = useState("");
  const [cities, setCities] = useState<string[]>([]);
  return (
    <>
      <ImeTextInput
        aria-label="Điểm đến"
        value={query}
        onValueChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === "Enter" && query.trim()) {
            event.preventDefault();
            setCities([...cities, query.trim()]);
            setQuery("");
          }
        }}
      />
      <output data-testid="query">{query}</output>
      <ol>
        {cities.map((city, i) => (
          <li key={i}>{city}</li>
        ))}
      </ol>
    </>
  );
}

describe("Vietnamese IME text input", () => {
  it("keeps intermediate accented text intact through parent updates and keeps the draft current during composition", () => {
    const change = vi.fn();
    const view = render(
      <ImeTextInput aria-label="Điểm đến" value="" onValueChange={change} />,
    );
    const field = screen.getByLabelText("Điểm đến") as HTMLInputElement;
    fireEvent.compositionStart(field);
    fireEvent.change(field, { target: { value: "Ta" } });
    fireEvent.change(field, { target: { value: "Tâ" } });
    view.rerender(
      <ImeTextInput
        aria-label="Điểm đến"
        value="old external query"
        onValueChange={change}
      />,
    );
    expect(field.value).toBe("Tâ");
    fireEvent.change(field, { target: { value: "Tây An" } });
    expect(change).toHaveBeenLastCalledWith("Tây An");
    fireEvent.compositionEnd(field, { data: "Tây An" });
    expect(change).toHaveBeenLastCalledWith("Tây An");
    expect(field.value).toBe("Tây An");
  });

  it("uses Enter to finish composing without adding fragments or duplicate destinations", () => {
    render(<Destination />);
    const field = screen.getByLabelText("Điểm đến") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "T" } });
    fireEvent.compositionStart(field);
    fireEvent.change(field, { target: { value: "Tây An" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(field.value).toBe("Tây An");
    fireEvent.compositionEnd(field, { data: "Tây An" });
    fireEvent.keyDown(field, { key: "Enter", keyCode: 229 });
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem").textContent).toBe("Tây An");
    expect(field.value).toBe("");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("guards native composition even when compositionstart was not delivered", () => {
    const keyDown = vi.fn();
    render(
      <ImeTextInput
        aria-label="Điểm đến"
        value="Tây An"
        onValueChange={vi.fn()}
        onKeyDown={keyDown}
      />,
    );
    const field = screen.getByLabelText("Điểm đến");
    fireEvent.keyDown(field, { key: "Enter", isComposing: true });
    expect(keyDown).not.toHaveBeenCalled();
  });

  it("supports ordinary edits, paste and external resets without moving the caret on rerenders", () => {
    const change = vi.fn();
    const view = render(
      <ImeTextInput
        aria-label="Điểm đến"
        value="Tây An"
        onValueChange={change}
      />,
    );
    const field = screen.getByLabelText("Điểm đến") as HTMLInputElement;
    field.setSelectionRange(2, 2);
    view.rerender(
      <ImeTextInput
        aria-label="Điểm đến"
        value="Tây An"
        onValueChange={change}
        placeholder="City"
      />,
    );
    expect(field.selectionStart).toBe(2);
    fireEvent.change(field, { target: { value: "Đà Nẵng" } });
    expect(change).toHaveBeenLastCalledWith("Đà Nẵng");
    view.rerender(
      <ImeTextInput aria-label="Điểm đến" value="" onValueChange={change} />,
    );
    expect(field.value).toBe("");
  });
});
