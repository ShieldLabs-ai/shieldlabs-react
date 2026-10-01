import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldLabsProvider } from '@shieldlabs-ai/react';
import { SignupForm } from './SignupForm';

const root = document.getElementById('root');
if (!root) throw new Error('The #root element is missing.');

createRoot(root).render(
  <StrictMode>
    {/* One provider for the whole app: it loads the agent once, also in StrictMode. */}
    <ShieldLabsProvider publicKey={import.meta.env.VITE_SHIELDLABS_PUBLIC_KEY}>
      <SignupForm />
    </ShieldLabsProvider>
  </StrictMode>,
);
