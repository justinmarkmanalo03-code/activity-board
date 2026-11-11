"use client";

import { useEffect, useRef, useState } from "react";

// Port of the legacy confirm/prompt overlays and toast.

export function ConfirmModal({
  title = "Are you sure?",
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  title?: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="confirm-overlay">
      <div className="modal-card confirm-card" role="alertdialog" aria-modal="true">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Cancel" onClick={onCancel}>
            &#10005;
          </button>
        </header>
        <p className="muted confirm-message">{message}</p>
        <div className="modal-actions">
          <div className="spacer"></div>
          <button type="button" className="btn btn-small" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger-ghost btn-small" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface PromptOptions {
  title?: string;
  label?: string;
  value?: string;
  color?: string | null;
  maxLength?: number;
  onOk: (value: string, color: string) => void;
  onCancel: () => void;
}

export function PromptModal({ title, label, value, color, maxLength = 200, onOk, onCancel }: PromptOptions) {
  const [input, setInput] = useState(value ?? "");
  const [pickedColor, setPickedColor] = useState(color ?? "#ffffff");
  const showColor = color !== null && color !== undefined;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInput(value ?? "");
    setPickedColor(color ?? "#ffffff");
    inputRef.current?.focus();
  }, [value, color]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const swatches = [
    "#ffffff", "#f1f5f9", "#e2e8f0", "#dbeafe",
    "#e0f2fe", "#ccfbf1", "#dcfce7", "#fef9c3",
    "#ffedd5", "#ffe4e6", "#fae8ff", "#ede9fe",
  ];

  return (
    <div className="confirm-overlay">
      <div className="modal-card prompt-card" role="dialog" aria-modal="true">
        <header className="modal-head">
          <h2>{title ?? "Rename"}</h2>
          <button type="button" className="icon-btn" aria-label="Cancel" onClick={onCancel}>
            &#10005;
          </button>
        </header>
        <form
          className="stack prompt-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() !== "") onOk(input.trim(), pickedColor);
          }}
        >
          <label>
            <span>{label ?? "Name"}</span>
            <input
              ref={inputRef}
              type="text"
              maxLength={maxLength}
              autoComplete="off"
              required
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </label>
          {showColor && (
            <div className="color-field">
              <span className="field-label">List color</span>
              <div className="color-palette" role="group" aria-label="List color choices">
                {swatches.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={`color-swatch${pickedColor.toLowerCase() === swatch ? " selected" : ""}`}
                    data-color={swatch}
                    style={{ ["--swatch" as string]: swatch }}
                    title={swatch}
                    aria-label={swatch}
                    aria-pressed={pickedColor.toLowerCase() === swatch}
                    onClick={() => setPickedColor(swatch)}
                  />
                ))}
              </div>
              <label className="color-custom">
                <input
                  type="color"
                  value={pickedColor}
                  onChange={(e) => setPickedColor(e.target.value)}
                />
                <span>Custom color</span>
              </label>
            </div>
          )}
          <div className="modal-actions">
            <div className="spacer"></div>
            <button type="button" className="btn btn-small" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-small">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return <div className="toast" hidden></div>;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  function show(text: string) {
    setMessage(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), 3200);
  }

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return { message, show };
}
