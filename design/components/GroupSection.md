# GroupSection
Section of the all-tasks screen.
- Header row (collapse button, height >= 44px): group name (`Group.Name`, `--text-lg` semibold); weight badge "×3" (`Group.GroupPriority`; `--text-xs` medium, `--radius-full`, bg `--w-soft`, 1px border `--w`, text `--w-text`, class `.w-N`; `title="Приоритет группы 3"`; "×" because it multiplies `Pg`); counter at right "2 / 5" (done / total, `--text-sm` muted); chevron at far right. Collapsed state in `localStorage` (`tm.collapsedGroups`, array of `GroupId`).
- Body: card `--color-surface`, `--radius-lg`, `--shadow-sm`; [TaskRow](TaskRow.md)s inside without own bg, divider `--color-border` (left inset = checkbox width). Gap between sections `--space-6`.
- Section order: `GroupPriority` desc, then name; "Без группы" last.
- If a group has more than 3 completed tasks they collapse to a ghost row "Выполнено: 5 — показать".
- While searching: counter shows "N найдено", all sections expanded.
