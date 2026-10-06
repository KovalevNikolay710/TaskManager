# Field, Input, Textarea
- `Field`: label (`field__label`, `--text-sm` medium) -> control -> hint/error (`field__hint`, `--text-xs` muted); gaps `--space-2`. Optional fields are marked in the label: "Описание — необязательно" (`field__optional`, regular muted). Required fields are not marked.
- `Input`: height 44px, bg `--color-surface-sunken`, no border, `--radius-md`, `--text-md`, padding `0 --space-3`; placeholder `--color-text-muted`; focus 2px `--color-focus`.
- `Textarea`: same, min 88px (3 lines), grows with content (`field-sizing: content`; frontend: autosize), padding `--space-3`.
- Error: 2px `--color-danger` border (`input--error`), `aria-invalid="true"`, text in `field__hint--error` (`--color-danger`) linked by `aria-describedby`. Warning (does not block submit): `field__hint--warning`, `--color-warning`, with icon.
- When to show errors: after blur and on submit attempt; error disappears as soon as the input is fixed. On submit with errors focus goes to the first invalid field.
- Disabled (while submitting): opacity 0.6.
