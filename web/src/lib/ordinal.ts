/** Место в очереди: «1-я из 9 активных» (задача — женский род). */
export function placeText(place: number, total: number): string {
  return `${place}-я из ${total} активных`
}

/** Место новой задачи: «встанет 2-й из 10». */
export function futurePlaceText(place: number, total: number): string {
  return `встанет ${place}-й из ${total}`
}
