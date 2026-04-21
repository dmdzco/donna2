import { renderToString } from 'react-dom/server';
import App from './App.jsx';

export function render(path = '/') {
  // /signup is a fully client-side route (Clerk + dynamic steps)
  // Render an empty shell for SSR — the client will hydrate it
  if (path === '/signup') {
    return '<div></div>';
  }
  return renderToString(<App path={path} />);
}
