import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import './Select.css';

/**
 * App-styled select built on Radix UI primitives (accessible, keyboard
 * navigable, portal-rendered). Drop-in for native <select>:
 *
 *   <Select id="x" value={v} onValueChange={setV}
 *           options={[{ value: 'bug', label: 'Bug Report' }]} />
 *
 * Radix forbids empty-string item values, so "no selection" options (None,
 * Unassigned) should use a sentinel value mapped to null by the caller.
 *
 * Pass variant="dark" for a dark-gray trigger and menu (e.g. on dark cards).
 */
export default function Select({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  variant,
  'aria-label': ariaLabel,
}) {
  const variantClass = variant === 'dark' ? ' ui-select--dark' : '';
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger id={id} className={`ui-select-trigger${variantClass}`} aria-label={ariaLabel}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon className="ui-select-icon">
          <ChevronDown size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className={`ui-select-content${variantClass}`} position="popper" sideOffset={4}>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="ui-select-item"
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ui-select-indicator">
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
