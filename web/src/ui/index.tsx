// Material 3 components built on Base UI primitives. Styles live in ../styles/components.css.
import * as React from 'react';
import { Button as BaseButton } from '@base-ui/react/button';
import { Field } from '@base-ui/react/field';
import { Input } from '@base-ui/react/input';
import { Select as BaseSelect } from '@base-ui/react/select';
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { RadioGroup } from '@base-ui/react/radio-group';
import { Radio } from '@base-ui/react/radio';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { Toast } from '@base-ui/react/toast';
import { icons, type IconName } from './icons';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------- Icon
export function Icon({ name, ...rest }: { name: IconName } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" {...rest}>
      <path d={icons[name]} />
    </svg>
  );
}

// ---------------------------------------------------------------- Button
type Variant = 'filled' | 'tonal' | 'outlined' | 'text';
export interface ButtonProps extends Omit<React.ComponentProps<typeof BaseButton>, 'className'> {
  variant?: Variant; icon?: IconName; danger?: boolean; small?: boolean; neutral?: boolean; className?: string;
}
export function Button({ variant = 'outlined', icon, danger, small, neutral, className, children, ...rest }: ButtonProps) {
  return (
    <BaseButton
      className={cx('btn state', `btn-${variant}`, icon && 'has-icon', danger && 'danger', small && 'btn-small', neutral && 'neutral', className)}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </BaseButton>
  );
}
/** A link styled as a button (navigation, downloads). */
export function LinkButton({ variant = 'outlined', icon, small, className, children, ...rest }:
  { variant?: Variant; icon?: IconName; small?: boolean } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={cx('btn state', `btn-${variant}`, icon && 'has-icon', small && 'btn-small', className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </a>
  );
}
export function IconButton({ icon, label, ...rest }: { icon: IconName; label: string } & React.ComponentProps<typeof BaseButton>) {
  return (
    <BaseButton className="icon-btn state" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </BaseButton>
  );
}

// ---------------------------------------------------------------- Text field (outlined, floating label)
interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'className' | 'value' | 'defaultValue'> {
  label: string; support?: React.ReactNode; dense?: boolean; lead?: IconName; className?: string;
  float?: boolean; value?: string; defaultValue?: string; inputRef?: React.Ref<HTMLInputElement>;
}
export function TextField({ label, support, dense, lead, className, float, placeholder, inputRef, ...input }: TextFieldProps) {
  return (
    <Field.Root className={cx('field', dense && 'dense', lead && 'with-lead', float && 'float', className)}>
      <div className="field-box">
        {lead && <span className="field-lead"><Icon name={lead} /></span>}
        <Input className="field-input" placeholder={placeholder ?? ' '} ref={inputRef} {...input} />
        <Field.Label className="field-label">{label}</Field.Label>
      </div>
      {support && <Field.Description className="field-support">{support}</Field.Description>}
    </Field.Root>
  );
}
export function TextArea({ label, support, className, ...ta }:
  { label: string; support?: React.ReactNode; className?: string } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>) {
  return (
    <Field.Root className={cx('field', className)}>
      <div className="field-box">
        <Field.Control render={<textarea className="field-input" placeholder={ta.placeholder ?? ' '} spellCheck={false} {...ta} />} />
        <Field.Label className="field-label">{label}</Field.Label>
      </div>
      {support && <Field.Description className="field-support">{support}</Field.Description>}
    </Field.Root>
  );
}

// ---------------------------------------------------------------- Select (outlined menu)
export interface SelectItem<V extends string> { value: V; label: string; meta?: string }
export function Select<V extends string>({ items, value, onChange, label, className, placeholder = 'Choose…', disabled }: {
  items: SelectItem<V>[]; value: V | null; onChange: (v: V) => void; label: string;
  className?: string; placeholder?: string; disabled?: boolean;
}) {
  return (
    <BaseSelect.Root
      items={items.map(i => ({ value: i.value, label: i.label }))}
      value={value}
      onValueChange={v => { if (v != null) onChange(v as V); }}
      disabled={disabled}
    >
      <BaseSelect.Trigger className={cx('select-trigger', className)} aria-label={label}>
        <BaseSelect.Value className="select-value" placeholder={placeholder} />
        <BaseSelect.Icon render={<Icon name="arrow_drop_down" />} />
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="menu-positioner" sideOffset={4} alignItemWithTrigger={false}>
          <BaseSelect.Popup className="menu">
            <BaseSelect.List>
              {items.map(i => (
                <BaseSelect.Item key={i.value} value={i.value} className="menu-item state">
                  <BaseSelect.ItemIndicator render={<Icon name="check" />} />
                  <BaseSelect.ItemText style={{ gridColumn: 2 }}>{i.label}</BaseSelect.ItemText>
                  {i.meta && <span className="meta">{i.meta}</span>}
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

// ---------------------------------------------------------------- Segmented button (single select)
export function Segmented<V extends string>({ items, value, onChange, label }: {
  items: { value: V; label: string }[]; value: V; onChange: (v: V) => void; label: string;
}) {
  return (
    <ToggleGroup
      className="segmented" aria-label={label} value={[value]}
      onValueChange={v => { if (v[0]) onChange(v[0] as V); }}
    >
      {items.map(i => (
        <Toggle key={i.value} value={i.value} className="segment state">
          <Icon name="check" />{i.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

// ---------------------------------------------------------------- Checkbox / Radio
export function Checkbox({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="check-row">
      <BaseCheckbox.Root className="checkbox state" checked={checked} onCheckedChange={v => onChange(v)}>
        <span className="box"><BaseCheckbox.Indicator render={<Icon name="check" />} /></span>
      </BaseCheckbox.Root>
      <span>{children}</span>
    </label>
  );
}
export function Radios<V extends string>({ value, onChange, items, label }: {
  value: V; onChange: (v: V) => void; label: string; items: { value: V; label: React.ReactNode }[];
}) {
  return (
    <RadioGroup value={value} onValueChange={v => onChange(v as V)} aria-label={label} className="stack" style={{ gap: 0 }}>
      {items.map(i => (
        <label key={i.value} className="check-row">
          <Radio.Root value={i.value} className="radio state">
            <span className="ring"><Radio.Indicator className="dot" /></span>
          </Radio.Root>
          <span>{i.label}</span>
        </label>
      ))}
    </RadioGroup>
  );
}

// ---------------------------------------------------------------- Tag (status label)
export function Tag({ tone, children }: { tone?: 'ok' | 'warn' | 'bad' | 'fastpass' | 'primary'; children: React.ReactNode }) {
  return <span className={cx('tag', tone)}>{children}</span>;
}

// ---------------------------------------------------------------- Confirm dialog (replaces window.confirm)
interface ConfirmOpts { title: string; body?: React.ReactNode; confirm: string; danger?: boolean }
type ConfirmFn = (o: ConfirmOpts) => Promise<boolean>;
const ConfirmCtx = React.createContext<ConfirmFn>(async () => false);
export const useConfirm = () => React.useContext(ConfirmCtx);

function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const [open, setOpen] = React.useState(false);
  const confirm = React.useCallback<ConfirmFn>(o => new Promise(resolve => { setState({ ...o, resolve }); setOpen(true); }), []);
  const close = (v: boolean) => { state?.resolve(v); setOpen(false); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={o => { if (!o) close(false); }}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="scrim" />
          <AlertDialog.Popup className="dialog">
            <AlertDialog.Title className="headline-s">{state?.title}</AlertDialog.Title>
            {state?.body && <AlertDialog.Description className="body-m">{state.body}</AlertDialog.Description>}
            <div className="actions">
              <AlertDialog.Close render={<Button variant="text">Cancel</Button>} />
              <Button variant="text" danger={state?.danger} onClick={() => close(true)}>{state?.confirm}</Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmCtx.Provider>
  );
}

// ---------------------------------------------------------------- Snackbar (Base UI Toast)
export const toastManager = Toast.createToastManager();
/** Show a short message at the bottom of the screen. */
export function snack(message: string, opts: { error?: boolean } = {}) {
  toastManager.add({ title: message, type: opts.error ? 'error' : 'info', timeout: opts.error ? 6000 : 3000 });
}
function Snackbars() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="snack-viewport">
        {toasts.map(t => (
          <Toast.Root key={t.id} toast={t} className={cx('snack', t.type === 'error' && 'error')}>
            <Toast.Title className="snack-text" />
            <Toast.Close className="icon-btn state" aria-label="Dismiss"><Icon name="close" /></Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

/** Wrap each page: provides confirm dialogs and snackbars. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager} limit={3}>
      <ConfirmProvider>{children}</ConfirmProvider>
      <Snackbars />
    </Toast.Provider>
  );
}

/** Live-connection indicator. */
export function Live({ up }: { up: boolean }) {
  return <span className={cx('live', up && 'up')} role="status">{up ? 'Live' : 'Reconnecting…'}</span>;
}
