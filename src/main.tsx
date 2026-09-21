import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initNative } from './platform/native';
import { captureGlobalErrors } from './platform/debugLog';
import './styles/index.css';

// on a phone there is no console to look at, so uncaught errors are written down instead
captureGlobalErrors();

// status bar, splash screen and back button; a no-op in the browser
void initNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
