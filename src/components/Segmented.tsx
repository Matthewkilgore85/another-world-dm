interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  hint?: string;
}

export function Segmented<T extends string>({ label, value, options, onChange, hint }: Props<T>) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            type="button"
            key={o}
            role="radio"
            aria-checked={value === o}
            className={value === o ? 'on' : ''}
            onClick={() => onChange(o)}
          >
            {o}
          </button>
        ))}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </fieldset>
  );
}
