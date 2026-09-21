import type { ComponentChildren, JSX } from 'preact';

/**
 * The parts every module starts from. Small on purpose: a module that grows its
 * own look adds components in its own folder, and only what more than one module
 * ends up wanting is worth moving here.
 */

export function Screen({ children }: { children: ComponentChildren }) {
  return <div class="screen">{children}</div>;
}

export function Header({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose?: () => void;
}) {
  return (
    <header class="screen__header">
      <div class="screen__heading">
        <h1 class="screen__title">{title}</h1>
        {subtitle ? <p class="screen__subtitle">{subtitle}</p> : null}
      </div>
      {onClose ? (
        <button type="button" class="screen__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      ) : null}
    </header>
  );
}

export function Body({ children }: { children: ComponentChildren }) {
  return <div class="screen__body">{children}</div>;
}

export function Stack({ children }: { children: ComponentChildren }) {
  return <div class="stack">{children}</div>;
}

export function Notice({ children }: { children: ComponentChildren }) {
  return (
    <div class="notice">
      <p>{children}</p>
    </div>
  );
}

export function Button(props: JSX.IntrinsicElements['button'] & { variant?: 'primary' | 'ghost' }) {
  const { variant = 'primary', ...rest } = props;
  return <button type="button" {...rest} class={`btn btn--${variant} ${rest.class ?? ''}`} />;
}

export function Field({ label, ...props }: JSX.IntrinsicElements['input'] & { label: string }) {
  return (
    <label class="field">
      <span class="field__label">{label}</span>
      <input {...props} class="field__input" />
    </label>
  );
}

/**
 * Renders whatever the template put in `config.view`, so a new module shows its
 * own config on first load and the author can see the shape before writing any
 * UI. Delete the call once the module renders something real.
 */
export function ConfigPreview({ value }: { value: unknown }) {
  // An empty string would otherwise render as a blank row, indistinguishable from
  // a key whose value failed to arrive.
  if (value === null || value === undefined || value === '') {
    return <span class="scalar">—</span>;
  }

  if (Array.isArray(value)) {
    return value.length ? (
      <ol class="tree">
        {value.map((item, index) => (
          <li key={index}>
            <ConfigPreview value={item} />
          </li>
        ))}
      </ol>
    ) : (
      <span class="scalar">empty</span>
    );
  }

  if (typeof value === 'object') {
    return (
      <dl class="tree">
        {Object.entries(value as Record<string, unknown>).map(([key, child]) => (
          <div key={key} class="tree__row">
            <dt>{key}</dt>
            <dd>
              <ConfigPreview value={child} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return <span class="scalar">{String(value)}</span>;
}
