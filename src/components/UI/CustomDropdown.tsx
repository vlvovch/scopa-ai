// Custom Dropdown component that supports rich content (SVG icons, etc.)

import { useState, useRef, useEffect, type ReactNode } from 'react';
import styles from './CustomDropdown.module.css';

export interface DropdownOption<T extends string = string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface CustomDropdownProps<T extends string = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}

export function CustomDropdown<T extends string = string>({
  options,
  value,
  onChange,
  className,
  disabled = false,
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Find the currently selected option
  const selectedOption = options.find(opt => opt.value === value) || options[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        setIsOpen(!isOpen);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const currentIndex = options.findIndex(opt => opt.value === value);
          const nextIndex = Math.min(currentIndex + 1, options.length - 1);
          onChange(options[nextIndex].value);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (isOpen) {
          const currentIndex = options.findIndex(opt => opt.value === value);
          const prevIndex = Math.max(currentIndex - 1, 0);
          onChange(options[prevIndex].value);
        }
        break;
    }
  };

  const handleOptionClick = (optionValue: T) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${className || ''} ${disabled ? styles.disabled : ''}`}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
    >
      {/* Selected value display */}
      <div
        className={`${styles.selected} ${isOpen ? styles.open : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={styles.selectedContent}>
          {selectedOption?.icon && <span className={styles.icon}>{selectedOption.icon}</span>}
          <span className={styles.label}>{selectedOption?.label}</span>
        </span>
        <span className={styles.arrow}>{isOpen ? '▲' : '▼'}</span>
      </div>

      {/* Options dropdown */}
      {isOpen && (
        <div className={styles.optionsList}>
          {options.map((option) => (
            <div
              key={option.value}
              className={`${styles.option} ${option.value === value ? styles.optionSelected : ''}`}
              onClick={() => handleOptionClick(option.value)}
            >
              {option.icon && <span className={styles.icon}>{option.icon}</span>}
              <span className={styles.label}>{option.label}</span>
              {option.value === value && <span className={styles.checkmark}>✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
