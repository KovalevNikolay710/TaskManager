import { useRef } from 'react'
import styles from './SearchField.module.css'
import { Icon } from './Icon'

interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
}

export function SearchField({ value, onChange }: SearchFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <label className={styles.search}>
      <Icon name="search" size="sm" className={styles.icon} />
      <span className="visually-hidden">Поиск задач</span>
      <input
        ref={inputRef}
        className={styles.input}
        type="search"
        placeholder="Поиск задач"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            clear()
          }
        }}
      />
      {value && (
        <button className={styles.clear} type="button" aria-label="Очистить поиск" onClick={clear}>
          <Icon name="x" size="sm" />
        </button>
      )}
    </label>
  )
}
