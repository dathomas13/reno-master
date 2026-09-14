import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initNative } from './platform/native';
import './styles/index.css';

// status bar, splash screen and back button; a no-op in the browser
void initNative();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
