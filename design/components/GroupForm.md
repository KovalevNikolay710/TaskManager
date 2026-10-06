# GroupForm
Group form inside a [Sheet](Sheet.md) (create and edit); same on new-task, task and groups screens.
- `Input` "Название": required, 1–60 chars after trim, unique among the user's groups ignoring case and "ё/е": "Группа «Учёба» уже есть".
- [WeightScale](WeightScale.md) "Вес в приоритете" ×1…×10, default ×1. Explanation below changes with the value: "×1 — как у задач без группы" / "Задачи группы будут в N раза важнее задач без группы" + who shares the step ("Встанет на одну ступень с „Работой“"). Editing an existing group with a changed weight: "Было ×3. … Приоритет N активных задач группы пересчитается — они поднимутся/опустятся в списке". New group (groups screen): "×1 — как у задач без группы. Чтобы поставить группу между другими, после создания перетащите её на лесенке." The form can only put a group on a step; insertion "between" exists only on the [GroupLadder](GroupLadder.md).
- Server error: [Alert](Alert.md) above the fields; Sheet stays open.
- Buttons: "Отмена" / "Создать группу" or "Сохранить" (with loading state; "Сохранить" disabled until something changed). Edit Sheet title: "Группа „Учёба“", below it danger-ghost "Удалить группу".
