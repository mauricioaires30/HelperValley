import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, readTheme } from './app/ThemeToggle';

// Set the theme before the first paint so the page doesn't flash.
applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
