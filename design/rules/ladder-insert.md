# Group ladder: move and insertion rule
Source of truth for `web/src/lib/ladder.ts`. Client computes new weights (needs the preview anyway); the server only applies the list atomically via `POST /api/groups/reorder` and accepts any set of weights 1–10 (it does not check the ladder rule).

- **To a step** (drop on row ×N, or "Сюда, рядом" / "Поставить на ×N"): the group gets weight N, other groups unchanged.
- **Between steps k and k+1** (a target exists only if **both** steps are occupied by other groups; "Без группы" occupies ×1; if a neighbouring step is empty, the same order is reached by putting the group on that empty step):
  1. The group takes k+1. Groups from k+1 move up to k+2; if k+2 is also occupied its groups move to k+3, and so on **up to the first free step**. Nothing above it changes. Minimum number of groups shifts; relative order is kept.
  2. If the chain hits ×10 (everything from k+1 to ×10 is occupied), try downward: the group takes k, groups from k move down by chain to the first free step (not below ×2: ×1 is always taken by "Без группы").
  3. No free step in either direction -> insertion impossible: target disabled, caption "нет свободной ступени"; while dragging the line is not highlighted and the hint says "Нет свободной ступени — поставьте рядом".
  - The moved group is first lifted off its step, so its old place counts as free.
- Example: "Спорт" (×1) inserted between ×2 (Работа, Хобби) and ×3 (Учёба): Спорт -> ×3; Учёба ×3 -> ×4; ×4 occupied (Английский) -> Английский ×5; ×5 free, chain stops. Three groups change weight.
- No targets above ×10 or below ×1.
- Deleting a group frees its step; other groups do not shift (empty steps are allowed).
