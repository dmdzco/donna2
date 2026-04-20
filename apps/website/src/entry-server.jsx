import { renderToString } from 'react-dom/server';
import App from './App.jsx';

export function render(path = '/') {
  return renderToString(<App path={path} />);
}
