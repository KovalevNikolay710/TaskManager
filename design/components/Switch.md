# Switch
On/off toggle for settings applied at once (no "Сохранить").
- Track `--size-switch-w` x `--size-switch-h` (48x28), `--radius-full`. Off: bg `--color-surface-sunken`, 1.5px border `--color-border-strong` (3:1), 20px thumb `--color-border-strong` at left. On: bg `--color-accent`, thumb `--color-text-inverse` at right. Thumb animation `--duration-normal`.
- Touch target 56x44. `<button role="switch" aria-checked>`, label via `aria-labelledby`, description via `aria-describedby`. Focus: 2px `--color-focus` ring around the track.
- Pending (`switch--pending`, `aria-busy="true"`): thumb pulses while an async action runs (browser permission request). Disabled: opacity 0.5, `not-allowed`.
- Save error: roll back the position and [Toast](Toast.md) "Не удалось сохранить настройку" + "Повторить".
