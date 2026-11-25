import { useState, type FormEvent } from 'react';
import { useApi } from '../api/api-context';
import type { Session } from '../api/types';
import { Field } from '../components/Field';
import { ErrorAlert, messageOf } from '../components/feedback';

const DEFAULT_EMAIL = 'inspector@example.com';
const DEFAULT_PASSWORD = 'Inspector123!';

/** The sign-in page. The demo accounts are listed because this build has no real identity provider. */
export function Login({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const api = useApi();
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      onSignedIn(await api.auth.login(email, password));
    } catch (failure) {
      setError(messageOf(failure, 'Sign-in failed'));
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <span className="eyebrow">PASSIVE FIRE / FIELD DEMO</span>
        <h1>Inspection workspace</h1>
        <p className="muted">A focused demo for evidence-led passive fire inspections.</p>
        <form onSubmit={submit}>
          <Field label="Email">
            {({ id }) => (
              <input id={id} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            )}
          </Field>
          <Field label="Password">
            {({ id }) => (
              <input
                id={id}
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>
          <ErrorAlert message={error} />
          <button className="button primary full" disabled={submitting}>Sign in</button>
        </form>
        <div className="demo-hint">
          <strong>Development demo accounts</strong><br />
          Admin: admin@example.com / Admin123!<br />
          Inspector: inspector@example.com / Inspector123!<br />
          Viewer: viewer@example.com / Viewer123!
        </div>
      </div>
    </div>
  );
}
