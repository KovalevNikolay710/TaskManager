import styles from './Form.module.css'
import { Button } from './Button'
import { Icon } from './Icon'

interface StepperProps {
  labelledBy: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  /** Как показать значение, например «×3» */
  format?: (value: number) => string
  disabled?: boolean
}

export function Stepper({ labelledBy, value, min, max, onChange, format = String, disabled = false }: StepperProps) {
  return (
    <div className={styles.stepper} role="group" aria-labelledby={labelledBy}>
      <Button
        variant="icon"
        className={styles.stepperButton}
        aria-label="Меньше"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="minus" size="sm" />
      </Button>
      <output className={styles.stepperValue} aria-live="polite">
        {format(value)}
      </output>
      <Button
        variant="icon"
        className={styles.stepperButton}
        aria-label="Больше"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="plus" size="sm" />
      </Button>
    </div>
  )
}
