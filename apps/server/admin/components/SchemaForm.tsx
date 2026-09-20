import type { FormField, FormValidator } from '@web-plugins/protocol';
import { appendItem, getPath, removeIndex } from '../lib/paths';

export interface SchemaFormProps {
  fields: FormField[];
  values: Record<string, unknown>;
  onChange(path: (string | number)[], value: unknown): void;
  onStructuralChange(next: Record<string, unknown>): void;
}

/** Config values are `unknown` until validated, but inputs need a string. */
const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Reads one constraint the schema already carries, so it can be mirrored onto the
 * native input instead of being discovered only when the server rejects the save.
 */
function constraint<T extends FormValidator['type']>(
  field: FormField,
  type: T,
): Extract<FormValidator, { type: T }> | undefined {
  return field.validators?.find(
    (validator): validator is Extract<FormValidator, { type: T }> => validator.type === type,
  );
}

const isRequired = (field: FormField): boolean => Boolean(constraint(field, 'required'));

/** Empty value for a freshly appended array item, derived from its field shape. */
function blankFor(field: FormField): unknown {
  if (field.type === 'group') {
    const bag: Record<string, unknown> = {};
    for (const child of field.children ?? []) bag[child.name] = blankFor(child);
    return bag;
  }
  if (field.type === 'array') return [];
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return field.defaultValue ?? 0;
  return field.defaultValue ?? '';
}

function Leaf({
  field,
  path,
  value,
  onChange,
}: {
  field: FormField;
  path: (string | number)[];
  value: unknown;
  onChange: SchemaFormProps['onChange'];
}) {
  const id = `f-${path.join('-')}`;
  const label = (
    <label class="wp-label" for={id}>
      {field.label}
      {isRequired(field) ? <span class="text-rose-500"> *</span> : null}
    </label>
  );
  const note = field.note ? <span class="wp-note">{field.note}</span> : null;

  if (field.type === 'checkbox') {
    return (
      <div class="flex items-start gap-2">
        <input
          id={id}
          type="checkbox"
          class="mt-0.5 size-4 rounded border-ink-300"
          checked={value === true}
          onChange={(event) => onChange(path, (event.currentTarget as HTMLInputElement).checked)}
        />
        <span>
          <label class="text-xs font-medium text-ink-700" for={id}>
            {field.label}
          </label>
          {note}
        </span>
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div>
        {label}
        <select
          id={id}
          class="wp-input"
          value={asText(value)}
          onChange={(event) => onChange(path, (event.currentTarget as HTMLSelectElement).value)}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {note}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div>
        {label}
        <textarea
          id={id}
          rows={3}
          class="wp-input"
          placeholder={field.placeholder}
          required={isRequired(field)}
          maxLength={constraint(field, 'maxLength')?.value}
          value={asText(value)}
          onInput={(event) => onChange(path, (event.currentTarget as HTMLTextAreaElement).value)}
        />
        {note}
      </div>
    );
  }

  if (field.type === 'color') {
    const text = asText(value);
    // A swatch plus the hex, because schema colors are stored as strings and the
    // native picker cannot represent an unset value.
    return (
      <div>
        {label}
        <div class="flex items-center gap-2">
          <input
            type="color"
            class="size-9 shrink-0 cursor-pointer rounded-md border border-ink-200 bg-white p-1"
            value={/^#[0-9a-f]{6}$/i.test(text) ? text : '#000000'}
            onInput={(event) => onChange(path, (event.currentTarget as HTMLInputElement).value)}
          />
          <input
            id={id}
            class="wp-input font-mono"
            placeholder={field.placeholder ?? '#000000'}
            required={isRequired(field)}
            pattern={constraint(field, 'pattern')?.value}
            value={text}
            onInput={(event) => onChange(path, (event.currentTarget as HTMLInputElement).value)}
          />
        </div>
        {note}
      </div>
    );
  }

  if (field.type === 'number') {
    return (
      <div>
        {label}
        <input
          id={id}
          type="number"
          class="wp-input"
          placeholder={field.placeholder}
          required={isRequired(field)}
          min={constraint(field, 'min')?.value}
          max={constraint(field, 'max')?.value}
          value={typeof value === 'number' ? String(value) : ''}
          onInput={(event) => {
            const raw = (event.currentTarget as HTMLInputElement).value;
            onChange(path, raw === '' ? undefined : Number(raw));
          }}
        />
        {note}
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        id={id}
        type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
        class="wp-input"
        placeholder={field.placeholder}
        required={isRequired(field)}
        minLength={constraint(field, 'minLength')?.value}
        maxLength={constraint(field, 'maxLength')?.value}
        value={asText(value)}
        onInput={(event) => onChange(path, (event.currentTarget as HTMLInputElement).value)}
      />
      {note}
    </div>
  );
}

function ArrayField({
  field,
  path,
  values,
  onChange,
  onStructuralChange,
}: {
  field: FormField;
  path: (string | number)[];
  values: Record<string, unknown>;
  onChange: SchemaFormProps['onChange'];
  onStructuralChange: SchemaFormProps['onStructuralChange'];
}) {
  const list = getPath(values, path);
  const items = Array.isArray(list) ? list : [];
  const item = field.item;

  return (
    <div>
      <div class="mb-2 flex items-center justify-between">
        <span class="text-xs font-medium text-ink-700">{field.label}</span>
        <button
          type="button"
          class="text-xs font-medium text-ink-500 hover:text-ink-900"
          onClick={() => onStructuralChange(appendItem(values, path, item ? blankFor(item) : ''))}
        >
          + Add
        </button>
      </div>
      {items.length === 0 ? (
        <p class="text-xs text-ink-500">None yet.</p>
      ) : (
        <ul class="space-y-3">
          {items.map((_, index) => (
            <li key={index} class="rounded-md border border-ink-200 bg-ink-50 p-3">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs text-ink-500">#{index + 1}</span>
                <button
                  type="button"
                  class="text-xs text-rose-600 hover:text-rose-700"
                  onClick={() => onStructuralChange(removeIndex(values, path, index))}
                >
                  Remove
                </button>
              </div>
              {item ? (
                <FieldNode
                  field={{ ...item, label: item.label || `Item ${index + 1}` }}
                  path={[...path, index]}
                  values={values}
                  onChange={onChange}
                  onStructuralChange={onStructuralChange}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {field.note ? <span class="wp-note">{field.note}</span> : null}
    </div>
  );
}

function FieldNode({
  field,
  path,
  values,
  onChange,
  onStructuralChange,
}: {
  field: FormField;
  path: (string | number)[];
  values: Record<string, unknown>;
  onChange: SchemaFormProps['onChange'];
  onStructuralChange: SchemaFormProps['onStructuralChange'];
}) {
  if (field.type === 'group') {
    return (
      <fieldset class="rounded-md border border-ink-200 p-3">
        <legend class="px-1 text-xs font-semibold text-ink-700">{field.label}</legend>
        <div class="space-y-3">
          {(field.children ?? []).map((child) => (
            <FieldNode
              key={child.name}
              field={child}
              path={[...path, child.name]}
              values={values}
              onChange={onChange}
              onStructuralChange={onStructuralChange}
            />
          ))}
        </div>
      </fieldset>
    );
  }

  if (field.type === 'array') {
    return (
      <ArrayField
        field={field}
        path={path}
        values={values}
        onChange={onChange}
        onStructuralChange={onStructuralChange}
      />
    );
  }

  return <Leaf field={field} path={path} value={getPath(values, path)} onChange={onChange} />;
}

/**
 * The whole editor: no widget type is hardcoded here. Fields come from the
 * widget's own JSON Schema through `schemaToFormFields`, so a new template needs
 * no panel change at all.
 */
export function SchemaForm({ fields, values, onChange, onStructuralChange }: SchemaFormProps) {
  const groups = fields.filter((field) => field.type === 'group' || field.type === 'array');
  const scalars = fields.filter((field) => field.type !== 'group' && field.type !== 'array');

  // `view` is the widget's own settings and the most likely thing to edit; fall
  // back to the first section so the form never opens fully collapsed.
  const openByDefault = groups.find((field) => field.name === 'view')?.name ?? groups[0]?.name;

  return (
    <div class="space-y-4">
      {scalars.length > 0 ? (
        <div class="wp-card space-y-3 p-4">
          {scalars.map((field) => (
            <FieldNode
              key={field.name}
              field={field}
              path={[field.name]}
              values={values}
              onChange={onChange}
              onStructuralChange={onStructuralChange}
            />
          ))}
        </div>
      ) : null}

      {groups.map((field) => (
        <details key={field.name} class="wp-card p-4" open={field.name === openByDefault}>
          <summary class="cursor-pointer text-sm font-semibold text-ink-900">{field.label}</summary>
          <div class="mt-3 space-y-3">
            {field.type === 'group' ? (
              (field.children ?? []).map((child) => (
                <FieldNode
                  key={child.name}
                  field={child}
                  path={[field.name, child.name]}
                  values={values}
                  onChange={onChange}
                  onStructuralChange={onStructuralChange}
                />
              ))
            ) : (
              <ArrayField
                field={field}
                path={[field.name]}
                values={values}
                onChange={onChange}
                onStructuralChange={onStructuralChange}
              />
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
