import * as React from 'react';
import { Button, FormDialog, Select, Tag, TextField, useConfirm } from '../../ui';
import { dateTime } from '../../lib/format';
import { ROLE_NAME, type Account, type Role } from '../../lib/types';
import { act, api, PageHead, useLoad, type AdminCtx } from './shared';

const ROLES: { value: Role; label: string }[] = [{ value: 'admin', label: ROLE_NAME.admin }, { value: 'staff', label: ROLE_NAME.staff }];

export function AccountsPage({ ticks, go }: AdminCtx) {
  const accounts = useLoad<Account[]>('/api/accounts', ticks.accounts, []);
  const [adding, setAdding] = React.useState(false);
  const [resetFor, setResetFor] = React.useState<Account | null>(null);
  const confirm = useConfirm();

  return (
    <>
      <PageHead title="Accounts" go={go}
        sub={<>Admins can do everything. Door staff see only the active session: they can check people in by name and use the exit-door page.
          The start script's <code>--user</code> and <code>--password</code> also add or reset an admin account.</>}>
        <Button variant="tonal" icon="add" onClick={() => setAdding(true)}>Add account</Button>
      </PageHead>

      <section className="card tbl-card">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Username</th><th>Role</th><th>Created</th><th className="end" /></tr></thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.username}>
                  <td><span className="strong">{a.username}</span> {a.you && <Tag>You</Tag>}</td>
                  <td>{a.you
                    ? <span>{ROLE_NAME[a.role]}</span>
                    : <Select<Role> label={`Role for ${a.username}`} items={ROLES} value={a.role} className="dense-select"
                        onChange={r => act(api(`/api/accounts/${encodeURIComponent(a.username)}`, 'PATCH', { role: r }), `${a.username} is now ${ROLE_NAME[r].toLowerCase()}`)} />}</td>
                  <td className="num muted">{dateTime(a.createdAt)}</td>
                  <td className="end"><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                    <Button variant="text" small onClick={() => setResetFor(a)}>{a.you ? 'Change password' : 'Reset password'}</Button>
                    {!a.you && <Button variant="text" danger small onClick={async () => {
                      if (await confirm({ title: `Delete ${a.username}?`, body: 'They are signed out everywhere right away.', confirm: 'Delete', danger: true }))
                        await act(api(`/api/accounts/${encodeURIComponent(a.username)}`, 'DELETE'), 'Account deleted');
                    }}>Delete</Button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AddAccountDialog open={adding} onOpenChange={setAdding} />
      <PasswordDialog account={resetFor} onClose={() => setResetFor(null)} />
    </>
  );
}

function AddAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [role, setRole] = React.useState<Role>('staff');
  React.useEffect(() => { if (open) { setUsername(''); setPassword(''); setRole('staff'); } }, [open]);
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Add account" submitLabel="Add account"
      onSubmit={async () => { if (await act(api('/api/accounts', 'POST', { username, password, role }), `Added ${username.trim().toLowerCase()}`)) onOpenChange(false); }}>
      <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)} autoFocus autoComplete="off" autoCapitalize="none"
        support="Letters, numbers, dots, dashes and underscores." />
      <TextField label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password"
        support="At least 6 characters." />
      <div className="stack" style={{ gap: 8 }}>
        <span className="label-l">Role</span>
        <Select<Role> label="Role" items={ROLES} value={role} onChange={setRole} />
      </div>
    </FormDialog>
  );
}

function PasswordDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const [password, setPassword] = React.useState('');
  React.useEffect(() => { setPassword(''); }, [account]);
  return (
    <FormDialog open={!!account} onOpenChange={o => { if (!o) onClose(); }}
      title={account?.you ? 'Change your password' : `Reset password for ${account?.username ?? ''}`} submitLabel="Save password"
      onSubmit={async () => {
        if (account && await act(api(`/api/accounts/${encodeURIComponent(account.username)}`, 'PATCH', { password }), 'Password saved')) onClose();
      }}>
      <TextField label="New password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoFocus autoComplete="new-password"
        support={account?.you ? 'Your other devices are signed out.' : 'They are signed out everywhere and need the new password.'} />
    </FormDialog>
  );
}
