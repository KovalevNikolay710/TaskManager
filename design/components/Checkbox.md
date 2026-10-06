# Checkbox
- Visible square 22px (`--size-checkbox`), `--radius-sm`, 2px border `--color-border-strong`; touch target 44x44.
- Checked: bg `--color-success`, white tick.
- Pending (request in flight): border `--color-success`, spinner/pulse inside; repeated taps ignored.
- Disabled: cursor `not-allowed`, `title` hint. (Completed tasks are not disabled: `status: 1` returns a task to work.)
- `role="checkbox"` / `<input type="checkbox">`, label = task name (`aria-labelledby`).
