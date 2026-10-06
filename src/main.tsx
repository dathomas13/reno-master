import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initNative } from './platform/native';
import { captureGlobalErrors, debugLog } from './platform/debugLog';
import { isNative } from './platform/index';
import { APP_BUILD, APP_VERSION } from './lib/buildInfo';
import './styles/index.css';

// on a phone there is no console to look at, so uncaught errors are written down instead
captureGlobalErrors();
debugLog('app', `Start ${APP_VERSION} (Build ${APP_BUILD}, ${isNative() ? 'App' : 'Browser'})`);

// status bar, splash screen and back button; a no-op in the browser
void initNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
