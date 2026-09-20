export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'url'
  | 'color'
  | 'select'
  | 'checkbox'
  | 'group'
  | 'array';

export type FormValidator =
  | { type: 'required' }
  | { type: 'email' }
  | { type: 'minLength'; value: number }
  | { type: 'maxLength'; value: number }
  | { type: 'min'; value: number }
  | { type: 'max'; value: number }
  | { type: 'pattern'; value: string };

export interface FormField {
  name: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  note?: string;
  options?: { label: string; value: string }[];
  validators?: FormValidator[];
  defaultValue?: unknown;
  /** Present when `type` is `group`. */
  children?: FormField[];
  /** Present when `type` is `array`: the shape of one item. */
  item?: FormField;
}
