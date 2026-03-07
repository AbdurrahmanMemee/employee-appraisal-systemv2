import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

function showError(title, detail) {
  document.getElementById('root').innerHTML = [
    '<div style="padding:2rem;font-family:monospace;font-size:13px;background:#fff1f0;min-height:100vh;white-space:pre-wrap;word-break:break-all">',
    '<h2 style="color:#c00;font-size:18px;margin-bottom:1rem">' + title + '</h2>',
    '<div style="background:#fff;padding:1rem;border:1px solid #fcc;border-radius:4px">' + detail + '</div>',
    '<p style="margin-top:1rem;color:#666">Also open DevTools (F12) > Console for full details</p>',
    '</div>'
  ].join('');
}

window.onerror = function(msg, src, line, col, err) {
  var detail = 'Message: ' + msg + '\nSource: ' + src + '\nLine: ' + line + '\n\n' + (err && err.stack ? err.stack : '');
  showError('JavaScript Error', detail);
  return false;
};

window.addEventListener('unhandledrejection', function(e) {
  var r = e.reason;
  var detail = r ? (r.stack || r.message || JSON.stringify(r)) : 'Unknown rejection';
  showError('Unhandled Promise Rejection', detail);
});

try {
  var root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(React.createElement(React.StrictMode, null, React.createElement(App)));
} catch(e) {
  showError('Startup Crash', e.stack || e.message || String(e));
}
