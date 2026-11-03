import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource/cormorant-garamond/600.css';
import './index.css';
import { API_MODE } from '@/api';
import { ConfigurationRequired } from './ConfigurationRequired';
import { router } from './routes';

// The admin must never silently run on in-browser mock data — that would let someone manage a
// "store" that isn't connected to any real database. If the backend URL isn't configured, stop
// here with a clear, actionable error instead of booting the app.
createRoot(document.getElementById('root')!).render(
  <StrictMode>{API_MODE ? <RouterProvider router={router} /> : <ConfigurationRequired />}</StrictMode>,
);
