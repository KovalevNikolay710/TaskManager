# SettingsCard
Settings list in one card (`<ul class="settings">`): bg `--color-surface`, `--radius-lg`, `--shadow-sm`, rows divided by `--color-border`.
- Row (`settings__row`): grid `24px | 1fr | auto` — icon (`--color-text-muted`), title (medium) with caption below (`--text-sm` muted; success state `settings__sub--ok`, `--color-success`), [Switch](Switch.md) right. Height >= 56px.
- Setting parameter (`settings__extra`): second row under the title (columns 2–3): caption `--text-sm` muted + `Input type="time"` (`input--time`, 120px) or chips. Shown only while the setting is on (`settings__row--off` hides it); the value is not reset.
- Notice under a row (`settings__notice`): [Alert](Alert.md) or `field__hint`.
- Card foot (`settings__foot`): secondary button and a hint under it.
- The row is not a button: only the Switch toggles (title linked via `aria-labelledby`).
