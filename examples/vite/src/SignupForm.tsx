import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { ShieldLabsError, useIdentify, useShieldLabs, type InteractionIdentifier } from '@shieldlabs-ai/react';

function describe(error: unknown): string {
  return error instanceof ShieldLabsError ? `ShieldLabs ${error.code}: ${error.message}` : String(error);
}

export function SignupForm() {
  const { status, error, getAgent } = useShieldLabs();
  const { identify } = useIdentify();
  const formRef = useRef<HTMLFormElement>(null);
  const early = useRef<InteractionIdentifier | null>(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Once the agent has loaded, identifyOnInteraction() starts an identification on the first focus,
  // click or key press in the form, so it is usually finished by the time the form is submitted.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let active = true;
    getAgent().then(
      (agent) => {
        if (active) early.current = agent.identifyOnInteraction(form);
      },
      () => {
        // The agent could not load (the status line shows why). The submit handler tries again.
      },
    );
    return () => {
      active = false;
      early.current?.dispose();
      early.current = null;
    };
  }, [getAgent]);

  const submit = async (form: HTMLFormElement): Promise<void> => {
    const data = new FormData(form);
    setSubmitting(true);

    let requestId: string | null = null;
    try {
      // One identification per submission: the early one while it is fresh, otherwise a new one.
      // When the agent could not load at first, identify() tries to load it again (it resolves null
      // instead of rejecting).
      const result = early.current ? await early.current.take() : await identify();
      requestId = result?.requestId ?? null;
    } catch (reason) {
      // Without an identification your server treats the signup as unverified.
      setMessage(describe(reason));
    }

    try {
      // The page stays open while this request is sent, so the agent can finish posting.
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.get('email'), password: data.get('password'), requestId }),
      });
      setMessage(
        response.ok
          ? 'Account created.'
          : `Your server answered ${String(response.status)}. It would receive requestId ${requestId ?? '(none)'}.`,
      );
    } catch (reason) {
      setMessage(`The signup request failed: ${String(reason)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void submit(event.currentTarget);
  };

  return (
    <main>
      <h1>Create an account</h1>
      <form ref={formRef} onSubmit={onSubmit}>
        <label>
          Email <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password <input name="password" type="password" autoComplete="new-password" required />
        </label>
        <button type="submit" disabled={submitting}>
          Sign up
        </button>
      </form>
      <p role="status">{message}</p>
      <p className="agent">
        Agent: {status}
        {error ? ` (${error.code})` : ''}
      </p>
    </main>
  );
}
